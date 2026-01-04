import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Fill from Vite environment variables (import.meta.env)
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyC_jN6nRNibbqmYOGEljBzvAmK-hPLjF4E',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'hasod-41a23.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'hasod-41a23',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'hasod-41a23.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '106788248270',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:106788248270:web:0aba867824d460e0f24e9f'
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();
export const db = getFirestore(app);

// Set auth persistence to LOCAL (persists across browser sessions)
setPersistence(auth, browserLocalPersistence).catch((error) => {
  console.error('Error setting persistence:', error);
});

// Use popup for better local development experience
export async function signInWithGoogle() {
  try {
    console.log('🔐 Starting Google sign-in with popup...');
    const result = await signInWithPopup(auth, provider);
    console.log('✅ Sign-in successful!', result.user.email);
    return result;
  } catch (error: any) {
    console.error('❌ Sign-in error:', error);
    throw error;
  }
}

export function signOut() {
  return firebaseSignOut(auth);
}

export { onAuthStateChanged };
