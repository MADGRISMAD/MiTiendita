/**
 * Almacén de documentos sobre PostgreSQL.
 *
 * Cada colección es una tabla `(_id text primary key, doc jsonb)` dentro del esquema de la app
 * (por defecto `timberpos`), así comparte la base con otros proyectos sin mezclar tablas.
 * Expone la parte de la API de colecciones que usa el backend (find, updateOne, findOneAndUpdate…),
 * de modo que las consultas existentes funcionan igual.
 *
 * - Fechas se guardan como {"$date": "ISO"} y vuelven como Date; ids como texto de 24 hex.
 * - Las escrituras leen la fila con FOR UPDATE, aplican los operadores ($set, $inc…) y guardan,
 *   todo en una transacción: un descuento de existencias condicionado es atómico.
 */
const { Pool } = require('pg');
const { ObjectId } = require('../utils/objectid');

// ───────────────────────── Codificación ─────────────────────────

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) && !(v instanceof ObjectId) &&
    !(v instanceof RegExp) && !Buffer.isBuffer(v);
}

function encode(v) {
  if (v === undefined || typeof v === 'function') return undefined;
  if (v === null) return null;
  if (v instanceof Date) return { $date: Number.isNaN(v.getTime()) ? null : v.toISOString() };
  if (v instanceof ObjectId) return { $oid: v.toString() };
  if (Buffer.isBuffer(v)) return { $binary: v.toString('base64') };
  if (Array.isArray(v)) return v.map((x) => (encode(x) === undefined ? null : encode(x)));
  if (typeof v === 'object') {
    // Tipos que llegan al migrar desde MongoDB (BSON)
    if (v._bsontype === 'ObjectId' || v._bsontype === 'ObjectID') return { $oid: v.toHexString() };
    if (['Decimal128', 'Long', 'Double', 'Int32'].includes(v._bsontype)) return Number(v.toString());
    if (v._bsontype === 'Binary') return { $binary: Buffer.from(v.buffer).toString('base64') };
    if (v._bsontype === 'Timestamp') return { $date: new Date(Number(v.getHighBits ? v.getHighBits() : v.high) * 1000).toISOString() };
    const out = {};
    for (const [k, x] of Object.entries(v)) {
      const e = encode(x);
      if (e !== undefined) out[k] = e;
    }
    return out;
  }
  if (typeof v === 'number' && !Number.isFinite(v)) return null;
  if (typeof v === 'bigint') return Number(v);
  return v;
}

function decode(v) {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(decode);
  const keys = Object.keys(v);
  if (keys.length === 1) {
    if (keys[0] === '$date') return v.$date == null ? new Date(NaN) : new Date(v.$date);
    if (keys[0] === '$oid') return new ObjectId(v.$oid);
    if (keys[0] === '$binary') return Buffer.from(v.$binary, 'base64');
  }
  const out = {};
  for (const k of keys) out[k] = decode(v[k]);
  return out;
}

function idToText(id) {
  if (id instanceof ObjectId) return id.toString();
  if (id && (id._bsontype === 'ObjectId' || id._bsontype === 'ObjectID')) return id.toHexString();
  return String(id);
}
function idFromText(text) {
  return ObjectId.isValid(text) ? new ObjectId(text) : text;
}

function rowToDoc(row) {
  if (!row) return null;
  return { _id: idFromText(row._id), ...decode(row.doc) };
}
function docToRow(doc) {
  const { _id, ...rest } = doc;
  return { id: idToText(_id), doc: encode(rest) };
}

// ───────────────────────── Rutas y valores ─────────────────────────

const splitPath = (path) => String(path).split('.');

function getPath(obj, path) {
  let cur = obj;
  for (const seg of splitPath(path)) {
    if (cur == null) return undefined;
    cur = cur[seg];
  }
  return cur;
}
function setPath(obj, path, value) {
  const segs = splitPath(path);
  let cur = obj;
  for (let i = 0; i < segs.length - 1; i++) {
    const seg = segs[i];
    if (cur[seg] == null || typeof cur[seg] !== 'object') cur[seg] = /^\d+$/.test(segs[i + 1]) ? [] : {};
    cur = cur[seg];
  }
  cur[segs[segs.length - 1]] = value;
}
function unsetPath(obj, path) {
  const segs = splitPath(path);
  let cur = obj;
  for (let i = 0; i < segs.length - 1; i++) {
    cur = cur?.[segs[i]];
    if (cur == null) return;
  }
  if (cur && typeof cur === 'object') delete cur[segs[segs.length - 1]];
}
const same = (a, b) => JSON.stringify(encode(a)) === JSON.stringify(encode(b));
const clone = (v) => decode(encode(v));

