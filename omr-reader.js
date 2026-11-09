/* OMR Reader for the 50-question Children's Retreat answer sheet (all language versions).
 * Finds the four black corner squares, straightens the page, and measures how dark each bubble is.
 * Pure browser JavaScript; no network. Exposes window.OMRReader. */
(function (global) {
  'use strict';

  // ---- Sheet layout, in PDF points measured from the top-left of the A4 page ----
  const PAGE_W = 595.276, PAGE_H = 841.89;
  const MARK = 30;                       // centre of each 16pt corner square is 30pt from both edges
  const L = 50, R = PAGE_W - 50, COLW = (R - L) / 3;
  const FIRST = 222, PITCH = 34.5, GAP = 19, RADIUS = 6.5;
  const COLS = [[1, 17], [18, 34], [35, 50]];
  const BUBBLES = [];                    // BUBBLES[q-1] = [[x,y] for A,B,C,D]
  COLS.forEach(([a, b], ci) => {
    const x0 = L + COLW * ci;
    for (let q = a; q <= b; q++) {
      const cy = FIRST + (q - a) * PITCH;
      BUBBLES[q - 1] = [0, 1, 2, 3].map(j => [x0 + 66 + j * GAP, cy]);
    }
  });
  const PAGE_MARKS = [[MARK, MARK], [PAGE_W - MARK, MARK], [PAGE_W - MARK, PAGE_H - MARK], [MARK, PAGE_H - MARK]]; // TL TR BR BL
  const HEADER = { x: 44, y: 88, w: 507, h: 74 };   // Name ... Sub-Centre lines
  const LAYOUT = { PAGE_W, PAGE_H, BUBBLES, RADIUS, QUESTIONS: 50, HEADER };

  // Decision thresholds on "fill" (0 = clean paper, 1 = solid ink), measured in the inner 65% of the bubble
  const T = { markMax: 0.42, markMin: 0.22, faint: 0.13, erasedRatio: 0.5 };

  // ---------- helpers ----------
  function toGray(canvas, maxSide) {
    const s = Math.min(1, maxSide / Math.max(canvas.width, canvas.height));
    const w = Math.max(1, Math.round(canvas.width * s)), h = Math.max(1, Math.round(canvas.height * s));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(canvas, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h).data;
    const g = new Uint8ClampedArray(w * h);
    for (let i = 0, p = 0; i < g.length; i++, p += 4) g[i] = (d[p] * 299 + d[p + 1] * 587 + d[p + 2] * 114) / 1000;
    return { g, w, h };
  }

  function adaptiveDark(img, win, C) {
    const { g, w, h } = img;
    const I = new Float64Array((w + 1) * (h + 1));
    for (let y = 0; y < h; y++) {
      let row = 0;
      for (let x = 0; x < w; x++) { row += g[y * w + x]; I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row; }
    }
    const m = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - win), y1 = Math.min(h, y + win + 1);
      for (let x = 0; x < w; x++) {
        const x0 = Math.max(0, x - win), x1 = Math.min(w, x + win + 1);
        const sum = I[y1 * (w + 1) + x1] - I[y0 * (w + 1) + x1] - I[y1 * (w + 1) + x0] + I[y0 * (w + 1) + x0];
        const mean = sum / ((y1 - y0) * (x1 - x0));
        if (g[y * w + x] < mean - C && g[y * w + x] < 170) m[y * w + x] = 1;
      }
    }
    return m;
  }

  function components(mask, w, h, maxArea) {
    const lab = new Int32Array(w * h), out = [];
    const stack = new Int32Array(w * h);
    let id = 0;
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i] || lab[i]) continue;
      id++; let sp = 0; stack[sp++] = i; lab[i] = id;
      let area = 0, sx = 0, sy = 0, minx = w, maxx = 0, miny = h, maxy = 0;
      while (sp) {
        const p = stack[--sp], x = p % w, y = (p - x) / w;
        area++; sx += x; sy += y;
        if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y;
        if (x > 0 && mask[p - 1] && !lab[p - 1]) { lab[p - 1] = id; stack[sp++] = p - 1; }
        if (x < w - 1 && mask[p + 1] && !lab[p + 1]) { lab[p + 1] = id; stack[sp++] = p + 1; }
        if (y > 0 && mask[p - w] && !lab[p - w]) { lab[p - w] = id; stack[sp++] = p - w; }
        if (y < h - 1 && mask[p + w] && !lab[p + w]) { lab[p + w] = id; stack[sp++] = p + w; }
      }
      if (area > maxArea) continue;
      out.push({ area, cx: sx / area, cy: sy / area, minx, maxx, miny, maxy, bw: maxx - minx + 1, bh: maxy - miny + 1 });
    }
    return out;
  }

  function solve(A, b) { // Gaussian elimination, n x n
    const n = b.length;
    for (let i = 0; i < n; i++) {
      let p = i; for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
      [A[i], A[p]] = [A[p], A[i]]; [b[i], b[p]] = [b[p], b[i]];
      if (Math.abs(A[i][i]) < 1e-12) return null;
      for (let r = i + 1; r < n; r++) { const f = A[r][i] / A[i][i]; for (let c = i; c < n; c++) A[r][c] -= f * A[i][c]; b[r] -= f * b[i]; }
    }
    const x = new Array(n);
    for (let i = n - 1; i >= 0; i--) { let s = b[i]; for (let c = i + 1; c < n; c++) s -= A[i][c] * x[c]; x[i] = s / A[i][i]; }
    return x;
  }
  function homography(src, dst) { // maps src -> dst
    const A = [], b = [];
    for (let i = 0; i < 4; i++) {
      const [x, y] = src[i], [u, v] = dst[i];
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
      A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
    }
    const h = solve(A, b); if (!h) return null;
    return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
  }
  const apply = (H, x, y) => { const z = H[6] * x + H[7] * y + H[8]; return [(H[0] * x + H[1] * y + H[2]) / z, (H[3] * x + H[4] * y + H[5]) / z]; };

  // ---------- 1. find corner squares ----------
  function findMarks(img) {
    const { w, h } = img, long = Math.max(w, h);
    const win = Math.max(10, Math.round(long * 0.03));
    const mask = adaptiveDark(img, win, 18);
    const comps = components(mask, w, h, long * long * 0.004);
    const minSide = long * 0.008, maxSide = long * 0.06;
    const cand = comps.filter(c => {
      if (c.minx <= 1 || c.miny <= 1 || c.maxx >= w - 2 || c.maxy >= h - 2) return false;
      const ar = c.bw / c.bh, fill = c.area / (c.bw * c.bh);
      return c.bw >= minSide && c.bh >= minSide && c.bw <= maxSide && c.bh <= maxSide && ar > 0.5 && ar < 2 && fill > 0.62;
    });
    if (cand.length < 4) return null;
    const corners = [[0, 0], [w, 0], [w, h], [0, h]];
    const pick = corners.map(([X, Y]) => cand.map(c => ({ c, d: Math.hypot(c.cx - X, c.cy - Y) })).sort((a, b) => a.d - b.d).slice(0, 4).map(o => o.c));
    let best = null;
    for (const a of pick[0]) for (const b of pick[1]) for (const c of pick[2]) for (const d of pick[3]) {
      const q = [a, b, c, d]; if (new Set(q).size < 4) continue;
      const areas = q.map(o => o.area), amax = Math.max(...areas), amin = Math.min(...areas);
      if (amax > amin * 7) continue;
      const side = (p, r) => Math.hypot(p.cx - r.cx, p.cy - r.cy);
      const top = side(a, b), bot = side(d, c), lef = side(a, d), rig = side(b, c);
      if (Math.min(top, bot, lef, rig) < long * 0.2) continue;
      const ratio = ((lef + rig) / 2) / ((top + bot) / 2);              // ~1.46 portrait, ~0.68 landscape
      const rr = Math.min(Math.abs(Math.log(ratio / 1.4618)), Math.abs(Math.log(ratio / 0.6841)));
      if (rr > 0.45) continue;
      // convex & clockwise
      const cross = (p, q2, r) => (q2.cx - p.cx) * (r.cy - q2.cy) - (q2.cy - p.cy) * (r.cx - q2.cx);
      const cr = [cross(a, b, c), cross(b, c, d), cross(c, d, a), cross(d, a, b)];
      if (!(cr.every(v => v > 0) || cr.every(v => v < 0))) continue;
      const spread = top + bot + lef + rig;                               // marks are the outermost squares
      // nothing square-ish and sizeable should sit outside the four corner marks
      const sgn = cr[0] > 0 ? 1 : -1;
      let outside = 0;
      for (const o of cand) {
        if (q.includes(o) || o.area < amin * 0.4) continue;
        const pts = [a, b, c, d];
        for (let e = 0; e < 4; e++) { if (sgn * cross(pts[e], pts[(e + 1) % 4], o) < 0) { outside++; break; } }
      }
      const score = rr * 0.5 + Math.log(amax / amin) * 0.5 - spread / long + outside;
      if (!best || score < best.score) best = { score, q };
    }
    return best ? best.q.map(o => [o.cx, o.cy]) : null;
  }

  // ---------- 2. straighten page ----------
  function rectify(img, Hpi, k) { // Hpi maps page points -> image pixels; output k px per point
    const W = Math.round(PAGE_W * k), Hh = Math.round(PAGE_H * k), out = new Uint8ClampedArray(W * Hh);
    const { g, w, h } = img;
    for (let v = 0; v < Hh; v++) {
      for (let u = 0; u < W; u++) {
        const [x, y] = apply(Hpi, u / k, v / k);
        const x0 = Math.floor(x), y0 = Math.floor(y);
        if (x0 < 0 || y0 < 0 || x0 >= w - 1 || y0 >= h - 1) { out[v * W + u] = 255; continue; }
        const fx = x - x0, fy = y - y0, i = y0 * w + x0;
        out[v * W + u] = (g[i] * (1 - fx) + g[i + 1] * fx) * (1 - fy) + (g[i + w] * (1 - fx) + g[i + w + 1] * fx) * fy;
      }
    }
    return { g: out, w: W, h: Hh, k };
  }

  function pct(arr, p) { const s = Array.from(arr).sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; }

  function ringScore(rec) { // how well printed bubble outlines line up (orientation check)
    const { g, w, k } = rec; let on = 0, off = 0, n = 0;
    for (const row of BUBBLES) for (const [bx, by] of row) {
      for (let t = 0; t < 16; t++) {
        const a = t / 16 * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
        const pOn = Math.round((by + s * RADIUS) * k) * w + Math.round((bx + c * RADIUS) * k);
        const pOff = Math.round((by + s * (RADIUS + 2.6)) * k) * w + Math.round((bx + c * (RADIUS + 2.6)) * k);
        on += g[pOn]; off += g[pOff]; n++;
      }
    }
    return (off - on) / n; // positive and large when outlines are where we expect
  }

  // ---------- 3. read bubbles ----------
  // How strongly a printed bubble outline sits at (px,py) in page points: outside ring lighter than the outline.
  const ANG = Array.from({ length: 24 }, (_, i) => [Math.cos(i / 24 * 2 * Math.PI), Math.sin(i / 24 * 2 * Math.PI)]);
  function ringAt(rec, px, py) {
    const { g, w, h, k } = rec; let on = 0, off = 0;
    for (const [c, s] of ANG) {
      const x1 = Math.round((px + c * RADIUS) * k), y1 = Math.round((py + s * RADIUS) * k);
      const x2 = Math.round((px + c * (RADIUS + 2.4)) * k), y2 = Math.round((py + s * (RADIUS + 2.4)) * k);
      if (x2 < 0 || y2 < 0 || x2 >= w || y2 >= h || x1 < 0 || y1 < 0 || x1 >= w || y1 >= h) return -1e9;
      on += g[y1 * w + x1]; off += g[y2 * w + x2];
    }
    return off - on;
  }
  // Paper is rarely flat in a photo: find where each row of printed bubbles really is (a few points around
  // the expected place), then let each bubble settle on its own outline.
  function locate(rec) {
    const pos = [];
    for (let q = 0; q < 50; q++) {
      const row = BUBBLES[q]; let best = { s: -1e18, dx: 0, dy: 0 };
      for (let dy = -4.5; dy <= 4.5; dy += 0.5) for (let dx = -4.5; dx <= 4.5; dx += 0.5) {
        let s = 0; for (const [bx, by] of row) s += ringAt(rec, bx + dx, by + dy);
        s -= (dx * dx + dy * dy) * 2;            // prefer the expected place when outlines are equally clear
        if (s > best.s) best = { s, dx, dy };
      }
      pos.push(row.map(([bx, by]) => {
        let b = { s: -1e18, x: bx + best.dx, y: by + best.dy };
        for (let ey = -1.5; ey <= 1.5; ey += 0.5) for (let ex = -1.5; ex <= 1.5; ex += 0.5) {
          const x = bx + best.dx + ex, y = by + best.dy + ey, s = ringAt(rec, x, y) - (ex * ex + ey * ey) * 4;
          if (s > b.s) b = { s, x, y };
        }
        return [b.x, b.y];
      }));
    }
    return pos;
  }

  function measure(rec, pos) {
    const { g, w, k } = rec, fills = [];
    const rin = RADIUS * 0.65 * k;
    for (let q = 0; q < 50; q++) {
      const row = pos[q];
      // local paper level: bright percentile of the whole row strip
      const xs = row[0][0] - 12, xe = row[3][0] + 12, ys = row[0][1] - 11, ye = row[0][1] + 16, strip = [];
      for (let y = Math.round(ys * k); y < Math.round(ye * k); y += 2) for (let x = Math.round(xs * k); x < Math.round(xe * k); x += 2) strip.push(g[y * w + x]);
      const rowPaper = Math.max(60, pct(strip, 0.85));
      const f = row.map(([bx, by]) => {
        const cx = bx * k, cy = by * k; let sum = 0, n = 0;
        // paper brightness right around this bubble (shadows in photos change it across a row)
        const ring = [];
        for (const [c, sn] of ANG) for (const rr of [RADIUS + 2.4, RADIUS + 3.4]) {
          const x = Math.round((bx + c * rr) * k), y = Math.round((by + sn * rr) * k); ring.push(g[y * w + x]);
        }
        const paper = Math.max(60, Math.min(rowPaper, pct(ring, 0.8)));
        for (let y = Math.floor(cy - rin); y <= Math.ceil(cy + rin); y++) for (let x = Math.floor(cx - rin); x <= Math.ceil(cx + rin); x++) {
          if ((x - cx) ** 2 + (y - cy) ** 2 > rin * rin) continue;
          sum += Math.max(0, Math.min(1, (paper - g[y * w + x]) / (paper * 0.85))); n++;
        }
        return sum / n;
      });
      fills.push(f);
    }
    return fills;
  }

  function decide(fills) {
    // adapt the "marked" threshold to the pen: half of a typical strong mark, within limits
    const tops = fills.map(f => Math.max(...f)).filter(v => v > 0.3).sort((a, b) => a - b);
    const typical = tops.length ? tops[Math.floor(tops.length / 2)] : 0.7;
    const markT = Math.max(T.markMin, Math.min(T.markMax, typical * 0.5));
    const resp = [], flags = [];
    fills.forEach(f => {
      const order = [0, 1, 2, 3].sort((a, b) => f[b] - f[a]);
      const top = f[order[0]], second = f[order[1]];
      const marked = order.filter(i => f[i] >= markT);
      if (marked.length >= 2) {
        // a much darker mark next to a light one is usually an erased answer
        if (second < top * T.erasedRatio && second < markT * 1.4) { resp.push(order[0]); flags.push(second >= T.faint * 2 ? 'erased' : null); }
        else { resp.push(null); flags.push('double'); }
      } else if (marked.length === 1) {
        resp.push(order[0]); flags.push(second >= Math.max(T.faint * 1.6, top * T.erasedRatio) ? 'erased' : null);
      } else if (top >= T.faint) {
        resp.push(null); flags.push('faint');
      } else { resp.push(null); flags.push(null); }
    });
    return { resp, flags, markT };
  }

  function crop(rec, box, scale) {
    const { g, w, k } = rec;
    const x0 = Math.round(box.x * k), y0 = Math.round(box.y * k), cw = Math.round(box.w * k), ch = Math.round(box.h * k);
    const c = document.createElement('canvas'); c.width = Math.round(cw * scale); c.height = Math.round(ch * scale);
    const tmp = document.createElement('canvas'); tmp.width = cw; tmp.height = ch;
    const t = tmp.getContext('2d'), id = t.createImageData(cw, ch);
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      const v = g[(y0 + y) * w + x0 + x], p = (y * cw + x) * 4; id.data[p] = id.data[p + 1] = id.data[p + 2] = v; id.data[p + 3] = 255;
    }
    t.putImageData(id, 0, 0);
    const ctx = c.getContext('2d'); ctx.imageSmoothingQuality = 'high'; ctx.drawImage(tmp, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.82);
  }

  // ---------- public ----------
  function readCanvas(canvas) {
    const img = toGray(canvas, 1800);
    const marks = findMarks(img);
    if (!marks) return { ok: false, error: 'Could not find the four black corner squares. Make sure all four corners are in the picture and not covered.' };
    let best = null;
    for (let rot = 0; rot < 4; rot++) {
      const imgPts = [0, 1, 2, 3].map(i => marks[(i + rot) % 4]);
      const Hpi = homography(PAGE_MARKS, imgPts); if (!Hpi) continue;
      const lowres = rectify(img, Hpi, 1);
      const s = ringScore(lowres);
      if (!best || s > best.s) best = { s, Hpi, rot };
    }
    if (!best || best.s < 12) return { ok: false, error: 'The page could not be lined up with the answer grid. Retake the photo flat and straight, with even light.' };
    const rec = rectify(img, best.Hpi, 2.4);
    const pos = locate(rec);
    const fills = measure(rec, pos);
    const { resp, flags, markT } = decide(fills);
    return {
      ok: true, resp, flags, fills, markT,
      alignment: Math.round(best.s), rotated: best.rot * 90,
      header: crop(rec, HEADER, 0.9),
      preview: crop(rec, { x: 0, y: 0, w: PAGE_W, h: PAGE_H }, 0.42)
    };
  }

  global.OMRReader = { LAYOUT, readCanvas, _internal: { decide, findMarks, toGray, homography } };
})(window);
