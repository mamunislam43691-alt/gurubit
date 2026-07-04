/**
 * GurubBIT DB Module (MongoDB via Mongoose)
 *
 * Multi-database support: distributes sharded collections across configured databases.
 * Config collections (countries, servers, etc.) stay on the primary database.
 *
 * Supported helpers:
 *   collections.<name>.doc(id).get()        -> { exists, data, id }
 *   collections.<name>.doc(id).set(obj)
 *   collections.<name>.doc(id).update(patch)
 *   collections.<name>.doc(id).delete()
 *   collections.<name>.add(obj)             -> { id }
 *   collections.<name>.get()                -> SnapshotLike { docs, size, empty, forEach }
 *   collections.<name>.where(f, op, v).orderBy(f, dir).limit(n).select(f1,f2,...).get()
 *   db.collection(name)...   (raw access)
 *   db.runTransaction(fn)
 *   db.batch() -> { set, update, delete, commit }
 */
require('../models');

const {
  mongoose,
  isMongoConnected,
  getConn,
  getPrimaryConn,
  getActiveConnIds,
  getDbList,
  loadDbConfig
} = require('./mongo');

const { models, schemas, COLLECTIONS } = require('../models');

// ── Sharding config ────────────────────────────────────────────────────────
// Collections that are NOT sharded (stay on primary only)
const CONFIG_COLLECTIONS = new Set([
  COLLECTIONS.countries,
  COLLECTIONS.servers,
  COLLECTIONS.platforms,
  COLLECTIONS.costRates,
  COLLECTIONS.appConfig,
  COLLECTIONS.smsProviders,
  COLLECTIONS.adminStaff,
  COLLECTIONS.adminSessions,
  COLLECTIONS.broadcasts,
  COLLECTIONS.announcements
]);

/**
 * Check if a collection should be sharded across databases.
 */
function isSharded(name) {
  return !CONFIG_COLLECTIONS.has(name);
}

/**
 * Get all active database IDs (for sharding).
 * Only returns databases that are actually connected.
 * Falls back to primary only if no multi-db configured.
 */
function _getShardIds() {
  const list = getDbList().filter(d => d.active !== false);
  if (list.length <= 1) return [list[0]?.id || 'db_primary'];

  // Only include databases that are actually connected
  const { getConnInfo } = require('./mongo');
  const connected = list.filter(d => {
    const info = getConnInfo(d.id);
    return info && info.connected;
  });

  if (connected.length === 0) return ['db_primary'];
  return connected.map(d => d.id);
}

/**
 * Check if a specific database connection is ready.
 */
function _isConnReady(dbId) {
  const { getConnInfo } = require('./mongo');
  const info = getConnInfo(dbId);
  return info && info.connected;
}

/**
 * Hash a string to a consistent shard index.
 */
function _shardIndex(id, shardCount) {
  let hash = 0;
  const str = String(id);
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % shardCount;
}

/**
 * Get the Mongoose model for a collection, optionally on a specific connection.
 * Registers the model schema on the target connection if not already registered.
 */
function _modelOnConn(name, connId) {
  if (!COLLECTIONS[name]) throw new Error(`Unknown collection: ${name}`);
  const conn = connId ? getConn(connId) : mongoose;
  // Register model on this connection if not already registered
  if (!conn.models[name]) {
    const schema = schemas[name];
    if (schema) {
      conn.model(name, schema);
    }
  }
  return conn.models[name] || models[name];
}

function _model(name) {
  return _modelOnConn(name);
}

/**
 * Get the correct model for a document based on its ID and collection.
 * If target shard isn't connected, falls back to primary.
 */
function _modelForDoc(name, docId) {
  if (!isSharded(name)) {
    return _modelOnConn(name); // Primary connection
  }
  const shardIds = _getShardIds();
  if (shardIds.length <= 1) return _modelOnConn(name, shardIds[0]);
  const idx = _shardIndex(docId, shardIds.length);
  const targetId = shardIds[idx];

  // If target isn't ready, fall back to primary
  if (!_isConnReady(targetId)) {
    return _modelOnConn(name); // Primary
  }
  return _modelOnConn(name, targetId);
}

