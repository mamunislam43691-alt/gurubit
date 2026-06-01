/**
 * One-time migration script: local JSON files → Firestore
 * Run: node scripts/migrate-to-firestore.js
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

// Initialize Firebase
require('../config/firebase');
const { db } = require('../config/firebase');

async function migrate() {
  console.log('\n🚀 Starting Firestore migration...\n');

  // ── 1. Migrate providers.json → smsProviders ─────────────────────
  const providersFile = path.join(__dirname, '../data/providers.json');
  if (fs.existsSync(providersFile)) {
    try {
      const providers = JSON.parse(fs.readFileSync(providersFile, 'utf8'));
      console.log(`📦 Migrating ${providers.length} providers...`);
      for (const p of providers) {
        await db.collection('smsProviders').doc(p.id).set(p);
        console.log(`  ✅ Provider: ${p.serviceName} (${p.id})`);
      }
    } catch (e) {
      console.error('  ❌ Providers migration failed:', e.message);
    }
  } else {
    console.log('⚠️  No providers.json found, skipping.');
  }

  // ── 2. Migrate catalog.json → catalogCountries/Servers/Platforms ──
  const catalogFile = path.join(__dirname, '../data/catalog.json');
  if (fs.existsSync(catalogFile)) {
    try {
      const catalog = JSON.parse(fs.readFileSync(catalogFile, 'utf8'));

      const countries = catalog.countries || [];
      console.log(`\n📦 Migrating ${countries.length} countries...`);
      for (const [id, c] of countries) {
        await db.collection('catalogCountries').doc(id).set(c);
        console.log(`  ✅ Country: ${c.name}`);
      }

      const servers = catalog.servers || [];
      console.log(`\n📦 Migrating ${servers.length} servers...`);
      for (const [id, s] of servers) {
        await db.collection('catalogServers').doc(id).set(s);
        console.log(`  ✅ Server: ${s.name} (${s.numbers?.length || 0} numbers)`);
      }

      const platforms = catalog.platforms || [];
      console.log(`\n📦 Migrating ${platforms.length} platforms...`);
      for (const [id, p] of platforms) {
        await db.collection('catalogPlatforms').doc(id).set(p);
        console.log(`  ✅ Platform: ${p.name}`);
      }
    } catch (e) {
      console.error('  ❌ Catalog migration failed:', e.message);
    }
  } else {
    console.log('⚠️  No catalog.json found, skipping.');
  }

  console.log('\n✅ Migration complete!\n');
  console.log('You can now safely delete:');
  console.log('  - data/providers.json');
  console.log('  - data/catalog.json');
  console.log('\nThese files are no longer used — all data is in Firestore.\n');
  process.exit(0);
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