// ───────────────────────── Filtros → SQL ─────────────────────────

class Params {
  constructor() {
    this.values = [];
  }
  add(v) {
    this.values.push(v);
    return `$${this.values.length}`;
  }
}

function isOperatorObject(v) {
  return isPlainObject(v) && Object.keys(v).length > 0 && Object.keys(v).every((k) => k.startsWith('$'));
}

/** Objeto anidado {a:{b:v}} para comparar por contención (usa el índice GIN). */
function nest(path, value) {
  return splitPath(path).reduceRight((acc, seg) => ({ [seg]: acc }), value);
}

function compileFilter(filter, p) {
  const parts = [];
  for (const [key, cond] of Object.entries(filter || {})) {
    if (cond === undefined) continue;
    if (key === '$or' || key === '$and' || key === '$nor') {
      const subs = (cond || []).map((f) => `(${compileFilter(f, p)})`);
      if (!subs.length) {
        parts.push(key === '$or' ? 'FALSE' : 'TRUE');
        continue;
      }
      const joined = subs.join(key === '$and' ? ' AND ' : ' OR ');
      parts.push(key === '$nor' ? `NOT (${joined})` : `(${joined})`);
    } else if (key === '$expr') {
      parts.push(compileExpr(cond, p));
    } else if (key.startsWith('$')) {
      throw new Error(`Operador de consulta no soportado: ${key}`);
    } else {
      parts.push(compileField(key, cond, p));
    }
  }
  return parts.length ? parts.join(' AND ') : 'TRUE';
}

function compileField(path, cond, p) {
  if (path === '_id') return compileId(cond, p);
  // La ruta solo se agrega como parámetro si se usa (un parámetro sin usar no tiene tipo)
  let jCache = null;
  const jRef = () => (jCache ||= `(doc #> ${p.add(splitPath(path))}::text[])`);
  const j = { toString: jRef };
  if (cond instanceof RegExp) return regexSql(j, cond.source, cond.flags.includes('i'), p);
  if (!isOperatorObject(cond)) return eqSql(path, j, cond, p);

  const parts = [];
  for (const [op, v] of Object.entries(cond)) {
    switch (op) {
      case '$eq':
        parts.push(eqSql(path, j, v, p));
        break;
      case '$ne':
        parts.push(`NOT COALESCE(${eqSql(path, j, v, p)}, false)`);
        break;
      case '$in':
        parts.push(inSql(path, j, v, p));
        break;
      case '$nin':
        parts.push(`NOT COALESCE(${inSql(path, j, v, p)}, false)`);
        break;
      case '$exists':
        parts.push(v ? `${j} IS NOT NULL` : `${j} IS NULL`);
        break;
      case '$gt':
      case '$gte':
      case '$lt':
      case '$lte':
        parts.push(rangeSql(j, op, v, p));
        break;
      case '$regex':
        parts.push(regexSql(j, v instanceof RegExp ? v.source : String(v), String(cond.$options || '').includes('i') || (v instanceof RegExp && v.flags.includes('i')), p));
        break;
      case '$options':
        break;
      default:
        throw new Error(`Operador no soportado en «${path}»: ${op}`);
    }
  }
  return parts.length ? `(${parts.join(' AND ')})` : 'TRUE';
}

function eqSql(path, j, v, p) {
  if (v === null || v === undefined) return `(${j} IS NULL OR ${j} = 'null'::jsonb)`;
  const val = encode(v);
  // Igual que Mongo: un campo arreglo coincide si contiene el valor
  return `(doc @> ${p.add(JSON.stringify(nest(path, val)))}::jsonb OR doc @> ${p.add(JSON.stringify(nest(path, [val])))}::jsonb)`;
}

