/**
 * Database backup — local files + optional Telegram delivery
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const DATA_DIR = path.join(__dirname, '..', 'data');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const CONFIG_FILE = path.join(DATA_DIR, 'backup-config.json');

const DEFAULT_CONFIG = {
  enabled: false,
  intervalDays: 1,
  time: '09:00',
  botToken: '',
  adminChatId: '',
  lastBackupAt: null,
  nextBackupAt: null
};

let scheduleTimer = null;

function ensureDirs() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function loadConfig() {
  ensureDirs();
  if (!fs.existsSync(CONFIG_FILE)) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2));
    return { ...DEFAULT_CONFIG };
  }
  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function saveConfig(patch) {
  const cfg = { ...loadConfig(), ...patch, updatedAt: new Date().toISOString() };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
  return cfg;
}

function maskToken(t) {
  if (!t || t.length < 8) return '';
  return t.slice(0, 4) + '••••' + t.slice(-4);
}

async function collectDatabaseSnapshot(collections) {
  const snapshot = { exportedAt: new Date().toISOString(), collections: {} };
  const names = ['users', 'phoneNumbers', 'smsMessages', 'withdrawalRequests', 'apiKeys'];
  for (const name of names) {
    try {
      const col = collections[name];
      if (!col) continue;
      const snap = await col.get();
      snapshot.collections[name] = [];
      snap.forEach((doc) => snapshot.collections[name].push(doc.data()));
    } catch {
      snapshot.collections[name] = [];
    }
  }
  return snapshot;
}

function writeBackupFile(snapshot, prefix = 'manual') {
  ensureDirs();
  const id = `${prefix}_${Date.now()}`;
  const filename = `${id}.json`;
  const filepath = path.join(BACKUP_DIR, filename);
  const content = JSON.stringify(snapshot, null, 2);
  fs.writeFileSync(filepath, content);
  return {
    id,
    filename,
    filepath,
    size: Buffer.byteLength(content),
    createdAt: snapshot.exportedAt
  };
}

function listBackups() {
  ensureDirs();
  return fs.readdirSync(BACKUP_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((filename) => {
      const filepath = path.join(BACKUP_DIR, filename);
      const stat = fs.statSync(filepath);
      return {
        id: filename.replace('.json', ''),
        filename,
        size: stat.size,
        createdAt: stat.mtime.toISOString()
      };
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function deleteBackup(id) {
  const file = path.join(BACKUP_DIR, `${id}.json`);
  if (!fs.existsSync(file)) return false;
  fs.unlinkSync(file);
  return true;
}

function readBackup(id) {
  const file = path.join(BACKUP_DIR, `${id}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function sendTelegramDocument(botToken, chatId, filepath, caption) {
  return new Promise((resolve, reject) => {
    if (!botToken || !chatId) return resolve({ skipped: true });
    const boundary = `----Gurubit${Date.now()}`;
    const fileContent = fs.readFileSync(filepath);
    const bodyStart = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="chat_id"',
      '',
      String(chatId),
      `--${boundary}`,
      'Content-Disposition: form-data; name="caption"',
      '',
      caption || 'GURUBIT backup',
      `--${boundary}`,
      `Content-Disposition: form-data; name="document"; filename="${path.basename(filepath)}"`,
      'Content-Type: application/json',
      '',
      ''
    ].join('\r\n');
    const bodyEnd = `\r\n--${boundary}--\r\n`;
    const payload = Buffer.concat([
      Buffer.from(bodyStart, 'utf8'),
      fileContent,
      Buffer.from(bodyEnd, 'utf8')
    ]);

    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${botToken}/sendDocument`,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': payload.length
      }
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.ok) resolve(json);
          else reject(new Error(json.description || 'Telegram error'));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function runBackup(collections, { prefix = 'manual', notify = true } = {}) {
  const snapshot = await collectDatabaseSnapshot(collections);
  const file = writeBackupFile(snapshot, prefix);
  const cfg = loadConfig();

  if (notify && cfg.botToken && cfg.adminChatId) {
    try {
      await sendTelegramDocument(
        cfg.botToken,
        cfg.adminChatId,
        file.filepath,
        `GURUBIT ${prefix} backup · ${new Date().toLocaleString()}`
      );
    } catch (e) {
      console.warn('Telegram backup notify failed:', e.message);
    }
  }

  const next = computeNextRun(cfg);
  saveConfig({ lastBackupAt: file.createdAt, nextBackupAt: next });
  return file;
}

function computeNextRun(cfg) {
  if (!cfg.enabled) return null;
  const [hh, mm] = (cfg.time || '09:00').split(':').map(Number);
  const d = new Date();
  d.setHours(hh || 9, mm || 0, 0, 0);
  if (d <= new Date()) d.setDate(d.getDate() + (cfg.intervalDays || 1));
  return d.toISOString();
}

function startScheduler(collections) {
  if (scheduleTimer) clearInterval(scheduleTimer);
  scheduleTimer = setInterval(async () => {
    const cfg = loadConfig();
    if (!cfg.enabled || !cfg.nextBackupAt) return;
    if (new Date(cfg.nextBackupAt) <= new Date()) {
      try {
        await runBackup(collections, { prefix: 'auto', notify: true });
        saveConfig({ nextBackupAt: computeNextRun(loadConfig()) });
      } catch (e) {
        console.error('Auto backup failed:', e);
      }
    }
  }, 60 * 1000);
}

async function restoreBackup(collections, snapshot) {
  if (!snapshot?.collections) throw new Error('Invalid backup file');
  for (const [name, rows] of Object.entries(snapshot.collections)) {
    const col = collections[name];
    if (!col || !Array.isArray(rows)) continue;
    for (const row of rows) {
      const id = row.id || row.uid;
      if (id) await col.doc(id).set(row);
    }
  }
}

async function wipeDatabase(collections) {
  const names = ['users', 'phoneNumbers', 'smsMessages', 'withdrawalRequests'];
  for (const name of names) {
    const col = collections[name];
    if (!col) continue;
    const snap = await col.get();
    const batch = [];
    snap.forEach((doc) => batch.push(col.doc(doc.id).delete()));
    await Promise.all(batch);
  }
}

module.exports = {
  loadConfig,
  saveConfig,
  maskToken,
  listBackups,
  deleteBackup,
  readBackup,
  runBackup,
  restoreBackup,
  wipeDatabase,
  startScheduler,
  computeNextRun,
  BACKUP_DIR
};
