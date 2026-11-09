/* Shared results (Firebase) for omr.blankfil.com. Set OMR_FIREBASE to null to keep every computer separate. */
window.OMR_FIREBASE = {
  config: {
    apiKey: "AIzaSyAwLO_x-l4_kKoIyKDpHJ5_5K-sQ9InrEg",
    authDomain: "children-retreat.firebaseapp.com",
    projectId: "children-retreat",
    storageBucket: "children-retreat.firebasestorage.app",
    messagingSenderId: "581299568816",
    appId: "1:581299568816:web:6cbf9c91e94352e100bb75"
  },
  adminEmails: ["askmecdm@gmail.com"],
  fraudDefenseKey: "6LcOzhcuAAAAAFWoHuf4mRcVQ55yLe6C7wSXHvye",   // Fraud Defense (reCAPTCHA Enterprise) key registered in App Check
  ai: { model: "gemini-2.5-flash" }   // remove this line to switch off reading handwriting
};
