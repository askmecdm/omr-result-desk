/* Shared storage for OMR Result Desk.
 * - With window.OMR_FIREBASE set: sheets and shared settings live in Firebase (Firestore),
 *   every visitor signs in anonymously, the organiser signs in with Google.
 * - window.OMR_FAKE_DB (tests only): same behaviour against a small local test server.
 * - Otherwise: Store.mode === 'local' and the app keeps everything in this browser. */
(function (global) {
  'use strict';
  const listeners = new Set();
  const Store = {
    mode: 'local', ready: Promise.resolve(), uid: null, email: '', isAdmin: false, connected: true,
    sheets: new Map(), shared: { session: { open: true }, places: {}, subs: {}, bands: null },
    canAI: false, error: '',
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
  let emitT = null;
  const emit = () => { clearTimeout(emitT); emitT = setTimeout(() => listeners.forEach(f => { try { f() } catch (e) { console.error(e) } }), 30); };

  // ---------- encoding shared by both backends ----------
  const FL_ENC = { double: 'd', faint: 'f', erased: 'e' }, FL_DEC = { d: 'double', f: 'faint', e: 'erased' };
  Store.toDoc = (s, examId) => ({
    examId, by: s.by || Store.uid, byName: String(s.byName || '').slice(0, 60), file: String(s.file || '').slice(0, 120),
    name: String(s.name || '').slice(0, 80), age: (s.age === '' || s.age == null || isNaN(+s.age)) ? '' : +s.age,
    role: String(s.role || '').slice(0, 60), lang: String(s.lang || '').slice(0, 20), place: String(s.place || '').slice(0, 60), sub: String(s.sub || '').slice(0, 60),
    q: s.resp.slice(0, 50).map(v => v == null ? '-' : 'ABCD'[v]).join(''),
    g: s.flags.slice(0, 50).map(f => f ? FL_ENC[f] : '.').join(''),
    x: String(s.error || '').slice(0, 200), d: !!s.dupOk, auto: (s.auto || []).slice(0, 6)
  });
  Store.fromDoc = (id, d) => ({
    id, by: d.by, byName: d.byName || '', file: d.file || '', name: d.name || '', age: d.age ?? '', role: d.role || '', lang: d.lang || '', place: d.place || '', sub: d.sub || '',
    resp: String(d.q || '').split('').map(c => c === '-' ? null : 'ABCD'.indexOf(c)),
    flags: String(d.g || '').split('').map(c => FL_DEC[c] || null),
    error: d.x || undefined, dupOk: !!d.d, auto: d.auto || [], updated: d.t && d.t.toMillis ? d.t.toMillis() : (d.t || 0)
  });

  // ---------- Firebase backend ----------
  function startFirebase(cfg, examId) {
    const FB = global.FB;
    if (!FB) { Store.error = 'The shared database could not be loaded. Check the internet connection and reload.'; return Promise.resolve(); }
    const app = FB.initializeApp(cfg.config);
    // App Check (reCAPTCHA v3) proves requests come from this website; Firebase requires it for the AI reading.
    if ((cfg.fraudDefenseKey || cfg.recaptchaSiteKey) && FB.initializeAppCheck) {
      try {
        const provider = cfg.fraudDefenseKey ? new FB.ReCaptchaEnterpriseProvider(cfg.fraudDefenseKey) : new FB.ReCaptchaV3Provider(cfg.recaptchaSiteKey);
        FB.initializeAppCheck(app, { provider, isTokenAutoRefreshEnabled: true });
      }
      catch (e) { console.warn('App Check unavailable', e); }
    }
    const auth = FB.getAuth(app);
    let db;
    try { db = FB.initializeFirestore(app, { localCache: FB.persistentLocalCache({ tabManager: FB.persistentMultipleTabManager() }) }); }
    catch (e) { db = FB.initializeFirestore(app, {}); }
    const admins = (cfg.adminEmails || []).map(e => e.toLowerCase());
    let unsub = [];
    const listen = () => {
      unsub.forEach(u => u()); unsub = [];
      unsub.push(FB.onSnapshot(FB.query(FB.collection(db, 'sheets'), FB.where('examId', '==', examId)), snap => {
        snap.docChanges().forEach(ch => {
          if (ch.type === 'removed') Store.sheets.delete(ch.doc.id);
          else Store.sheets.set(ch.doc.id, Store.fromDoc(ch.doc.id, ch.doc.data({ serverTimestamps: 'estimate' })));
        });
        Store.connected = !snap.metadata.fromCache; emit();
      }, err => { Store.error = 'Could not read shared sheets: ' + err.message; emit(); }));
      unsub.push(FB.onSnapshot(FB.doc(db, 'shared', examId), snap => {
        const d = snap.data() || {};
        Store.shared = { session: d.session || { open: true }, places: d.places || {}, subs: d.subs || {}, bands: d.bands || null }; emit();
      }, err => { Store.error = 'Could not read shared settings: ' + err.message; emit(); }));
    };
    Store.saveSheet = s => FB.setDoc(FB.doc(db, 'sheets', s.id), { ...Store.toDoc(s, examId), t: FB.serverTimestamp() });
    Store.deleteSheet = id => FB.deleteDoc(FB.doc(db, 'sheets', id));
    Store.setShared = (key, value) => FB.setDoc(FB.doc(db, 'shared', examId), { [key]: value }, { merge: true });
    Store.deleteAll = async () => {
      const snap = await FB.getDocs(FB.query(FB.collection(db, 'sheets'), FB.where('examId', '==', examId)));
      let batch = FB.writeBatch(db), n = 0;
      for (const d of snap.docs) { batch.delete(d.ref); if (++n % 400 === 0) { await batch.commit(); batch = FB.writeBatch(db); } }
      await batch.commit();
      await FB.setDoc(FB.doc(db, 'shared', examId), { places: {}, subs: {} }, { merge: true });
    };
    Store.signInAdmin = async () => { const p = new FB.GoogleAuthProvider(); p.setCustomParameters({ prompt: 'select_account' }); await FB.signInWithPopup(auth, p); };
    Store.signOutAdmin = async () => { await FB.signOut(auth); await FB.signInAnonymously(auth); };
    // AI reading of the handwritten header (Firebase AI Logic, Gemini Developer API)
    if (cfg.ai && FB.getAI) {
      try {
        const ai = FB.getAI(app, { backend: new FB.GoogleAIBackend() });
        const S = FB.Schema;
        const model = FB.getGenerativeModel(ai, {
          model: cfg.ai.model || 'gemini-2.5-flash',
          generationConfig: {
            responseMimeType: 'application/json', temperature: 0,
            responseSchema: S.object({ properties: { name: S.string(), age: S.string(), class_or_occupation: S.string(), language: S.string(), place: S.string(), sub_centre: S.string() } })
          }
        });
        Store.canAI = true;
        Store.readHeader = async dataUrl => {
          const prompt = 'This image is the top strip of a quiz answer sheet. People fill these lines by hand (block letters or cursive; English, Hindi, Gujarati or Telugu): ' +
            'Name, Age (years), Class / Occupation, Language, Place, Sub-Centre. Return exactly what is handwritten on each line. ' +
            'Rules: keep the name in the script it is written in, with normal capitalisation; age as digits only; for Language return one of English, Hindi, Gujarati, Telugu ' +
            '(the language may be pre-printed after the label); write place and sub-centre in the script they are written in. ' +
            'Use "" for a line that is empty or unreadable. Never guess or invent text that is not on the sheet.';
          const res = await model.generateContent([prompt, { inlineData: { mimeType: 'image/jpeg', data: dataUrl.split(',')[1] } }]);
          return JSON.parse(res.response.text());
        };
      } catch (e) { console.warn('AI unavailable', e); }
    }
    return new Promise(resolve => {
      let first = true;
      FB.onAuthStateChanged(auth, async user => {
        if (!user) { try { await FB.signInAnonymously(auth); } catch (e) { Store.error = 'Could not connect to the shared database: ' + e.message; emit(); resolve(); } return; }
        Store.uid = user.uid; Store.email = (user.email || '').toLowerCase();
        Store.isAdmin = !!Store.email && admins.includes(Store.email) && user.emailVerified !== false;
        listen(); emit();
        if (first) { first = false; resolve(); }
      });
    });
  }

  // ---------- test backend (local test server, tests only) ----------
  function startFake(base, examId) {
    let uid = sessionStorage.getItem('fake-uid'); if (!uid) { uid = 'u' + Math.random().toString(36).slice(2, 8); sessionStorage.setItem('fake-uid', uid); }
    Store.uid = uid; Store.email = sessionStorage.getItem('fake-email') || ''; Store.isAdmin = Store.email === 'admin@example.com';
    const call = async (method, path, body) => {
      const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', 'x-uid': Store.uid, 'x-email': Store.email }, body: body ? JSON.stringify(body) : undefined });
      if (!r.ok) throw new Error((await r.text()) || r.statusText); return r.json();
    };
    const poll = async () => {
      try {
        const d = await call('GET', '/state?exam=' + encodeURIComponent(examId));
        const seen = new Set();
        for (const [id, doc] of Object.entries(d.sheets)) { seen.add(id); Store.sheets.set(id, Store.fromDoc(id, doc)); }
        for (const id of [...Store.sheets.keys()]) if (!seen.has(id)) Store.sheets.delete(id);
        const sh = d.shared || {}; Store.shared = { session: sh.session || { open: true }, places: sh.places || {}, subs: sh.subs || {}, bands: sh.bands || null };
        Store.connected = true; emit();
      } catch (e) { Store.connected = false; emit(); }
    };
    Store.saveSheet = async s => { await call('PUT', '/sheets/' + s.id, { ...Store.toDoc(s, examId), t: Date.now() }); poll(); };
    Store.deleteSheet = async id => { await call('DELETE', '/sheets/' + id); poll(); };
    Store.setShared = async (k, v) => { await call('PATCH', '/shared/' + encodeURIComponent(examId), { [k]: v }); poll(); };
    Store.deleteAll = async () => { await call('POST', '/deleteAll', { examId }); poll(); };
    Store.signInAdmin = async () => { sessionStorage.setItem('fake-email', 'admin@example.com'); Store.email = 'admin@example.com'; Store.isAdmin = true; emit(); };
    Store.signOutAdmin = async () => { sessionStorage.removeItem('fake-email'); Store.email = ''; Store.isAdmin = false; emit(); };
    if (global.OMR_FAKE_DB.ai) { Store.canAI = true; Store.readHeader = async () => { await new Promise(r => setTimeout(r, 200)); return global.OMR_FAKE_DB.ai; }; }
    setInterval(poll, 700);
    return poll();
  }

  const loadScript = src => new Promise((res, rej) => { const el = document.createElement('script'); el.src = src; el.onload = res; el.onerror = () => rej(new Error('load failed')); document.head.appendChild(el); });
  Store.configured = () => !!(global.OMR_FAKE_DB || (global.OMR_FIREBASE && global.OMR_FIREBASE.config && global.OMR_FIREBASE.config.apiKey));
  Store.start = examId => {
    const cfg = global.OMR_FIREBASE;
    if (global.OMR_FAKE_DB) { Store.mode = 'shared'; Store.ready = startFake(global.OMR_FAKE_DB.base, examId); }
    else if (Store.configured()) {
      Store.mode = 'shared';
      Store.ready = (global.FB ? Promise.resolve() : loadScript('vendor/firebase-bundle.js'))
        .then(() => startFirebase(cfg, examId))
        .catch(() => { Store.error = 'The shared database could not be loaded. Check the internet connection and reload.'; emit(); });
    }
    return Store.ready;
  };
  global.Store = Store;
})(window);