function inSql(path, j, values, p) {
  const list = Array.isArray(values) ? values : [];
  if (!list.length) return 'FALSE';
  return `(${list.map((v) => eqSql(path, j, v, p)).join(' OR ')})`;
}

const RANGE = { $gt: '>', $gte: '>=', $lt: '<', $lte: '<=' };
function rangeSql(j, op, v, p) {
  const sym = RANGE[op];
  if (v instanceof Date) return `((${j} ->> '$date') ${sym} ${p.add(v.toISOString())})`;
  if (typeof v === 'number') return `(CASE WHEN jsonb_typeof(${j}) = 'number' THEN (${j})::numeric END ${sym} ${p.add(v)})`;
  if (typeof v === 'string') return `((CASE WHEN jsonb_typeof(${j}) = 'string' THEN ${j} #>> '{}' END) COLLATE "C" ${sym} ${p.add(v)})`;
  if (v instanceof ObjectId) return `((${j} ->> '$oid') ${sym} ${p.add(v.toString())})`;
  throw new Error(`Comparación ${op} no soportada para ${typeof v}`);
}

function regexSql(j, source, insensitive, p) {
  return `((CASE WHEN jsonb_typeof(${j}) = 'string' THEN ${j} #>> '{}' END) ${insensitive ? '~*' : '~'} ${p.add(source)})`;
}

function compileId(cond, p) {
  if (cond instanceof RegExp) return `(_id ~ ${p.add(cond.source)})`;
  if (!isOperatorObject(cond)) return `(_id = ${p.add(idToText(cond))})`;
  const parts = [];
  for (const [op, v] of Object.entries(cond)) {
    if (op === '$eq') parts.push(`_id = ${p.add(idToText(v))}`);
    else if (op === '$ne') parts.push(`_id <> ${p.add(idToText(v))}`);
    else if (op === '$in') parts.push(`_id = ANY(${p.add((v || []).map(idToText))}::text[])`);
    else if (op === '$nin') parts.push(`NOT (_id = ANY(${p.add((v || []).map(idToText))}::text[]))`);
    else if (op === '$exists') parts.push(v ? 'TRUE' : 'FALSE');
    else if (RANGE[op]) parts.push(`_id COLLATE "C" ${RANGE[op]} ${p.add(idToText(v))}`);
    else throw new Error(`Operador no soportado en _id: ${op}`);
  }
  return parts.length ? `(${parts.join(' AND ')})` : 'TRUE';
}

/** $expr: comparaciones numéricas entre campos, con $ifNull (p. ej. stock <= umbral). */
function compileExpr(expr, p) {
  const [op] = Object.keys(expr || {});
  const sym = { $lte: '<=', $lt: '<', $gte: '>=', $gt: '>', $eq: '=', $ne: '<>' }[op];
  if (!sym || !Array.isArray(expr[op]) || expr[op].length !== 2) throw new Error('$expr no soportado');
  return `(${numExpr(expr[op][0], p)} ${sym} ${numExpr(expr[op][1], p)})`;
}
function numExpr(e, p) {
  if (typeof e === 'number') return `${p.add(e)}::numeric`;
  if (typeof e === 'string' && e.startsWith('$')) {
    const j = `(doc #> ${p.add(splitPath(e.slice(1)))}::text[])`;
    return `(CASE WHEN jsonb_typeof(${j}) = 'number' THEN (${j})::numeric END)`;
  }
  if (isPlainObject(e) && Array.isArray(e.$ifNull)) return `COALESCE(${e.$ifNull.map((x) => numExpr(x, p)).join(', ')})`;
  throw new Error('Expresión no soportada en $expr');
}

function compileSort(sort) {
  const entries = Object.entries(sort || {});
  if (!entries.length) return '';
  const cols = entries.map(([k, dir]) => {
    const desc = Number(dir) < 0 || dir === 'desc';
    if (k === '_id') return `_id COLLATE "C" ${desc ? 'DESC' : 'ASC'}`;
    const path = splitPath(k).map((s) => `'${s.replace(/'/g, "''")}'`).join(',');
    return `doc #> ARRAY[${path}] ${desc ? 'DESC NULLS LAST' : 'ASC NULLS FIRST'}`;
  });
  return ` ORDER BY ${cols.join(', ')}`;
}

