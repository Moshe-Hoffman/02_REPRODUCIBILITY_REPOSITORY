/*
 * Public-release Firebase configuration template.
 *
 * The deployed project's operational identifiers were removed. Supply a new
 * Firebase web-app configuration and appropriate security rules before using
 * this task for data collection.
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.17.2/firebase-app.js';
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/9.17.2/firebase-auth.js';
import {
  getFirestore,
  enableIndexedDbPersistence
} from 'https://www.gstatic.com/firebasejs/9.17.2/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "REPLACE_WITH_YOUR_FIREBASE_API_KEY",
  authDomain: "REPLACE_WITH_YOUR_FIREBASE_AUTH_DOMAIN",
  projectId: "REPLACE_WITH_YOUR_FIREBASE_PROJECT_ID",
  storageBucket: "REPLACE_WITH_YOUR_FIREBASE_STORAGE_BUCKET",
  messagingSenderId: "REPLACE_WITH_YOUR_FIREBASE_MESSAGING_SENDER_ID",
  appId: "REPLACE_WITH_YOUR_FIREBASE_APP_ID"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

enableIndexedDbPersistence(db, { synchronizeTabs: true }).catch(err => {
  if (err.code === 'failed-precondition') {
    console.log('Persistence disabled in this tab because another tab owns it.');
  } else if (err.code === 'unimplemented') {
    console.log('This browser does not support IndexedDB persistence.');
  }
});

let uid;
const authReady = new Promise((resolve, reject) => {
  signInAnonymously(auth).catch(reject);
  onAuthStateChanged(auth, user => {
    if (user) {
      uid = user.uid;
      resolve(uid);
    }
  });
});

export { db, auth, authReady };
