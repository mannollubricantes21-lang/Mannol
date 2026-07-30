// =====================================================
// Firebase Configuration EXAMPLE
// =====================================================
// Copy this file to firebase-config.js and fill in your credentials.
//
// Steps:
// 1. Go to https://console.firebase.google.com
// 2. Create a project (or use an existing one)
// 3. Add a Web App (</> icon) and copy the configuration
// 4. Replace the values below
// 5. Enable Authentication → Email/Password
// 6. Create Cloud Firestore (production mode)
// 7. Enable Storage for images
// =====================================================

export const firebaseConfig = {
  apiKey: "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  authDomain: "tu-proyecto.firebaseapp.com",
  projectId: "tu-proyecto-id",
  storageBucket: "tu-proyecto-id.appspot.com",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:abcdef0123456789",
};

export const isFirebaseConfigured =
  firebaseConfig.apiKey &&
  !firebaseConfig.apiKey.startsWith("AIzaSyXXX") &&
  firebaseConfig.projectId !== "tu-proyecto-id";