const _docCache = new Map();

function _toSnapshotDoc(plain, id, collectionName) {
  if (!plain) return { exists: false, id, data: () => ({}) };
  const data = { ...plain };
  data.id = id;
  return {
    exists: true,
    id,
    data: () => data,
    ref: _makeDocRef(collectionName, id)
  };
}

function _stripInternal(doc) {
  if (!doc) return doc;
  const out = { ...doc };
  delete out.__v;
  if (out._id) out.id = out._id;
  return out;
}

function _toFilter(field, op, value) {
  switch (op) {
    case '==': return { [field]: value };
    case '!=': return { [field]: { $ne: value } };
    case '>':  return { [field]: { $gt: value } };
    case '>=': return { [field]: { $gte: value } };
    case '<':  return { [field]: { $lt: value } };
    case '<=': return { [field]: { $lte: value } };
    case 'in':
    case 'array-contains':
      return { [field]: { $in: Array.isArray(value) ? value : [value] } };
    default: return { [field]: value };
  }
}

// ── Document Reference ──────────────────────────────────────────────────────
function _makeDocRef(name, id) {
  return {
    id,
    name,
    async get() {
      const Model = _modelForDoc(name, id);
      if (!isMongoConnected()) {
        return { exists: false, id, data: () => ({}) };
      }
      try {
        const doc = await Promise.race([
          Model.findById(id).lean(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('mongo_timeout')), 8000))
        ]);
        if (!doc) return { exists: false, id, data: () => ({}) };
        _docCache.set(`${name}/${id}`, doc);
        return _toSnapshotDoc(doc, id, name);
      } catch (e) {
        return { exists: false, id, data: () => ({}) };
      }
    },
    async set(data, opts = {}) {
      if (!isMongoConnected()) {
        let waited = 0;
        while (!isMongoConnected() && waited < 5000) {
          await new Promise(r => setTimeout(r, 200));
          waited += 200;
        }
        if (!isMongoConnected()) {
          console.warn(`db.write blocked (MongoDB not ready): ${name}/${id}`);
          return;
        }
      }
      const Model = _modelForDoc(name, id);
      try {
        const payload = { ...data, _id: id };
        if (data.id && data.id !== id) payload.id = id;
        await Promise.race([
          Model.replaceOne({ _id: id }, payload, { upsert: true }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('mongo_timeout')), 8000))
        ]);
        _docCache.delete(`${name}/${id}`);
        return;
      } catch (e) {
        if (!isMongoConnected()) return;
        throw e;
      }
    },
    async update(patch) {
      if (!isMongoConnected()) {
        let waited = 0;
        while (!isMongoConnected() && waited < 5000) {
          await new Promise(r => setTimeout(r, 200));
          waited += 200;
        }
        if (!isMongoConnected()) return;
      }
      const Model = _modelForDoc(name, id);
      try {
        await Promise.race([
          Model.updateOne({ _id: id }, { $set: patch }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('mongo_timeout')), 8000))
        ]);
        _docCache.delete(`${name}/${id}`);
        return;
      } catch (e) {
        if (!isMongoConnected()) return;
        throw e;
      }
    },
    async delete() {
      if (!isMongoConnected()) {
        let waited = 0;
        while (!isMongoConnected() && waited < 3000) {
          await new Promise(r => setTimeout(r, 200));
          waited += 200;
        }
        if (!isMongoConnected()) return;
      }
      const Model = _modelForDoc(name, id);
      try {
        await Model.deleteOne({ _id: id });
        _docCache.delete(`${name}/${id}`);
        return;
      } catch (e) {
        if (!isMongoConnected()) return;
        throw e;
      }
    }
  };
}

