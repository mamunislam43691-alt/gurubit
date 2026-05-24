/**
 * Firebase Client Configuration
 * Frontend Firebase SDK setup for client-side operations
 */

// Firebase configuration
// Replace these values with your Firebase project settings
const firebaseConfig = {
  apiKey: "AIzaSyCnX58oQu4fxTwp6sZTkO3yPp6YjaUMBhg",
  authDomain: "sms-websit.firebaseapp.com",
  databaseURL: "https://sms-websit-default-rtdb.firebaseio.com",
  projectId: "sms-websit",
  storageBucket: "sms-websit.firebasestorage.app",
  messagingSenderId: "1050586773860",
  appId: "1:1050586773860:web:a78cf0fd6021f747c0e271",
  measurementId: "G-BEJLTG1B03"
};

// Check if Firebase is properly configured
const isFirebaseConfigured = firebaseConfig.apiKey !== "DEMO-API-KEY";

let auth, db;
let createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged;
let collection, doc, setDoc, getDoc, updateDoc, deleteDoc, query, where, getDocs, onSnapshot;

// Initialize Firebase asynchronously
let firebaseInitialized = false;

async function initializeFirebase() {
  if (firebaseInitialized) return;
  
  if (isFirebaseConfigured) {
    try {
      // Import Firebase modules
      const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js');
      const authModule = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
      const firestoreModule = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');

      // Initialize Firebase
      const app = initializeApp(firebaseConfig);

      // Initialize Firebase services
      auth = authModule.getAuth(app);
      db = firestoreModule.getFirestore(app);

      // Export auth functions
      createUserWithEmailAndPassword = authModule.createUserWithEmailAndPassword;
      signInWithEmailAndPassword = authModule.signInWithEmailAndPassword;
      signOut = authModule.signOut;
      onAuthStateChanged = authModule.onAuthStateChanged;

      // Export firestore functions
      collection = firestoreModule.collection;
      doc = firestoreModule.doc;
      setDoc = firestoreModule.setDoc;
      getDoc = firestoreModule.getDoc;
      updateDoc = firestoreModule.updateDoc;
      deleteDoc = firestoreModule.deleteDoc;
      query = firestoreModule.query;
      where = firestoreModule.where;
      getDocs = firestoreModule.getDocs;
      onSnapshot = firestoreModule.onSnapshot;

      firebaseInitialized = true;
      console.log('✅ Firebase initialized on client');
    } catch (error) {
      console.warn('⚠️  Firebase not configured properly:', error);
      setupMockFunctions();
    }
  } else {
    console.warn('⚠️  Firebase not configured. Using mock authentication.');
    console.warn('   Update firebaseConfig in firebase-config.js with your Firebase project settings');
    setupMockFunctions();
  }
}

function setupMockFunctions() {
  // Mock functions for development
  auth = null;
  db = null;
  createUserWithEmailAndPassword = async () => ({ user: { uid: 'mock-uid', email: 'demo@example.com', getIdToken: async () => 'mock-token' } });
  signInWithEmailAndPassword = async () => ({ user: { uid: 'mock-uid', email: 'demo@example.com', getIdToken: async () => 'mock-token' } });
  signOut = async () => {};
  onAuthStateChanged = (callback) => {
    // Call callback with null user initially
    setTimeout(() => callback(null), 0);
    return () => {}; // Return unsubscribe function
  };
  firebaseInitialized = true;
}

// Initialize immediately — await before auth operations
export const firebaseReady = initializeFirebase();

// Export Firebase services
export {
  auth,
  db,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  collection,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  getDocs,
  onSnapshot,
  isFirebaseConfigured
};
