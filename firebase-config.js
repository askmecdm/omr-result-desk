/* Shared results (Firebase). Leave OMR_FIREBASE as null to keep every computer separate.
   To share results between all scanners, paste your Firebase web app config and the
   organiser's Google email(s):

window.OMR_FIREBASE = {
  config: { apiKey: "...", authDomain: "...", projectId: "...", storageBucket: "...", messagingSenderId: "...", appId: "..." },
  adminEmails: ["organiser@gmail.com"],
  recaptchaSiteKey: "...",            // reCAPTCHA v3 site key registered in App Check
  ai: { model: "gemini-2.5-flash" }   // remove this line to switch off reading handwriting
};
*/
window.OMR_FIREBASE = null;
