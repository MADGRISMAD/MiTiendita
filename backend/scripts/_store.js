/** Conexión a PostgreSQL para los scripts (mismas variables que la API). */
require('dotenv').config();
const { PgStore } = require('../database/pg-store');

async function openStore() {
  const store = new PgStore({
    connectionString: process.env.DATABASE_URL || 'postgres://timberpos:timberpos@127.0.0.1:5432/micolmena',
    schema: process.env.DATABASE_SCHEMA || 'timberpos',
    max: 4,
  });
  await store.init();
  return store;
}

module.exports = { openStore };
