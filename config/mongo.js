/**
 * MongoDB Connection Manager
 * Supports multiple database connections for load distribution.
 * Primary connection uses the default MONGODB_URI.
 * Additional databases are configured via config/databases.json.
 */

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

const DB_CONFIG_PATH = path.join(__dirname, 'databases.json');

// Event emitter so server.js can react when DB becomes ready
const dbEvents = new EventEmitter();
dbEvents.setMaxListeners(20);

// ── Connection pool ─────────────────────────────────────────────────────────
// Map<dbId, { conn, isConnected, keepAliveInterval, config }>
const _connections = new Map();
let _primaryId = 'db_primary';

// ── Config persistence ──────────────────────────────────────────────────────
function loadDbConfig() {
  try {
    if (fs.existsSync(DB_CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(DB_CONFIG_PATH, 'utf8'));
    }
  } catch (_) {}
  return { databases: [] };
}

function saveDbConfig(cfg) {
  fs.writeFileSync(DB_CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf8');
}

function getDbList() {
  return loadDbConfig().databases || [];
}

function getDbConfig(id) {
  return getDbList().find(d => d.id === id) || null;
}

function addDbConfig(entry) {
  const cfg = loadDbConfig();
  const exists = cfg.databases.find(d => d.id === entry.id);
  if (exists) {
    Object.assign(exists, entry);
  } else {
    entry.createdAt = new Date().toISOString();
    cfg.databases.push(entry);
  }
  saveDbConfig(cfg);
  // Keep env in sync if primary URI was added/updated
  if ((entry.isDefault || entry.id === _primaryId) && entry.uri && entry.uri.trim()) {
    process.env.MONGODB_URI = entry.uri.trim();
  }
  return entry;
}

function updateDbConfig(id, patch) {
  const cfg = loadDbConfig();
  const db = cfg.databases.find(d => d.id === id);
  if (!db) return null;
  Object.assign(db, patch);
  saveDbConfig(cfg);
  // Keep env in sync if primary URI was updated
  if ((db.isDefault || id === _primaryId) && patch.uri && patch.uri.trim()) {
    process.env.MONGODB_URI = patch.uri.trim();
  }
  return db;
}

function removeDbConfig(id) {
  const cfg = loadDbConfig();
  cfg.databases = cfg.databases.filter(d => d.id !== id);
  if (cfg.databases.length > 0 && !_connections.has(id)) {
    // ensure at least one default
    const hasDefault = cfg.databases.some(d => d.isDefault);
    if (!hasDefault) cfg.databases[0].isDefault = true;
  }
  saveDbConfig(cfg);
}

function setPrimaryDb(id) {
  const cfg = loadDbConfig();
  cfg.databases.forEach(d => { d.isDefault = d.id === id; });
  _primaryId = id;
  saveDbConfig(cfg);
}

// ── Connection helpers ──────────────────────────────────────────────────────
const BASE_OPTS = {
  maxPoolSize: parseInt(process.env.MONGODB_POOL_SIZE || '50', 10),
  minPoolSize: 5,
  serverSelectionTimeoutMS: 15000,
  socketTimeoutMS: 90000,
  connectTimeoutMS: 15000,
  heartbeatFrequencyMS: 20000,
  retryWrites: true,
  retryReads: true,
  family: 4
};

function _setupEvents(conn, dbId) {
  // conn can be a Mongoose instance or a connection object
  const target = conn.connection || conn;
  target.on('error', (err) => {
    const info = _connections.get(dbId);
    if (info) info.isConnected = false;
    console.error(`❌ MongoDB [${dbId}] error:`, err.message);
  });
  target.on('disconnected', () => {
    const info = _connections.get(dbId);
    if (info) info.isConnected = false;
    console.warn(`⚠️  MongoDB [${dbId}] disconnected.`);
  });
  target.on('reconnected', () => {
    const info = _connections.get(dbId);
    if (info) info.isConnected = true;
    console.log(`✅ MongoDB [${dbId}] reconnected`);
  });
  target.on('connected', () => {
    const info = _connections.get(dbId);
    if (info) info.isConnected = true;
  });
}

function _startKeepAlive(conn, dbId) {
  const info = _connections.get(dbId);
  if (!info) return;
  if (info.keepAliveInterval) clearInterval(info.keepAliveInterval);
  const target = conn.connection || conn;
  info.keepAliveInterval = setInterval(async () => {
    if (target.readyState === 1) {
      try { await target.db.admin().ping(); } catch (_) {}
    }
  }, 30000);
  if (info.keepAliveInterval.unref) info.keepAliveInterval.unref();
}

/**
 * Connect to a specific database by config entry.
 * Uses a dedicated Mongoose instance to avoid conflicts.
 */
async function connectSingle(entry) {
  const dbId = entry.id;
  const existing = _connections.get(dbId);
  if (existing && existing.isConnected && existing.conn.readyState === 1) {
    return existing.conn;
  }

  const uri = entry.uri || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/gurubit';
  const dbName = entry.dbName || 'gurubit';

  // Create a dedicated Mongoose instance for this connection
  const instance = new mongoose.Mongoose();
  instance.set('strictQuery', true);
  instance.set('bufferCommands', false);

  _connections.set(dbId, {
    conn: instance,
    isConnected: false,
    keepAliveInterval: null,
    config: entry
  });

  _setupEvents(instance, dbId);

  await instance.connect(uri, { ...BASE_OPTS, dbName });

  // Register all schemas on this connection
  const { schemas, COLLECTIONS } = require('../models');
  for (const [name, schema] of Object.entries(schemas)) {
    if (!instance.models[name]) {
      try { instance.model(name, schema); } catch (_) {}
    }
  }

  const info = _connections.get(dbId);
  if (info) {
    info.isConnected = true;
    info.config = entry;
  }

  _startKeepAlive(instance, dbId);
  console.log(`✅ MongoDB [${dbId}] connected → ${dbName}`);

  // Emit event for primary connection so server.js can trigger store loading
  if (dbId === _primaryId || entry.isDefault) {
    // Also keep process.env in sync so other modules can read it
    if (uri && uri !== 'mongodb://127.0.0.1:27017/gurubit') {
      process.env.MONGODB_URI = uri;
    }
    dbEvents.emit('primaryConnected', { uri, dbName });
  }

  return instance;
}

/**
 * Connect to all active databases from config.
 * Primary always uses the default mongoose instance.
 */
async function connectAllDatabases() {
  const list = getDbList().filter(d => d.active !== false);

  // Find default / primary from config
  const primary = list.find(d => d.isDefault) || list[0] || { id: 'db_primary' };
  _primaryId = primary.id;

  // Always connect primary first using default mongoose instance
  const primaryConn = await connectMongo();

  // If connectMongo returned null (no URI), skip — admin will configure later
  if (!primaryConn) {
    return null;
  }

  // If config primary ID differs from the default 'db_primary', fix the map entry
  if (_primaryId !== 'db_primary' && _connections.has('db_primary')) {
    const legacyEntry = _connections.get('db_primary');
    _connections.delete('db_primary');
    _connections.set(_primaryId, legacyEntry);
  }

  if (list.length <= 1) {
    return mongoose.connection;
  }

  // Connect additional databases (skip the primary, already connected via connectMongo)
  const additional = list.filter(d => d.id !== _primaryId && d.active !== false);
  if (additional.length > 0) {
    const results = await Promise.allSettled(additional.map(d => connectSingle(d)));
    const connected = results.filter(r => r.status === 'fulfilled').length;
    console.log(`✅ MongoDB: ${connected + 1}/${list.length} databases connected (1 primary + ${connected} additional)`);
  } else {
    console.log('✅ MongoDB: 1 primary database connected');
  }

  return mongoose.connection;
}

// ── Legacy single connection (backward compat) ──────────────────────────────
let _isConnected = false;
let _keepAliveInterval = null;

function _setupEventHandlers() {
  mongoose.connection.on('error', (err) => {
    console.error('❌ MongoDB connection error:', err.message);
    _isConnected = false;
  });
  mongoose.connection.on('disconnected', () => {
    _isConnected = false;
    console.warn('⚠️  MongoDB disconnected. Reconnecting…');
  });
  mongoose.connection.on('reconnected', () => {
    _isConnected = true;
    console.log('✅ MongoDB reconnected');
  });
  mongoose.connection.on('connected', () => {
    _isConnected = true;
    console.log('✅ MongoDB connected');
  });
}

function _startKeepAliveLegacy() {
  if (_keepAliveInterval) clearInterval(_keepAliveInterval);
  _keepAliveInterval = setInterval(async () => {
    if (mongoose.connection.readyState === 1) {
      try { await mongoose.connection.db.admin().ping(); } catch (_) {}
    }
  }, 30000);
  if (_keepAliveInterval.unref) _keepAliveInterval.unref();
}

/**
 * Connect using the default mongoose instance (backward compat).
 */
async function connectMongo() {
  if (_isConnected && mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  // Also check databases.json primary entry for a saved URI
  const dbCfg = loadDbConfig();
  const primaryCfg = dbCfg.databases && dbCfg.databases.find(d => d.isDefault || d.id === 'db_primary');
  if (primaryCfg && primaryCfg.uri && primaryCfg.uri.trim()) {
    process.env.MONGODB_URI = primaryCfg.uri.trim();
  }

  const uri =
    process.env.MONGODB_URI ||
    process.env.MONGO_URI ||
    process.env.MONGO_URL ||
    process.env.DATABASE_URL ||
    '';

  // If no URI configured at all, skip connection attempt — admin must set it first
  if (!uri) {
    console.warn('⚠️  No MongoDB URI configured. Set MONGODB_URI in environment or via admin panel.');
    return null;
  }

  const dbName =
    process.env.MONGODB_DB ||
    (() => {
      try {
        const u = new URL(uri);
        const p = u.pathname.replace(/^\//, '');
        return p || 'gurubit';
      } catch (_) {
        return 'gurubit';
      }
    })();

  mongoose.set('strictQuery', true);
  mongoose.set('bufferCommands', false);

  _setupEventHandlers();

  await mongoose.connect(uri, {
    ...BASE_OPTS,
    dbName
  });

  _isConnected = true;
  _startKeepAliveLegacy();

  // Emit event so server.js can trigger store loading if not done yet
  dbEvents.emit('primaryConnected', { uri, dbName });

  // Also register as primary in multi-db map
  _connections.set(_primaryId, {
    conn: mongoose,
    isConnected: true,
    keepAliveInterval: _keepAliveInterval,
    config: { id: _primaryId, name: 'Primary', uri, dbName, active: true, isDefault: true }
  });

  return mongoose.connection;
}

function isMongoConnected() {
  // Check primary connection from multi-db map
  const primary = _connections.get(_primaryId);
  if (primary && primary.isConnected && primary.conn.readyState === 1) return true;
  // Fallback: check the default mongoose connection directly
  if (_isConnected && mongoose.connection.readyState === 1) return true;
  // Also check if mongoose connection is ready even if flag wasn't set
  if (mongoose.connection.readyState === 1) return true;
  return false;
}

function isMongoConfigured() {
  return isMongoConnected();
}

/**
 * Get a specific Mongoose instance by database ID.
 * Falls back to default mongoose if id not found.
 */
function getConn(dbId) {
  const info = _connections.get(dbId || _primaryId);
  return info ? info.conn : mongoose;
}

/**
 * Get the primary/default Mongoose instance.
 */
function getPrimaryConn() {
  return getConn(_primaryId);
}

/**
 * Get all active connection IDs.
 */
function getActiveConnIds() {
  const ids = [];
  _connections.forEach((info, id) => {
    if (info.isConnected) ids.push(id);
  });
  return ids;
}

/**
 * Get connection info for a specific database.
 */
function getConnInfo(dbId) {
  const info = _connections.get(dbId);
  if (!info) return null;
  return {
    id: dbId,
    name: info.config?.name || dbId,
    connected: info.isConnected,
    dbName: info.config?.dbName || '',
    readyState: info.conn.readyState
  };
}

/**
 * Get all connection statuses.
 */
function getAllConnStatus() {
  const statuses = [];
  _connections.forEach((info, id) => {
    statuses.push({
      id,
      name: info.config?.name || id,
      connected: info.isConnected,
      dbName: info.config?.dbName || '',
      readyState: info.conn.readyState,
      isDefault: id === _primaryId
    });
  });
  return statuses;
}

async function ensureIndexes() {
  const { syncIndexes, schemas, COLLECTIONS } = require('../models');

  // Sync indexes on primary
  await syncIndexes();

  // Sync indexes on all additional connections
  for (const [dbId, info] of _connections) {
    if (info.conn === mongoose) continue; // already done above
    if (!info.isConnected) continue;
    for (const [name, schema] of Object.entries(schemas)) {
      try {
        const Model = info.conn.models[name] || info.conn.model(name, schema);
        await Model.syncIndexes();
      } catch (_) {}
    }
  }
}

/**
 * Disconnect a specific database.
 */
async function disconnectSingle(dbId) {
  const info = _connections.get(dbId);
  if (!info) return;
  if (info.keepAliveInterval) {
    clearInterval(info.keepAliveInterval);
    info.keepAliveInterval = null;
  }
  // Don't disconnect the default mongoose instance here — use disconnectMongo for that
  if (info.conn !== mongoose) {
    await info.conn.disconnect().catch(() => {});
  }
  info.isConnected = false;
  _connections.delete(dbId);
}

async function disconnectMongo() {
  // Disconnect all multi-db connections
  for (const [id, info] of _connections) {
    if (info.keepAliveInterval) clearInterval(info.keepAliveInterval);
    if (info.conn !== mongoose) {
      await info.conn.disconnect().catch(() => {});
    }
  }
  _connections.clear();

  // Also disconnect default mongoose
  if (_keepAliveInterval) {
    clearInterval(_keepAliveInterval);
    _keepAliveInterval = null;
  }
  if (_isConnected) {
    await mongoose.disconnect();
    _isConnected = false;
  }
}

module.exports = {
  // Default mongoose instance (backward compat)
  mongoose,
  connectMongo,
  isMongoConnected,
  isMongoConfigured,
  ensureIndexes,
  disconnectMongo,

  // Multi-database support
  connectAllDatabases,
  connectSingle,
  disconnectSingle,
  getConn,
  getPrimaryConn,
  getActiveConnIds,
  getConnInfo,
  getAllConnStatus,

  // Config management
  loadDbConfig,
  saveDbConfig,
  getDbList,
  getDbConfig,
  addDbConfig,
  updateDbConfig,
  removeDbConfig,
  setPrimaryDb,

  // Events
  dbEvents
};