function applyProjection(doc, projection) {
  if (!doc || !projection || !Object.keys(projection).length) return doc;
  const entries = Object.entries(projection);
  const including = entries.some(([k, v]) => k !== '_id' && v);
  if (including) {
    const out = {};
    if (projection._id !== 0 && projection._id !== false) out._id = doc._id;
    for (const [k, v] of entries) {
      if (k === '_id' || !v) continue;
      const val = getPath(doc, k);
      if (val !== undefined) setPath(out, k, val);
    }
    return out;
  }
  const out = clone(doc);
  out._id = doc._id;
  for (const [k, v] of entries) if (!v) (k === '_id' ? delete out._id : unsetPath(out, k));
  return out;
}

// ───────────────────────── Operadores de actualización ─────────────────────────

function applyUpdate(doc, update, { isInsert = false } = {}) {
  const ops = Object.keys(update || {});
  if (!ops.length || !ops.every((k) => k.startsWith('$'))) {
    // Reemplazo completo (replaceOne)
    return { _id: doc._id, ...clone(update) };
  }
  const out = clone(doc);
  out._id = doc._id;
  for (const [op, fields] of Object.entries(update)) {
    for (const [path, value] of Object.entries(fields || {})) {
      if (path === '_id' && op !== '$setOnInsert') continue;
      switch (op) {
        case '$set':
          setPath(out, path, clone(value));
          break;
        case '$setOnInsert':
          if (isInsert) setPath(out, path, clone(value));
          break;
        case '$unset':
          unsetPath(out, path);
          break;
        case '$inc': {
          const cur = Number(getPath(out, path)) || 0;
          setPath(out, path, cur + Number(value));
          break;
        }
        case '$min':
        case '$max': {
          const cur = getPath(out, path);
          if (cur === undefined || (op === '$min' ? value < cur : value > cur)) setPath(out, path, clone(value));
          break;
        }
        case '$push':
        case '$addToSet': {
          const arr = Array.isArray(getPath(out, path)) ? getPath(out, path) : [];
          const items = isPlainObject(value) && Array.isArray(value.$each) ? value.$each : [value];
          for (const it of items) if (op === '$push' || !arr.some((x) => same(x, it))) arr.push(clone(it));
          setPath(out, path, arr);
          break;
        }
        case '$pull': {
          const arr = getPath(out, path);
          if (!Array.isArray(arr)) break;
          if (isOperatorObject(value)) {
            if (!Array.isArray(value.$in)) throw new Error('$pull solo admite valores o $in');
            setPath(out, path, arr.filter((x) => !value.$in.some((v) => same(x, v))));
          } else {
            setPath(out, path, arr.filter((x) => !same(x, value)));
          }
          break;
        }
        default:
          throw new Error(`Operador de actualización no soportado: ${op}`);
      }
    }
  }
  return out;
}

/** Documento base de un upsert: los campos de igualdad del filtro. */
function upsertSeed(filter) {
  const doc = {};
  for (const [k, v] of Object.entries(filter || {})) {
    if (k.startsWith('$') || v instanceof RegExp) continue;
    if (isOperatorObject(v)) {
      if ('$eq' in v) setPath(doc, k, clone(v.$eq));
      continue;
    }
    setPath(doc, k, k === '_id' ? v : clone(v));
  }
  return doc;
}

// ───────────────────────── Agregaciones (subconjunto) ─────────────────────────

function evalExpr(e, doc) {
  if (typeof e === 'string' && e.startsWith('$')) return getPath(doc, e.slice(1));
  if (Array.isArray(e)) return e.map((x) => evalExpr(x, doc));
  if (isPlainObject(e)) {
    if ('$ifNull' in e) {
      for (const x of e.$ifNull) {
        const v = evalExpr(x, doc);
        if (v != null) return v;
      }
      return null;
    }
    const out = {};
    for (const [k, v] of Object.entries(e)) out[k] = evalExpr(v, doc);
    return out;
  }
  return e;
}

