/**
 * Firebase Configuration
 * Backend Firebase Admin SDK setup for server-side operations
 */

const admin = require('firebase-admin');

const fs = require('fs');
const path = require('path');

// Check if Firebase should be initialized
const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');
const hasServiceAccountFile = fs.existsSync(serviceAccountPath);
const shouldInitializeFirebase = process.env.FIREBASE_SERVICE_ACCOUNT || hasServiceAccountFile || process.env.NODE_ENV === 'production';
const muteWarnings = process.env.MUTE_FIREBASE_WARNINGS === 'true';

if (shouldInitializeFirebase) {
  try {
    // Initialize Firebase Admin SDK
    // Service account key should be stored in environment variable or secure location
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT 
      ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
      : require('./serviceAccountKey.json'); // Fallback to local file

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: process.env.FIREBASE_DATABASE_URL
    });

    console.log('✅ Firebase Admin SDK initialized');
  } catch (error) {
    if (!muteWarnings) {
      console.warn('⚠️  Firebase not configured. Running in development mode without Firebase.');
      console.warn('   To enable Firebase, set FIREBASE_SERVICE_ACCOUNT in .env file');
    }
  }
} else {
  if (!muteWarnings) {
    console.warn('⚠️  Firebase not configured. Running in development mode.');
    console.warn('   To enable Firebase, set FIREBASE_SERVICE_ACCOUNT in .env file');
  }
}

// In-memory mock Firestore (persists users/sessions during dev server run)
const createMockFirestore = () => {
  const store = new Map();
  const docKey = (col, id) => `${col}/${id}`;

  const chainable = {
    _col: null,
    where() { return this; },
    orderBy() { return this; },
    limit() { return this; },
    async get() {
      const prefix = `${this._col}/`;
      const docs = [];
      for (const [key, data] of store.entries()) {
        if (key.startsWith(prefix)) {
          const id = key.slice(prefix.length);
          docs.push({
            id,
            data: () => data,
            ref: {
              id,
              get: async () => ({ exists: true, data: () => store.get(docKey(this._col, id)), id }),
              update: async (patch) => {
                const key = docKey(this._col, id);
                const prev = store.get(key) || { id };
                store.set(key, { ...prev, ...patch, id });
              }
            }
          });
        }
      }
      return {
        size: docs.length,
        empty: docs.length === 0,
        forEach: (fn) => docs.forEach(fn),
        docs
      };
    }
  };

  const mockCollection = (name) => {
    const col = {
      _name: name,
      doc: (id) => ({
        id,
        get: async () => {
          const data = store.get(docKey(name, id));
          return {
            exists: !!data,
            data: () => data,
            id
          };
        },
        set: async (data) => {
          store.set(docKey(name, id), { ...data, id });
        },
        update: async (patch) => {
          const key = docKey(name, id);
          const prev = store.get(key) || { id };
          store.set(key, { ...prev, ...patch, id });
        },
        delete: async () => {
          store.delete(docKey(name, id));
        }
      }),
      add: async (data) => {
        const id = `mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        store.set(docKey(name, id), { ...data, id });
        return { id };
      },
      where() {
        const c = Object.create(chainable);
        c._col = name;
        return c;
      },
      orderBy() {
        const c = Object.create(chainable);
        c._col = name;
        return c;
      },
      limit() {
        const c = Object.create(chainable);
        c._col = name;
        return c;
      },
      get: async () => {
        const c = Object.create(chainable);
        c._col = name;
        return c.get();
      }
    };
    return col;
  };

  return {
    collection: mockCollection,
    runTransaction: async (fn) => {
      try {
        return await fn({
          get: async (ref) => ref.get(),
          update: (ref, data) => {},
          set: (ref, data) => {},
          delete: (ref) => {}
        });
      } catch (e) {
        console.error('Mock transaction error:', e);
        throw e;
      }
    },
    batch: () => ({
      set: () => {},
      update: () => {},
      delete: () => {},
      commit: async () => {}
    })
  };
};

// Firestore database instance
const db = shouldInitializeFirebase && admin.apps.length > 0 
  ? admin.firestore() 
  : createMockFirestore();

/** Decode Firebase ID token payload in dev when Admin SDK is unavailable */
function decodeIdTokenPayload(token) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid token format');
  const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const payload = JSON.parse(Buffer.from(base64, 'base64').toString('utf8'));
  return {
    uid: payload.user_id || payload.sub,
    email: payload.email,
    email_verified: payload.email_verified === true
  };
}

// Firebase Auth instance
const rawAuth = shouldInitializeFirebase && admin.apps.length > 0
  ? admin.auth()
  : null;

const auth = rawAuth
  ? {
      createUser: (...args) => rawAuth.createUser(...args),
      verifyIdToken: async (token) => {
        if (typeof token === 'string' && token.startsWith('guest.')) {
          const uid = token.slice(6);
          return {
            uid,
            email: `${uid}@guest.local`,
            email_verified: true
          };
        }
        return rawAuth.verifyIdToken(token);
      },
      getUser: (...args) => rawAuth.getUser(...args),
      createCustomToken: (...args) => rawAuth.createCustomToken(...args),
      revokeRefreshTokens: (...args) => rawAuth.revokeRefreshTokens(...args)
    }
  : {
      createUser: async () => ({ uid: 'mock-uid', emailVerified: false }),
      verifyIdToken: async (token) => {
        if (process.env.NODE_ENV === 'production') {
          throw new Error('Firebase Admin is not configured');
        }
        if (typeof token === 'string' && token.startsWith('guest.')) {
          const uid = token.slice(6);
          return {
            uid,
            email: `${uid}@guest.local`,
            email_verified: true
          };
        }
        return decodeIdTokenPayload(token);
      },
      getUser: async (uid) => ({
        uid,
        emailVerified: false
      }),
      createCustomToken: async () => 'mock-token',
      revokeRefreshTokens: async () => {}
    };

// Collections
const collections = {
  users: db.collection('users'),
  sessions: db.collection('sessions'),
  countries: db.collection('countries'),
  servers: db.collection('servers'),
  phoneNumbers: db.collection('phoneNumbers'),
  platforms: db.collection('platforms'),
  smsMessages: db.collection('smsMessages'),
  withdrawalRequests: db.collection('withdrawalRequests'),
  apiKeys: db.collection('apiKeys'),
  guruPosts: db.collection('guruPosts'),
  guruGroups: db.collection('guruGroups'),
  guruGroupMessages: db.collection('guruGroupMessages'),
  guruFollows: db.collection('guruFollows'),
  guruReports: db.collection('guruReports'),
  guruSettings: db.collection('guruSettings')
};

module.exports = {
  admin,
  db,
  auth,
  collections,
  isFirebaseConfigured: shouldInitializeFirebase && admin.apps.length > 0
};