// ── Query Builder ───────────────────────────────────────────────────────────
function _makeQuery(modelName, Model, query, ctx = {}) {
  const q = {
    _where: [...(ctx._where || [])],
    _orderBy: ctx._orderBy || null,
    _limit: ctx._limit || null,
    _select: ctx._select || null,
    _model: Model,
    _name: modelName
  };
  q.where = function (field, op, value) {
    const newWhere = op === undefined
      ? [...q._where, _toFilter(field, '==', value)]
      : [...q._where, _toFilter(field, op, value)];
    return _makeQuery(modelName, Model, query, {
      _where: newWhere, _orderBy: q._orderBy, _limit: q._limit, _select: q._select
    });
  };
  q.orderBy = function (field, dir = 'asc') {
    return _makeQuery(modelName, Model, query, {
      _where: q._where, _orderBy: { field, dir }, _limit: q._limit, _select: q._select
    });
  };
  q.limit = function (n) {
    return _makeQuery(modelName, Model, query, {
      _where: q._where, _orderBy: q._orderBy, _limit: n, _select: q._select
    });
  };
  q.select = function (...fields) {
    return _makeQuery(modelName, Model, query, {
      _where: q._where, _orderBy: q._orderBy, _limit: q._limit, _select: fields.flat()
    });
  };
  q.get = async function () {
    return _queryGet(q);
  };
  q._lean = async function () {
    return _queryLean(q);
  };
  return q;
}

/**
 * Execute a query, merging results from all shards if the collection is sharded.
 */
async function _queryGet(q) {
  if (!isMongoConnected()) {
    return { size: 0, empty: true, docs: [], forEach: () => {} };
  }

  const mongoQuery = q._where.reduce((acc, f) => Object.assign(acc, f), {});
  const isShardCol = isSharded(q._name);
  const shardIds = isShardCol ? _getShardIds() : ['primary'];

  try {
    let allDocs = [];

    for (const shardId of shardIds) {
      const Model = isShardCol ? _modelOnConn(q._name, shardId) : q._model;
      if (!Model) continue;

      let cursor = Model.find(mongoQuery).lean();
      if (q._select) cursor = cursor.select(q._select.join(' '));
      if (q._orderBy) cursor = cursor.sort({ [q._orderBy.field]: q._orderBy.dir === 'desc' ? -1 : 1 });
      // Don't apply limit per-shard for sharded collections — apply after merge
      if (!isShardCol && q._limit) cursor = cursor.limit(q._limit);

      const docs = await Promise.race([
        cursor,
        new Promise((_, reject) => setTimeout(() => reject(new Error('mongo_timeout')), 8000))
      ]);

      allDocs = allDocs.concat((docs || []).map(d => _toSnapshotDoc(d, d._id, q._name)));
    }

    // Sort merged results
    if (q._orderBy && allDocs.length > 1) {
      allDocs.sort((a, b) => {
        const aVal = a.data()[q._orderBy.field];
        const bVal = b.data()[q._orderBy.field];
        const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        return q._orderBy.dir === 'desc' ? -cmp : cmp;
      });
    }

    // Apply limit after merge
    if (q._limit && allDocs.length > q._limit) {
      allDocs = allDocs.slice(0, q._limit);
    }

    return {
      size: allDocs.length,
      empty: allDocs.length === 0,
      docs: allDocs,
      forEach: (cb) => allDocs.forEach(cb)
    };
  } catch (e) {
    return { size: 0, empty: true, docs: [], forEach: () => {} };
  }
}