function runGroup(docs, spec) {
  const groups = new Map();
  for (const doc of docs) {
    const id = evalExpr(spec._id, doc);
    const key = JSON.stringify(encode(id) ?? null);
    if (!groups.has(key)) groups.set(key, { id, rows: [] });
    groups.get(key).rows.push(doc);
  }
  const out = [];
  for (const { id, rows } of groups.values()) {
    const g = { _id: id ?? null };
    for (const [field, acc] of Object.entries(spec)) {
      if (field === '_id') continue;
      const [op] = Object.keys(acc);
      const vals = rows.map((r) => evalExpr(acc[op], r));
      if (op === '$sum') g[field] = vals.reduce((s, v) => s + (typeof v === 'number' ? v : 0), 0);
      else if (op === '$avg') {
        const nums = vals.filter((v) => typeof v === 'number');
        g[field] = nums.length ? nums.reduce((s, v) => s + v, 0) / nums.length : null;
      } else if (op === '$first') g[field] = vals[0];
      else if (op === '$last') g[field] = vals[vals.length - 1];
      else if (op === '$max') g[field] = vals.filter((v) => v != null).reduce((m, v) => (m == null || v > m ? v : m), null);
      else if (op === '$min') g[field] = vals.filter((v) => v != null).reduce((m, v) => (m == null || v < m ? v : m), null);
      else if (op === '$push') g[field] = vals;
      else if (op === '$addToSet') g[field] = vals.filter((v, i) => vals.findIndex((x) => same(x, v)) === i);
      else throw new Error(`Acumulador no soportado: ${op}`);
    }
    out.push(g);
  }
  return out;
}

function sortDocs(docs, sort) {
  const entries = Object.entries(sort);
  return [...docs].sort((a, b) => {
    for (const [k, dir] of entries) {
      const x = getPath(a, k);
      const y = getPath(b, k);
      if (same(x, y)) continue;
      if (x == null) return -Number(dir);
      if (y == null) return Number(dir);
      return (x < y ? -1 : 1) * Number(dir);
    }
    return 0;
  });
}

// ───────────────────────── Colección ─────────────────────────

const quoteIdent = (name) => `"${String(name).replace(/"/g, '""')}"`;

class Cursor {
  constructor(col, filter, options = {}) {
    this.col = col;
    this.filter = filter || {};
    this.opts = { sort: options.sort, limit: options.limit, skip: options.skip, projection: options.projection };
    this.mappers = [];
  }
  sort(s) {
    this.opts.sort = s;
    return this;
  }
  limit(n) {
    this.opts.limit = n;
    return this;
  }
  skip(n) {
    this.opts.skip = n;
    return this;
  }
  project(pr) {
    this.opts.projection = pr;
    return this;
  }
  map(fn) {
    this.mappers.push(fn);
    return this;
  }
  async toArray() {
    let docs = await this.col._select(this.filter, this.opts);
    for (const fn of this.mappers) docs = docs.map(fn);
    return docs;
  }
  async *[Symbol.asyncIterator]() {
    for (const d of await this.toArray()) yield d;
  }
}

class AggregateCursor {
  constructor(col, pipeline) {
    this.col = col;
    this.pipeline = pipeline || [];
  }
  async toArray() {
    const stages = [...this.pipeline];
    let filter = {};
    if (stages[0]?.$match) filter = stages.shift().$match;
    let docs = await this.col._select(filter, {});
    for (const st of stages) {
      const [op] = Object.keys(st);
      if (op === '$match') docs = docs.filter((d) => matchesLocal(d, st.$match));
      else if (op === '$sort') docs = sortDocs(docs, st.$sort);
      else if (op === '$group') docs = runGroup(docs, st.$group);
      else if (op === '$limit') docs = docs.slice(0, st.$limit);
      else if (op === '$skip') docs = docs.slice(st.$skip);
      else if (op === '$project') docs = docs.map((d) => applyProjection(d, st.$project));
      else throw new Error(`Etapa de agregación no soportada: ${op}`);
    }
    return docs;
  }
}

