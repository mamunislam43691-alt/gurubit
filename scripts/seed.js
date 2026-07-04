/**
 * Seed script for GURUBIT MongoDB
 *
 * - Ensures the "main" social group exists
 * - Default Mongo indexes (handled by start-server already, repeated here for safety)
 * - Optional: seed catalog countries/servers/platforms from JSON files placed in /scripts/seed-data/
 *
 * Usage:  npm run seed
 */

const fs = require('fs');
const path = require('path');
const { connectMongo, ensureIndexes } = require('../config/mongo');
const { collections, models } = require('../models');
const catalogStore = require('../services/catalogStore');

async function seedSocial() {
  try {
    const ref = collections.guruGroups.doc('main');
    const doc = await ref.get();
    if (!doc.exists) {
      await ref.set({
        _id: 'main',
        id: 'main',
        name: 'GURUBIT Community',
        description: 'Default community group',
        memberCount: 0,
        isPrivate: false,
        createdAt: new Date().toISOString(),
        createdBy: 'system'
      });
      console.log('✅ Created default "main" social group');
    } else {
      console.log('ℹ️ "main" social group already exists');
    }
  } catch (e) {
    console.warn('seedSocial warning:', e.message);
  }
}

async function seedOptions() {
  try {
    const ref = collections.guruSettings.doc('system');
    const doc = await ref.get();
    if (!doc.exists) {
      await ref.set({
        _id: 'system',
        id: 'system',
        allowGuestLogin: true,
        updatedAt: new Date().toISOString()
      });
      console.log('✅ Created default guruSettings/system');
    } else {
      console.log('ℹ️ guruSettings/system already exists');
    }
  } catch (e) {
    console.warn('seedOptions warning:', e.message);
  }
}

async function seedCatalogFromFiles() {
  const dir = path.join(__dirname, 'seed-data');
  if (!fs.existsSync(dir)) {
    console.log('ℹ️ No scripts/seed-data/ directory found; skipping catalog seeding');
    return;
  }
  const file = path.join(dir, 'catalog.json');
  if (!fs.existsSync(file)) {
    console.log('ℹ️ No scripts/seed-data/catalog.json found; skipping catalog seeding');
    return;
  }
  console.log(`📥 Importing catalog from ${file} …`);
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const countries = raw.countries || [];
  const ccount = { countries: 0, servers: 0, platforms: 0, numbers: 0 };
  for (const c of countries) {
    const ctry = await catalogStore.addCountry({
      name: c.name,
      code: c.code,
      flag: c.flag,
      prefix: c.prefix
    });
    ccount.countries++;
    for (const s of (c.servers || [])) {
      const srv = await catalogStore.addServer(ctry.id, { name: s.name });
      ccount.servers++;
      if (Array.isArray(s.numbers)) {
        await catalogStore.addServerNumbers(srv.id, s.numbers);
        ccount.numbers += s.numbers.length;
      }
    }
    for (const p of (c.platforms || [])) {
      await catalogStore.addPlatform(ctry.id, p);
      ccount.platforms++;
    }
  }
  console.log('✅ Catalog seeded:', ccount);
}

async function main() {
  await connectMongo();
  await ensureIndexes();
  await seedSocial();
  await seedOptions();
  await catalogStore.ensureLoaded();
  await seedCatalogFromFiles();
  console.log('\n🎉 Seed complete');
  process.exit(0);
}

main().catch((e) => {
  console.error('Seed failed:', e);
  process.exit(1);
});
