import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase
const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const defaultDb = getFirestore(app);
export const isCustomDatabase = Boolean(
  firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)'
);
export const firestoreDatabaseId = firebaseConfig.firestoreDatabaseId || '(default)';

export const db = isCustomDatabase
  ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
  : defaultDb;

export default app;