/** Filtro de igualdad simple en memoria (para $match después de la primera etapa). */
function matchesLocal(doc, filter) {
  return Object.entries(filter || {}).every(([k, v]) => {
    if (isOperatorObject(v)) {
      const cur = getPath(doc, k);
      return Object.entries(v).every(([op, x]) => {
        if (op === '$in') return x.some((y) => same(cur, y));
        if (op === '$ne') return !same(cur, x);
        if (op === '$exists') return (cur !== undefined) === Boolean(x);
        throw new Error(`$match en memoria no soporta ${op}`);
      });
    }
    return same(getPath(doc, k), v);
  });
}

class Collection {
  constructor(store, name) {
    this.store = store;
    this.name = name;
    this.table = store.qualified(name);
  }

  async _ready() {
    await this.store.ensureTable(this.name);
  }

  async _select(filter, { sort, limit, skip, projection } = {}, client = null, forUpdate = false) {
    await this._ready();
    const p = new Params();
    const where = compileFilter(filter, p);
    let sql = `SELECT _id, doc FROM ${this.table} WHERE ${where}${compileSort(sort)}`;
    if (Number(limit) > 0) sql += ` LIMIT ${Math.floor(Number(limit))}`;
    if (Number(skip) > 0) sql += ` OFFSET ${Math.floor(Number(skip))}`;
    if (forUpdate) sql += ' FOR UPDATE';
    const { rows } = await (client || this.store.pool).query(sql, p.values);
    return rows.map((r) => applyProjection(rowToDoc(r), projection));
  }

  find(filter = {}, options = {}) {
    return new Cursor(this, filter, options);
  }

  async findOne(filter = {}, options = {}) {
    const [doc] = await this._select(filter, { ...options, limit: 1 });
    return doc || null;
  }

  async countDocuments(filter = {}) {
    await this._ready();
    const p = new Params();
    const { rows } = await this.store.pool.query(`SELECT count(*)::int AS n FROM ${this.table} WHERE ${compileFilter(filter, p)}`, p.values);
    return rows[0].n;
  }

  async estimatedDocumentCount() {
    return this.countDocuments({});
  }

  async distinct(path, filter = {}) {
    const docs = await this._select(filter, {});
    const out = [];
    for (const d of docs) {
      const v = path === '_id' ? d._id : getPath(d, path);
      for (const x of Array.isArray(v) ? v : [v]) if (x !== undefined && x !== null && !out.some((y) => same(y, x))) out.push(x);
    }
    return out;
  }

  aggregate(pipeline) {
    return new AggregateCursor(this, pipeline);
  }

  async insertOne(doc) {
    await this._ready();
    if (doc._id === undefined) doc._id = new ObjectId(); // como el driver: el id queda en el objeto
    const row = docToRow(doc);
    try {
      await this.store.pool.query(`INSERT INTO ${this.table} (_id, doc) VALUES ($1, $2::jsonb)`, [row.id, JSON.stringify(row.doc)]);
    } catch (err) {
      throw mapError(err);
    }
    return { acknowledged: true, insertedId: doc._id };
  }

  async insertMany(docs) {
    await this._ready();
    const ids = {};
    await this.store.tx(async (c) => {
      for (const [i, doc] of docs.entries()) {
        if (doc._id === undefined) doc._id = new ObjectId();
        const row = docToRow(doc);
        await c.query(`INSERT INTO ${this.table} (_id, doc) VALUES ($1, $2::jsonb)`, [row.id, JSON.stringify(row.doc)]);
        ids[i] = doc._id;
      }
    }).catch((err) => {
      throw mapError(err);
    });
    return { acknowledged: true, insertedCount: docs.length, insertedIds: ids };
  }