async function _queryLean(q) {
  const mongoQuery = q._where.reduce((acc, f) => Object.assign(acc, f), {});
  const isShardCol = isSharded(q._name);
  const shardIds = isShardCol ? _getShardIds() : ['primary'];

  let allDocs = [];
  for (const shardId of shardIds) {
    const Model = isShardCol ? _modelOnConn(q._name, shardId) : q._model;
    if (!Model) continue;
    let cursor = Model.find(mongoQuery).lean();
    if (q._select) cursor = cursor.select(q._select.join(' '));
    if (q._orderBy) cursor = cursor.sort({ [q._orderBy.field]: q._orderBy.dir === 'desc' ? -1 : 1 });
    if (!isShardCol && q._limit) cursor = cursor.limit(q._limit);
    const docs = await cursor;
    allDocs = allDocs.concat(docs || []);
  }

  if (q._orderBy && allDocs.length > 1) {
    allDocs.sort((a, b) => {
      const aVal = a[q._orderBy.field];
      const bVal = b[q._orderBy.field];
      const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return q._orderBy.dir === 'desc' ? -cmp : cmp;
    });
  }
  if (q._limit && allDocs.length > q._limit) {
    allDocs = allDocs.slice(0, q._limit);
  }
  return allDocs;
}

// ── Collection API ──────────────────────────────────────────────────────────
function _makeCollection(name) {
  const col = {
    _name: name,
    _model: models[name],
    doc: (id) => _makeDocRef(name, id),
    where(field, op, value) { return _makeQuery(name, models[name], null, { _where: [op === undefined ? _toFilter(field, '==', value) : _toFilter(field, op, value)] }); },
    orderBy(field, dir = 'asc') { return _makeQuery(name, models[name], null, { _orderBy: { field, dir } }); },
    limit(n) { return _makeQuery(name, models[name], null, { _limit: n }); },
    select(...fields) { return _makeQuery(name, models[name], null, { _select: fields.flat() }); },
    async get() { return _makeQuery(name, models[name], null, {}).get(); },
    async add(data) {
      if (!isMongoConnected()) {
        let waited = 0;
        while (!isMongoConnected() && waited < 5000) {
          await new Promise(r => setTimeout(r, 200));
          waited += 200;
        }
        if (!isMongoConnected()) {
          console.warn(`db.write blocked (MongoDB not ready): ${name}`);
          const id = data?.id || `${name.slice(0, 3)}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          return { id };
        }
      }

      const id = data && data.id ? data.id
        : `${name.slice(0, 3)}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const payload = { ...data, _id: id, id };

      const Model = _modelForDoc(name, id);
      try {
        await Model.create(payload);
      } catch (e) {
        if (!isMongoConnected()) {
          console.warn(`db.write blocked (MongoDB not ready): ${name}`);
          return { id };
        }
        throw e;
      }
      return { id };
    }
  };
  return col;
}

const collections = {};
for (const name of Object.values(COLLECTIONS)) {
  collections[name] = _makeCollection(name);
}

const db = {
  collection: (name) => collections[name] || _makeCollection(name),
  raw: mongoose,
  models,
  isSharded,
  async runTransaction(fn) {
    const session = await mongoose.startSession();
    try {
      let result;
      await session.withTransaction(async () => {
        const txCtx = {
          get: async (ref) => ref.get(),
          update: (ref, patch) => ref.update(patch),
          set: (ref, data) => ref.set(data),
          delete: (ref) => ref.delete()
        };
        result = await fn(txCtx);
      });
      return result;
    } finally {
      session.endSession();
    }
  },
  batch() {
    const queued = [];
    const b = {
      set: (ref, data) => queued.push({ kind: 'set', ref, data }),
      update: (ref, patch) => queued.push({ kind: 'update', ref, patch }),
      delete: (ref) => queued.push({ kind: 'delete', ref }),
      async commit() {
        for (let i = 0; i < queued.length; i += 30) {
          const slice = queued.slice(i, i + 30);
          await Promise.all(slice.map(async (op) => {
            if (op.kind === 'set') return op.ref.set(op.data);
            if (op.kind === 'update') return op.ref.update(op.patch);
            if (op.kind === 'delete') return op.ref.delete();
          }));
        }
      }
    };
    return b;
  }
};

const _nowIso = () => new Date().toISOString();

function _genId(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

module.exports = {
  db,
  collections,
  isMongoConfigured: isMongoConnected,
  _id: _genId,
  _now: _nowIso
};
