/**
 * Copia TODOS los datos de MongoDB (Atlas) a PostgreSQL, una tabla por colección.
 *
 *   MONGO_URI='mongodb+srv://…' MONGO_DB=timber \
 *   DATABASE_URL='postgres://timberpos:…@db:5432/micolmena' DATABASE_SCHEMA=timberpos \
 *   node scripts/migrate-from-mongo.js            # copia
 *   node scripts/migrate-from-mongo.js --dry-run  # solo cuenta lo que hay
 *
 * - Conserva los ids (_id), fechas y números; se puede correr varias veces: lo que ya existe se reemplaza.
 * - No copia rate_limits (son contadores de minutos).
 * - Al final compara cuántos documentos hay en cada lado y sale con código 1 si algo no cuadra.
 */
require('dotenv').config();
const { MongoClient } = require('mongodb');
const { openStore } = require('./_store');
const { encode } = require('../database/pg-store');

const SKIP = new Set(['rate_limits']);
const BATCH = 500;
const dryRun = process.argv.includes('--dry-run');

function idText(id) {
  if (id && (id._bsontype === 'ObjectId' || id._bsontype === 'ObjectID')) return id.toHexString();
  return String(id);
}

async function copyCollection(mongoDb, store, name) {
  const source = mongoDb.collection(name);
  const total = await source.countDocuments({});
  if (dryRun) return { name, mongo: total, pg: null };

  await store.ensureTable(name);
  const table = store.qualified(name);
  let copied = 0;
  let batch = [];
  const flush = async () => {
    if (!batch.length) return;
    const ids = batch.map((d) => idText(d._id));
    const docs = batch.map((d) => {
      const rest = { ...d };
      delete rest._id;
      return JSON.stringify(encode(rest));
    });
    await store.pool.query(
      `INSERT INTO ${table} (_id, doc)
       SELECT * FROM unnest($1::text[], $2::jsonb[])
       ON CONFLICT (_id) DO UPDATE SET doc = EXCLUDED.doc`,
      [ids, docs]
    );
    copied += batch.length;
    batch = [];
    process.stdout.write(`\r  ${name}: ${copied}/${total}`);
  };
  for await (const doc of source.find({}).batchSize(BATCH)) {
    batch.push(doc);
    if (batch.length >= BATCH) await flush();
  }
  await flush();
  if (total) process.stdout.write('\n');
  const { rows } = await store.pool.query(`SELECT count(*)::int AS n FROM ${table}`);
  return { name, mongo: total, pg: rows[0].n };
}

async function main() {
  const uri = process.env.MONGO_URI || process.env.DATABASE_URI;
  if (!uri) throw new Error('Falta MONGO_URI (la cadena de conexión de Atlas).');
  const mongo = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 });
  await mongo.connect();
  const mongoDb = mongo.db(process.env.MONGO_DB || process.env.DATABASE_NAME || 'timber');
  const store = dryRun ? null : await openStore();

  const names = (await mongoDb.listCollections({}, { nameOnly: true }).toArray())
    .map((c) => c.name)
    .filter((n) => !n.startsWith('system.') && !SKIP.has(n))
    .sort();
  console.log(`${dryRun ? 'Revisando' : 'Copiando'} ${names.length} colecciones de «${mongoDb.databaseName}»…`);

  const results = [];
  for (const name of names) results.push(await copyCollection(mongoDb, store, name));

  console.log('\nColección                     Mongo   Postgres');
  let bad = 0;
  for (const r of results) {
    const ok = r.pg == null || r.pg >= r.mongo;
    if (!ok) bad += 1;
    console.log(`${ok ? ' ' : '✘'} ${r.name.padEnd(28)} ${String(r.mongo).padStart(6)}   ${r.pg == null ? '—' : String(r.pg).padStart(6)}`);
  }
  await mongo.close();
  if (store) await store.close();
  if (bad) {
    console.error(`\n${bad} colecciones no cuadran. Revisa los mensajes de arriba y vuelve a correr el script.`);
    process.exit(1);
  }
  console.log(dryRun ? '\nListo (sin copiar nada).' : '\nListo: todos los datos están en PostgreSQL.');
}

main().catch((err) => {
  console.error('\nNo se pudo migrar:', err.message);
  process.exit(1);
});