  /** Núcleo de updateOne/updateMany/findOneAndUpdate. */
  async _update(filter, update, { many = false, upsert = false, sort } = {}) {
    await this._ready();
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.store.tx(async (c) => {
          const rows = await this._select(filter, { sort, limit: many ? 0 : 1 }, c, true);
          const result = { matchedCount: rows.length, modifiedCount: 0, upsertedId: null, upsertedCount: 0, before: rows[0] || null, after: null };
          for (const doc of rows) {
            const next = applyUpdate(doc, update);
            if (!same(next, doc)) {
              const row = docToRow(next);
              await c.query(`UPDATE ${this.table} SET doc = $2::jsonb WHERE _id = $1`, [row.id, JSON.stringify(row.doc)]);
              result.modifiedCount += 1;
            }
            if (!result.after) result.after = next;
          }
          if (!rows.length && upsert) {
            const seed = upsertSeed(filter);
            if (seed._id === undefined) seed._id = new ObjectId();
            const doc = applyUpdate(seed, update, { isInsert: true });
            const row = docToRow(doc);
            const ins = await c.query(
              `INSERT INTO ${this.table} (_id, doc) VALUES ($1, $2::jsonb) ON CONFLICT (_id) DO NOTHING RETURNING _id`,
              [row.id, JSON.stringify(row.doc)]
            );
            if (!ins.rowCount) throw Object.assign(new Error('upsert en carrera'), { retry: true });
            result.upsertedId = doc._id;
            result.upsertedCount = 1;
            result.after = doc;
          }
          return result;
        });
      } catch (err) {
        // Dos upserts a la vez sobre el mismo documento: se reintenta y el segundo actualiza
        if ((err.retry || err.code === '23505') && upsert && attempt < 3) continue;
        throw mapError(err);
      }
    }
  }

  async updateOne(filter, update, options = {}) {
    const r = await this._update(filter, update, { upsert: options.upsert, sort: options.sort });
    return { acknowledged: true, matchedCount: r.matchedCount, modifiedCount: r.modifiedCount, upsertedId: r.upsertedId, upsertedCount: r.upsertedCount };
  }

  async updateMany(filter, update, options = {}) {
    const r = await this._update(filter, update, { many: true, upsert: options.upsert });
    return { acknowledged: true, matchedCount: r.matchedCount, modifiedCount: r.modifiedCount, upsertedId: r.upsertedId, upsertedCount: r.upsertedCount };
  }

  async replaceOne(filter, doc, options = {}) {
    const rest = { ...doc };
    delete rest._id;
    return this.updateOne(filter, rest, options);
  }

  async findOneAndUpdate(filter, update, options = {}) {
    const r = await this._update(filter, update, { upsert: options.upsert, sort: options.sort });
    const doc = options.returnDocument === 'after' || options.returnNewDocument ? r.after : r.before;
    const out = applyProjection(doc, options.projection) || null;
    return options.includeResultMetadata ? { value: out, ok: 1 } : out;
  }

  async findOneAndDelete(filter, options = {}) {
    const doc = await this.findOne(filter, options);
    if (!doc) return null;
    await this.deleteOne({ _id: doc._id });
    return doc;
  }

  async deleteOne(filter = {}) {
    await this._ready();
    const p = new Params();
    const { rowCount } = await this.store.pool.query(
      `DELETE FROM ${this.table} WHERE _id = (SELECT _id FROM ${this.table} WHERE ${compileFilter(filter, p)} LIMIT 1)`,
      p.values
    );
    return { acknowledged: true, deletedCount: rowCount };
  }

  async deleteMany(filter = {}) {
    await this._ready();
    const p = new Params();
    const { rowCount } = await this.store.pool.query(`DELETE FROM ${this.table} WHERE ${compileFilter(filter, p)}`, p.values);
    return { acknowledged: true, deletedCount: rowCount };
  }

  /** Índices: expresiones sobre el JSON; unique se respeta; expireAfterSeconds borra vencidos. */
  async createIndex(keys, options = {}) {
    await this._ready();
    const fields = Object.keys(keys).filter((k) => k !== '_id');
    if (options.expireAfterSeconds !== undefined && fields.length === 1) {
      this.store.addTtl(this.name, fields[0], Number(options.expireAfterSeconds) || 0);
    }
    if (!fields.length) return null;
    const exprs = fields.map((k) => `(doc #> ARRAY[${splitPath(k).map((s) => `'${s.replace(/'/g, "''")}'`).join(',')}])`);
    const name = options.name || `${this.name}_${fields.join('_')}${options.unique ? '_uq' : ''}`;
    const idx = quoteIdent(`${this.name}__${name}`.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 60));
    const where = options.unique ? ` WHERE ${exprs.map((e) => `${e} IS NOT NULL`).join(' AND ')}` : '';
    await this.store.ddl(
      `CREATE ${options.unique ? 'UNIQUE ' : ''}INDEX IF NOT EXISTS ${idx} ON ${this.table} (${exprs.join(', ')})${where}`
    );
    return name;
  }

  async drop() {
    await this.store.pool.query(`DROP TABLE IF EXISTS ${this.table}`);
    this.store.tables.delete(this.name);
  }
}

/** Errores de Postgres con el código que el backend ya espera (11000 = repetido). */
function mapError(err) {
  if (err && err.code === '23505') {
    const e = new Error(`Registro repetido: ${err.detail || err.message}`);
    e.code = 11000;
    e.cause = err;
    return e;
  }
  return err;
}

// ───────────────────────── Almacén ─────────────────────────

class PgStore {
  constructor({ connectionString, schema = 'timberpos', max = 10 } = {}) {
    this.schema = schema;
    this.pool = new Pool({ connectionString, max, idleTimeoutMillis: 30000, connectionTimeoutMillis: 10000 });
    this.pool.on('error', (err) => console.error('[pg] conexión perdida:', err.message));
    this.tables = new Map();
    this.ddlDone = new Map();
    this.ttl = new Map();
    this.ttlTimer = null;
    this.ready = null;
  }

  /** Crea el esquema (si se puede) y comprueba la conexión. */
  init() {
    if (!this.ready) {
      this.ready = (async () => {
        await this.pool.query(`CREATE SCHEMA IF NOT EXISTS ${quoteIdent(this.schema)}`).catch(() => {});
        await this.pool.query('SELECT 1');
      })().catch((err) => {
        this.ready = null;
        throw err;
      });
    }
    return this.ready;
  }

  collection(name) {
    return new Collection(this, name);
  }

  /** Nombre completo esquema.tabla (no depende del search_path). */
  qualified(name) {
    return `${quoteIdent(this.schema)}.${quoteIdent(name)}`;
  }

  async tx(fn) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const out = await fn(client);
      await client.query('COMMIT');
      return out;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  /** CREATE TABLE una sola vez por proceso; el candado evita choques entre procesos. */
  ensureTable(name) {
    if (!this.tables.has(name)) {
      const p = (async () => {
        await this.init();
        const t = this.qualified(name);
        await this.tx(async (c) => {
          await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`${this.schema}.${name}`]);
          await c.query(`CREATE TABLE IF NOT EXISTS ${t} (_id text PRIMARY KEY, doc jsonb NOT NULL DEFAULT '{}'::jsonb)`);
          await c.query(`CREATE INDEX IF NOT EXISTS ${quoteIdent(`${name}__doc_gin`.slice(0, 60))} ON ${t} USING gin (doc jsonb_path_ops)`);
        });
      })().catch((err) => {
        this.tables.delete(name);
        throw err;
      });
      this.tables.set(name, p);
    }
    return this.tables.get(name);
  }

  ddl(sql) {
    if (!this.ddlDone.has(sql)) {
      const p = this.tx(async (c) => {
        await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [sql]);
        await c.query(sql);
      }).catch((err) => {
        this.ddlDone.delete(sql);
        throw mapError(err);
      });
      this.ddlDone.set(sql, p);
    }
    return this.ddlDone.get(sql);
  }

  /** Documentos con fecha de vencimiento: se borran solos cada 5 minutos. */
  addTtl(name, field, seconds) {
    this.ttl.set(`${name}.${field}`, { name, field, seconds });
    if (this.ttlTimer) return;
    this.ttlTimer = setInterval(() => this.sweepTtl().catch(() => {}), 5 * 60 * 1000);
    this.ttlTimer.unref?.();
  }

  async sweepTtl() {
    for (const { name, field, seconds } of this.ttl.values()) {
      await this.pool.query(
        `DELETE FROM ${this.qualified(name)} WHERE (doc #> ARRAY[${splitPath(field).map((s) => `'${s.replace(/'/g, "''")}'`).join(',')}] ->> '$date')::timestamptz < now() - make_interval(secs => $1)`,
        [seconds]
      );
    }
  }

  async close() {
    clearInterval(this.ttlTimer);
    await this.pool.end();
  }
}

module.exports = { PgStore, ObjectId, encode, decode, applyUpdate, compileFilter, Params };
