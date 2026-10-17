/**
 * Almacén de documentos en SQLite con la forma del driver de MongoDB que usa este backend.
 *
 * La versión instalable guarda todo en un archivo SQLite local. En lugar de reescribir la capa de datos
 * (database/mongodb.js y compañía), este módulo ofrece el subconjunto del driver que el código usa:
 * MongoClient/Db/Collection, ObjectId, cursores (sort/limit/project/toArray), operadores de consulta y de
 * actualización, findOneAndUpdate, upserts, índices (únicos, parciales y TTL) y las dos agregaciones.
 *
 * Cada colección es una tabla `(id TEXT PRIMARY KEY, data TEXT)` con el documento en JSON. Las fechas y los
 * ObjectId se guardan etiquetados ({"$date": iso} / {"$oid": hex}) para recuperarlos con su tipo.
 * Las consultas filtran primero en SQL lo que se puede traducir sin ambigüedad (igualdad, $in y rangos de
 * campos de primer nivel) y luego aplican el filtro completo en JS, así el resultado es siempre exacto.
 * better-sqlite3 es síncrono: cada operación corre completa sin ceder el hilo, por lo que es atómica.
 * Un operador que no se conoce lanza error en vez de ignorarse.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

// ───────────────────────────── ObjectId ─────────────────────────────
class ObjectId {
  constructor(id) {
    if (id === undefined || id === null) {
      this.hex = crypto.randomBytes(12).toString('hex');
      return;
    }
    const s = id instanceof ObjectId ? id.hex : String(id);
    if (!/^[0-9a-fA-F]{24}$/.test(s)) throw new TypeError('input must be a 24 character hex string');
    this.hex = s.toLowerCase();
  }
  static isValid(v) {
    if (v instanceof ObjectId) return true;
    return typeof v === 'string' && /^[0-9a-fA-F]{24}$/.test(v);
  }
  toString() {
    return this.hex;
  }
  toHexString() {
    return this.hex;
  }
  toJSON() {
    return this.hex;
  }
  equals(other) {
    return other != null && String(other).toLowerCase() === this.hex;
  }
  getTimestamp() {
    return new Date(parseInt(this.hex.slice(0, 8), 16) * 1000);
  }
  [Symbol.for('nodejs.util.inspect.custom')]() {
    return `new ObjectId('${this.hex}')`;
  }
}

// ───────────────────────────── Serialización ─────────────────────────────
function encode(doc) {
  return JSON.stringify(doc, function replacer(key, value) {
    const raw = this[key];
    if (raw instanceof Date) return { $date: Number.isNaN(raw.getTime()) ? null : raw.toISOString() };
    if (raw instanceof ObjectId) return { $oid: raw.hex };
    return value;
  });
}
function decode(text) {
  return JSON.parse(text, (key, value) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const keys = Object.keys(value);
      if (keys.length === 1 && keys[0] === '$date') return value.$date === null ? new Date(NaN) : new Date(value.$date);
      if (keys.length === 1 && keys[0] === '$oid') return new ObjectId(value.$oid);
    }
    return value;
  });
}
const idKey = (id) => (id instanceof ObjectId ? id.hex : typeof id === 'object' ? encode(id) : String(id));
const clone = (v) => (v === undefined ? undefined : decode(encode(v)));

// ───────────────────────────── Valores y comparación ─────────────────────────────
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) && !(v instanceof ObjectId) && !(v instanceof RegExp);
function norm(v) {
  if (v instanceof ObjectId) return v.hex;
  return v;
}
function typeRank(v) {
  if (v === undefined || v === null) return 0;
  if (typeof v === 'number') return 1;
  if (typeof v === 'string' || v instanceof ObjectId) return 2;
  if (isPlainObject(v)) return 3;
  if (Array.isArray(v)) return 4;
  if (typeof v === 'boolean') return 5;
  if (v instanceof Date) return 6;
  return 7;
}
function equal(a, b) {
  a = norm(a);
  b = norm(b);
  if (a === b) return true;
  if ((a === null || a === undefined) && (b === null || b === undefined)) return true;
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => equal(x, b[i]));
  if (isPlainObject(a) && isPlainObject(b)) {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k, i) => k === kb[i] && equal(a[k], b[k]));
  }
  return false;
}
/** Orden de Mongo para el mismo tipo; tipos distintos se ordenan por rango. */
function compare(a, b) {
  const ra = typeRank(a);
  const rb = typeRank(b);
  if (ra !== rb) return ra - rb;
  a = norm(a);
  b = norm(b);
  if (a instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === 'number' || typeof a === 'boolean') return Number(a) - Number(b);
  if (typeof a === 'string') return a < b ? -1 : a > b ? 1 : 0;
  return 0;
}
/** Comparación de rango ($gt, $lt…): solo entre valores del mismo tipo, como Mongo. */
function rangeOk(v, op, target) {
  if (v === undefined || v === null || target === undefined || target === null) return false;
  if (typeRank(v) !== typeRank(target)) return false;
  const c = compare(v, target);
  if (op === '$gt') return c > 0;
  if (op === '$gte') return c >= 0;
  if (op === '$lt') return c < 0;
  return c <= 0;
}

// ───────────────────────────── Rutas ─────────────────────────────
/** Valores en la ruta, recorriendo arreglos como Mongo ("items.foodId" mira cada renglón). */
function resolve(doc, pathStr) {
  let current = [doc];
  for (const part of pathStr.split('.')) {
    const next = [];
    for (const v of current) {
      if (v === null || v === undefined) continue;
      if (Array.isArray(v)) {
        if (/^\d+$/.test(part)) {
          if (v[Number(part)] !== undefined) next.push(v[Number(part)]);
        } else {
          for (const el of v) if (el && typeof el === 'object' && el[part] !== undefined) next.push(el[part]);
        }
      } else if (typeof v === 'object' && v[part] !== undefined) {
        next.push(v[part]);
      }
    }
    current = next;
  }
  return current;
}
function getPath(doc, pathStr) {
  let v = doc;
  for (const part of pathStr.split('.')) {
    if (v === null || v === undefined) return undefined;
    v = v[part];
  }
  return v;
}
function setPath(doc, pathStr, value) {
  const parts = pathStr.split('.');
  let v = doc;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (v[p] === null || v[p] === undefined || typeof v[p] !== 'object') v[p] = /^\d+$/.test(parts[i + 1]) ? [] : {};
    v = v[p];
  }
  v[parts[parts.length - 1]] = value;
}
function unsetPath(doc, pathStr) {
  const parts = pathStr.split('.');
  let v = doc;
  for (let i = 0; i < parts.length - 1; i++) {
    v = v?.[parts[i]];
    if (v === null || v === undefined) return;
  }
  if (Array.isArray(v)) v[Number(parts[parts.length - 1])] = null;
  else if (v) delete v[parts[parts.length - 1]];
}

// ───────────────────────────── Consultas ─────────────────────────────
const TYPE_TEST = {
  string: (v) => typeof v === 'string',
  number: (v) => typeof v === 'number',
  double: (v) => typeof v === 'number',
  int: (v) => Number.isInteger(v),
  bool: (v) => typeof v === 'boolean',
  date: (v) => v instanceof Date,
  object: (v) => isPlainObject(v),
  array: (v) => Array.isArray(v),
  null: (v) => v === null,
  objectId: (v) => v instanceof ObjectId,
};
function toRegex(pattern, options) {
  if (pattern instanceof RegExp) return options ? new RegExp(pattern.source, options) : pattern;
  return new RegExp(String(pattern), options || '');
}
/** ¿Alguno de los valores (o elementos de arreglo) cumple la condición? */
function anyValue(values, test) {
  for (const v of values) {
    if (test(v)) return true;
    if (Array.isArray(v) && v.some(test)) return true;
  }
  return false;
}
function matchCondition(doc, pathStr, cond) {
  const values = resolve(doc, pathStr);
  if (cond instanceof RegExp) return anyValue(values, (v) => typeof v === 'string' && cond.test(v));
  const isOps = isPlainObject(cond) && Object.keys(cond).length > 0 && Object.keys(cond).every((k) => k.startsWith('$'));
  if (!isOps) {
    if (cond === null) return values.length === 0 || anyValue(values, (v) => v === null);
    if (Array.isArray(cond)) return values.some((v) => equal(v, cond)) || anyValue(values, (v) => equal(v, cond));
    return anyValue(values, (v) => equal(v, cond)) || values.some((v) => equal(v, cond));
  }
  for (const [op, arg] of Object.entries(cond)) {
    switch (op) {
      case '$eq':
        if (!matchCondition(doc, pathStr, arg === null ? null : arg)) return false;
        break;
      case '$ne':
        if (arg === null) {
          if (values.length === 0 || anyValue(values, (v) => v === null)) return false;
        } else if (anyValue(values, (v) => equal(v, arg))) {
          return false;
        }
        break;
      case '$gt':
      case '$gte':
      case '$lt':
      case '$lte':
        if (!anyValue(values, (v) => rangeOk(v, op, arg))) return false;
        break;
      case '$in':
        if (!arg.some((a) => (a instanceof RegExp ? anyValue(values, (v) => typeof v === 'string' && a.test(v)) : a === null ? values.length === 0 || anyValue(values, (v) => v === null) : anyValue(values, (v) => equal(v, a))))) return false;
        break;
      case '$nin':
        if (arg.some((a) => (a === null ? values.length === 0 || anyValue(values, (v) => v === null) : anyValue(values, (v) => equal(v, a))))) return false;
        break;
      case '$exists':
        if (Boolean(arg) !== (values.length > 0)) return false;
        break;
      case '$type': {
        const test = TYPE_TEST[arg];
        if (!test) throw new Error(`sqlite-store: $type "${arg}" no soportado`);
        if (!values.some(test)) return false;
        break;
      }
      case '$regex': {
        const re = toRegex(arg, cond.$options);
        if (!anyValue(values, (v) => typeof v === 'string' && re.test(v))) return false;
        break;
      }
      case '$options':
        break;
      case '$not':
        if (matchCondition(doc, pathStr, arg)) return false;
        break;
      case '$size':
        if (!values.some((v) => Array.isArray(v) && v.length === arg)) return false;
        break;
      case '$all':
        if (!arg.every((a) => anyValue(values, (v) => equal(v, a)))) return false;
        break;
      case '$elemMatch':
        if (!values.some((v) => Array.isArray(v) && v.some((el) => (isPlainObject(el) ? matches(el, arg) : matchCondition({ x: el }, 'x', arg))))) return false;
        break;
      default:
        throw new Error(`sqlite-store: operador de consulta ${op} no soportado`);
    }
  }
  return true;
}
function matches(doc, filter) {
  if (!filter) return true;
  for (const [key, cond] of Object.entries(filter)) {
    if (key === '$and') {
      if (!cond.every((f) => matches(doc, f))) return false;
    } else if (key === '$or') {
      if (!cond.some((f) => matches(doc, f))) return false;
    } else if (key === '$nor') {
      if (cond.some((f) => matches(doc, f))) return false;
    } else if (key === '$expr') {
      if (!truthy(evalExpr(doc, cond))) return false;
    } else if (key.startsWith('$')) {
      throw new Error(`sqlite-store: operador ${key} no soportado`);
    } else if (!matchCondition(doc, key, cond)) {
      return false;
    }
  }
  return true;
}

// ───────────────────────────── Expresiones (agregación y $expr) ─────────────────────────────
const truthy = (v) => !(v === false || v === null || v === undefined || v === 0);
function evalExpr(doc, e) {
  if (typeof e === 'string' && e.startsWith('$')) return getPath(doc, e.slice(1));
  if (Array.isArray(e)) return e.map((x) => evalExpr(doc, x));
  if (!isPlainObject(e)) return e;
  const keys = Object.keys(e);
  if (keys.length !== 1 || !keys[0].startsWith('$')) {
    const out = {};
    for (const k of keys) out[k] = evalExpr(doc, e[k]);
    return out;
  }
  const op = keys[0];
  const args = Array.isArray(e[op]) ? e[op].map((x) => evalExpr(doc, x)) : evalExpr(doc, e[op]);
  const a = Array.isArray(args) ? args : [args];
  switch (op) {
    case '$ifNull':
      return a.find((v) => v !== null && v !== undefined) ?? null;
    case '$add':
      return a.reduce((s, v) => (v instanceof Date ? new Date(v.getTime() + s) : s + Number(v || 0)), 0);
    case '$subtract':
      return Number(a[0] || 0) - Number(a[1] || 0);
    case '$multiply':
      return a.reduce((s, v) => s * Number(v || 0), 1);
    case '$eq':
      return equal(a[0], a[1]);
    case '$ne':
      return !equal(a[0], a[1]);
    case '$gt':
      return compare(a[0], a[1]) > 0;
    case '$gte':
      return compare(a[0], a[1]) >= 0;
    case '$lt':
      return compare(a[0], a[1]) < 0;
    case '$lte':
      return compare(a[0], a[1]) <= 0;
    case '$and':
      return a.every(truthy);
    case '$or':
      return a.some(truthy);
    case '$not':
      return !truthy(a[0]);
    case '$cond': {
      if (isPlainObject(e[op])) return truthy(evalExpr(doc, e[op].if)) ? evalExpr(doc, e[op].then) : evalExpr(doc, e[op].else);
      return truthy(a[0]) ? a[1] : a[2];
    }
    default:
      throw new Error(`sqlite-store: expresión ${op} no soportada`);
  }
}

// ───────────────────────────── Actualizaciones ─────────────────────────────
function applyUpdate(doc, update, { inserting = false } = {}) {
  if (!update || typeof update !== 'object') throw new Error('sqlite-store: actualización inválida');
  const ops = Object.keys(update);
  if (!ops.length || !ops.every((k) => k.startsWith('$'))) throw new Error('sqlite-store: la actualización debe usar operadores ($set, $inc…)');
  for (const [op, fields] of Object.entries(update)) {
    for (const [p, val] of Object.entries(fields || {})) {
      switch (op) {
        case '$set':
          setPath(doc, p, clone(val));
          break;
        case '$setOnInsert':
          if (inserting) setPath(doc, p, clone(val));
          break;
        case '$unset':
          unsetPath(doc, p);
          break;
        case '$inc':
          setPath(doc, p, Number(getPath(doc, p) || 0) + Number(val));
          break;
        case '$mul':
          setPath(doc, p, Number(getPath(doc, p) || 0) * Number(val));
          break;
        case '$max': {
          const cur = getPath(doc, p);
          if (cur === undefined || compare(val, cur) > 0) setPath(doc, p, clone(val));
          break;
        }
        case '$min': {
          const cur = getPath(doc, p);
          if (cur === undefined || compare(val, cur) < 0) setPath(doc, p, clone(val));
          break;
        }
        case '$push': {
          const arr = Array.isArray(getPath(doc, p)) ? getPath(doc, p) : [];
          const items = isPlainObject(val) && Array.isArray(val.$each) ? val.$each : [val];
          arr.push(...items.map(clone));
          if (isPlainObject(val) && typeof val.$slice === 'number') {
            const sliced = val.$slice < 0 ? arr.slice(val.$slice) : arr.slice(0, val.$slice);
            arr.length = 0;
            arr.push(...sliced);
          }
          setPath(doc, p, arr);
          break;
        }
        case '$addToSet': {
          const arr = Array.isArray(getPath(doc, p)) ? getPath(doc, p) : [];
          const items = isPlainObject(val) && Array.isArray(val.$each) ? val.$each : [val];
          for (const it of items) if (!arr.some((x) => equal(x, it))) arr.push(clone(it));
          setPath(doc, p, arr);
          break;
        }
        case '$pull': {
          const arr = getPath(doc, p);
          if (!Array.isArray(arr)) break;
          const keep = arr.filter((el) => {
            if (isPlainObject(val)) {
              const isOps = Object.keys(val).every((k) => k.startsWith('$'));
              return isOps ? !matchCondition({ x: el }, 'x', val) : !(isPlainObject(el) && matches(el, val));
            }
            return !equal(el, val);
          });
          setPath(doc, p, keep);
          break;
        }
        default:
          throw new Error(`sqlite-store: operador de actualización ${op} no soportado`);
      }
    }
  }
  return doc;
}
/** Documento base de un upsert: las igualdades simples del filtro. */
function seedFromFilter(filter) {
  const doc = {};
  for (const [k, v] of Object.entries(filter || {})) {
    if (k.startsWith('$')) continue;
    if (isPlainObject(v) && Object.keys(v).some((x) => x.startsWith('$'))) {
      if ('$eq' in v) setPath(doc, k, clone(v.$eq));
      continue;
    }
    setPath(doc, k, clone(v));
  }
  return doc;
}

// ───────────────────────────── Proyección y orden ─────────────────────────────
function project(doc, projection) {
  if (!projection || !Object.keys(projection).length) return doc;
  const entries = Object.entries(projection).filter(([k]) => k !== '_id');
  const include = entries.some(([, v]) => v === 1 || v === true);
  if (include) {
    const out = {};
    if (projection._id !== 0 && projection._id !== false && doc._id !== undefined) out._id = doc._id;
    for (const [k, v] of entries) if (v === 1 || v === true) {
      const val = getPath(doc, k);
      if (val !== undefined) setPath(out, k, val);
    }
    return out;
  }
  const out = clone(doc);
  for (const [k, v] of Object.entries(projection)) if (v === 0 || v === false) unsetPath(out, k);
  return out;
}
function sortDocs(docs, sort) {
  const keys = Object.entries(sort || {});
  if (!keys.length) return docs;
  return docs.sort((a, b) => {
    for (const [k, dir] of keys) {
      const c = compare(getPath(a, k), getPath(b, k));
      if (c) return dir < 0 ? -c : c;
    }
    return 0;
  });
}

// ───────────────────────────── SQL ─────────────────────────────
const SAFE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SAFE_FIELD = /^[A-Za-z_][A-Za-z0-9_]*$/;
/** Valor escalar de un campo de primer nivel en SQL (fecha → ISO, ObjectId → hex). Igual en índices y consultas. */
const fx = (field) => `coalesce(json_extract(data, '$."${field}"."$date"'), json_extract(data, '$."${field}"."$oid"'), json_extract(data, '$."${field}"'))`;
function sqlParam(v) {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? undefined : v.toISOString();
  if (v instanceof ObjectId) return v.hex;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v))) return v;
  return undefined;
}
/**
 * Traduce a SQL las partes del filtro que se pueden expresar sin perder exactitud.
 * Devuelve el WHERE (que puede quedarse corto: siempre se re-filtra en JS) y si quedó completo.
 */
function sqlFilter(filter) {
  const where = [];
  const params = [];
  let complete = true;
  for (const [key, cond] of Object.entries(filter || {})) {
    if (key === '_id' && (typeof cond === 'string' || cond instanceof ObjectId)) {
      where.push('id = ?');
      params.push(idKey(cond));
      continue;
    }
    if (key.startsWith('$') || !SAFE_FIELD.test(key)) {
      complete = false;
      continue;
    }
    const scalar = sqlParam(cond);
    if (scalar !== undefined) {
      // Un arreglo que contenga el valor también coincide en Mongo: esos los decide el filtro en JS
      where.push(`(${fx(key)} = ? OR json_type(data, '$."${key}"') = 'array')`);
      params.push(scalar);
      continue;
    }
    if (isPlainObject(cond) && Object.keys(cond).length && Object.keys(cond).every((k) => k.startsWith('$'))) {
      let all = true;
      for (const [op, arg] of Object.entries(cond)) {
        if (['$gt', '$gte', '$lt', '$lte'].includes(op) && sqlParam(arg) !== undefined) {
          const sym = { $gt: '>', $gte: '>=', $lt: '<', $lte: '<=' }[op];
          // Solo mismo tipo: una fecha se compara contra la etiqueta $date, un número contra números
          const typeCheck = arg instanceof Date ? `json_type(data, '$."${key}"."$date"') = 'text'` : typeof arg === 'number' ? `json_type(data, '$."${key}"') IN ('integer','real')` : `json_type(data, '$."${key}"') = 'text'`;
          where.push(`(${typeCheck} AND ${fx(key)} ${sym} ?)`);
          params.push(sqlParam(arg));
        } else if (op === '$in' && Array.isArray(arg) && arg.length && arg.every((a) => typeof a === 'string' || a instanceof ObjectId)) {
          where.push(`(${fx(key)} IN (${arg.map(() => '?').join(',')}) OR json_type(data, '$."${key}"') = 'array')`);
          params.push(...arg.map(idKey));
        } else {
          all = false;
        }
      }
      if (!all) complete = false;
      continue;
    }
    complete = false;
  }
  return { where: where.length ? `WHERE ${where.join(' AND ')}` : '', params, complete };
}

// ───────────────────────────── Errores ─────────────────────────────
function duplicateError(err, col) {
  const e = new Error(`E11000 duplicate key error collection: ${col} (${err.message})`);
  e.code = 11000;
  e.name = 'MongoServerError';
  return e;
}
const isUniqueErr = (err) => err && (err.code === 'SQLITE_CONSTRAINT_UNIQUE' || err.code === 'SQLITE_CONSTRAINT_PRIMARYKEY');

// ───────────────────────────── Cursor ─────────────────────────────
class Cursor {
  constructor(run) {
    this._run = run;
    this._sort = null;
    this._limit = 0;
    this._projection = null;
    this._buffer = null;
  }
  sort(s) {
    this._sort = s;
    return this;
  }
  limit(n) {
    this._limit = Number(n) || 0;
    return this;
  }
  project(p) {
    this._projection = p;
    return this;
  }
  async toArray() {
    return this._run({ sort: this._sort, limit: this._limit, projection: this._projection });
  }
  async next() {
    if (!this._buffer) this._buffer = await this.toArray();
    return this._buffer.length ? this._buffer.shift() : null;
  }
  async *[Symbol.asyncIterator]() {
    for (const d of await this.toArray()) yield d;
  }
}

// ───────────────────────────── Collection ─────────────────────────────
class Collection {
  constructor(store, name) {
    if (!SAFE_NAME.test(name)) throw new Error(`sqlite-store: nombre de colección inválido: ${name}`);
    this.store = store;
    this.collectionName = name;
  }
  get db() {
    return this.store.handle(this.collectionName);
  }
  _rows(filter, { sort, limit } = {}) {
    const { where, params, complete } = sqlFilter(filter);
    let sql = `SELECT data FROM "${this.collectionName}" ${where}`;
    // Con el filtro completo en SQL y orden por campos de primer nivel, el orden y el límite van en SQL
    const sortKeys = Object.keys(sort || {});
    const sqlSort = complete && sortKeys.every((k) => SAFE_FIELD.test(k));
    if (sqlSort && sortKeys.length) sql += ` ORDER BY ${sortKeys.map((k) => `${fx(k)} ${sort[k] < 0 ? 'DESC' : 'ASC'}`).join(', ')}`;
    if (sqlSort && limit) sql += ` LIMIT ${Number(limit)}`;
    let docs = this.db.prepare(sql).all(...params).map((r) => decode(r.data));
    docs = docs.filter((d) => matches(d, filter));
    // Orden exacto de Mongo en JS (también corrige el orden SQL entre tipos mezclados)
    if (sortKeys.length) docs = sortDocs(docs, sort);
    if (limit) docs = docs.slice(0, limit);
    return docs;
  }
  _first(filter, sort) {
    return this._rows(filter, { sort, limit: 1 })[0] || null;
  }
  _write(doc) {
    this.db.prepare(`UPDATE "${this.collectionName}" SET data = ? WHERE id = ?`).run(encode(doc), idKey(doc._id));
  }
  _insert(doc) {
    if (doc._id === undefined) doc._id = new ObjectId();
    try {
      this.db.prepare(`INSERT INTO "${this.collectionName}" (id, data) VALUES (?, ?)`).run(idKey(doc._id), encode(doc));
    } catch (err) {
      if (isUniqueErr(err)) throw duplicateError(err, this.collectionName);
      throw err;
    }
    return doc._id;
  }

  find(filter = {}, options = {}) {
    const cur = new Cursor(async ({ sort, limit, projection }) => this._rows(filter, { sort: sort || options.sort, limit: limit || options.limit }).map((d) => project(d, projection || options.projection)));
    return cur;
  }
  async findOne(filter = {}, options = {}) {
    const d = this._first(filter, options.sort);
    return d ? project(d, options.projection) : null;
  }
  async countDocuments(filter = {}, options = {}) {
    const docs = this._rows(filter, { limit: options.limit });
    return docs.length;
  }
  async estimatedDocumentCount() {
    return this.db.prepare(`SELECT count(*) n FROM "${this.collectionName}"`).get().n;
  }
  async insertOne(doc) {
    const insertedId = this._insert(doc);
    return { acknowledged: true, insertedId };
  }
  async insertMany(docs) {
    const insertedIds = {};
    this.store.transaction(() => docs.forEach((d, i) => (insertedIds[i] = this._insert(d))));
    return { acknowledged: true, insertedCount: docs.length, insertedIds };
  }
  _update(filter, update, options, many) {
    return this.store.transaction(() => {
      const targets = many ? this._rows(filter) : [this._first(filter, options.sort)].filter(Boolean);
      if (!targets.length) {
        if (!options.upsert) return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 0, upsertedId: null };
        const doc = applyUpdate(seedFromFilter(filter), update, { inserting: true });
        const upsertedId = this._insert(doc);
        return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 1, upsertedId, doc };
      }
      let modified = 0;
      for (const doc of targets) {
        const before = encode(doc);
        applyUpdate(doc, update);
        if (encode(doc) !== before) {
          try {
            this._write(doc);
          } catch (err) {
            if (isUniqueErr(err)) throw duplicateError(err, this.collectionName);
            throw err;
          }
          modified++;
        }
      }
      return { acknowledged: true, matchedCount: targets.length, modifiedCount: modified, upsertedCount: 0, upsertedId: null };
    });
  }
  async updateOne(filter, update, options = {}) {
    const r = this._update(filter, update, options, false);
    delete r.doc;
    return r;
  }
  async updateMany(filter, update, options = {}) {
    const r = this._update(filter, update, options, true);
    delete r.doc;
    return r;
  }
  async findOneAndUpdate(filter, update, options = {}) {
    return this.store.transaction(() => {
      const found = this._first(filter, options.sort);
      if (!found) {
        if (!options.upsert) return null;
        const doc = applyUpdate(seedFromFilter(filter), update, { inserting: true });
        this._insert(doc);
        return options.returnDocument === 'after' ? project(doc, options.projection) : null;
      }
      const before = clone(found);
      applyUpdate(found, update);
      try {
        this._write(found);
      } catch (err) {
        if (isUniqueErr(err)) throw duplicateError(err, this.collectionName);
        throw err;
      }
      return project(options.returnDocument === 'after' ? found : before, options.projection);
    });
  }
  async findOneAndDelete(filter, options = {}) {
    return this.store.transaction(() => {
      const found = this._first(filter, options.sort);
      if (found) this.db.prepare(`DELETE FROM "${this.collectionName}" WHERE id = ?`).run(idKey(found._id));
      return found;
    });
  }
  async deleteOne(filter) {
    return this.store.transaction(() => {
      const found = this._first(filter);
      if (!found) return { acknowledged: true, deletedCount: 0 };
      this.db.prepare(`DELETE FROM "${this.collectionName}" WHERE id = ?`).run(idKey(found._id));
      return { acknowledged: true, deletedCount: 1 };
    });
  }
  async deleteMany(filter = {}) {
    return this.store.transaction(() => {
      const found = this._rows(filter);
      const del = this.db.prepare(`DELETE FROM "${this.collectionName}" WHERE id = ?`);
      for (const d of found) del.run(idKey(d._id));
      return { acknowledged: true, deletedCount: found.length };
    });
  }
  aggregate(pipeline) {
    return new Cursor(async () => {
      let docs = null;
      for (const stage of pipeline) {
        const [op] = Object.keys(stage);
        const arg = stage[op];
        if (op === '$match') docs = docs ? docs.filter((d) => matches(d, arg)) : this._rows(arg);
        else {
          if (!docs) docs = this._rows({});
          if (op === '$sort') docs = sortDocs(docs, arg);
          else if (op === '$limit') docs = docs.slice(0, arg);
          else if (op === '$project') docs = docs.map((d) => project(d, arg));
          else if (op === '$group') docs = group(docs, arg);
          else throw new Error(`sqlite-store: etapa ${op} no soportada`);
        }
      }
      return docs || this._rows({});
    });
  }
  async createIndex(keys, options = {}) {
    const fields = Object.keys(keys);
    if (!fields.every((f) => SAFE_FIELD.test(f))) return null;
    const name = `${this.collectionName}__${options.name || fields.join('_')}`.replace(/[^A-Za-z0-9_]/g, '_');
    if (options.expireAfterSeconds !== undefined) {
      this.store.addTtl(this.collectionName, fields[0], Number(options.expireAfterSeconds));
    }
    let partial = '';
    const pfe = options.partialFilterExpression;
    if (pfe) {
      const conds = [];
      for (const [f, c] of Object.entries(pfe)) {
        if (!SAFE_FIELD.test(f)) return null;
        if (c && c.$type === 'string') conds.push(`json_type(data, '$."${f}"') = 'text'`);
        else if (c && c.$exists === true) conds.push(`json_type(data, '$."${f}"') IS NOT NULL`);
        else return null;
      }
      partial = ` WHERE ${conds.join(' AND ')}`;
    } else if (options.sparse) {
      partial = ` WHERE ${fields.map((f) => `json_type(data, '$."${f}"') IS NOT NULL`).join(' AND ')}`;
    }
    const unique = options.unique ? 'UNIQUE ' : '';
    this.db.exec(`CREATE ${unique}INDEX IF NOT EXISTS "${name}" ON "${this.collectionName}" (${fields.map(fx).join(', ')})${partial}`);
    return name;
  }
  async createIndexes(specs) {
    for (const s of specs) await this.createIndex(s.key, s);
  }
  async drop() {
    this.db.exec(`DROP TABLE IF EXISTS "${this.collectionName}"`);
    return true;
  }
}

function group(docs, spec) {
  const groups = new Map();
  for (const d of docs) {
    const keyVal = evalExpr(d, spec._id);
    const k = encode(keyVal === undefined ? null : keyVal);
    if (!groups.has(k)) groups.set(k, { _id: keyVal === undefined ? null : keyVal, __n: {} });
    const g = groups.get(k);
    for (const [field, acc] of Object.entries(spec)) {
      if (field === '_id') continue;
      const [op] = Object.keys(acc);
      const v = evalExpr(d, acc[op]);
      if (op === '$sum') g[field] = (g[field] || 0) + (typeof v === 'number' ? v : 0);
      else if (op === '$max') g[field] = g[field] === undefined || compare(v, g[field]) > 0 ? v : g[field];
      else if (op === '$min') g[field] = g[field] === undefined || compare(v, g[field]) < 0 ? v : g[field];
      else if (op === '$first') { if (!(field in g)) g[field] = v; }
      else if (op === '$last') g[field] = v;
      else if (op === '$avg') { g.__n[field] = (g.__n[field] || 0) + 1; g[field] = (g[field] || 0) + Number(v || 0); }
      else if (op === '$push') (g[field] = g[field] || []).push(v);
      else throw new Error(`sqlite-store: acumulador ${op} no soportado`);
    }
  }
  return [...groups.values()].map((g) => {
    for (const [f, n] of Object.entries(g.__n)) g[f] = g[f] / n;
    delete g.__n;
    return g;
  });
}

// ───────────────────────────── Store / Db / Client ─────────────────────────────
class Store {
  constructor(file) {
    this.file = file;
    this.sqlite = null;
    this.tables = new Set();
    this.ttl = new Map();
    this.ttlTimer = null;
  }
  open() {
    if (this.sqlite) return this.sqlite;
    if (this.file !== ':memory:') fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const db = new Database(this.file);
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = FULL');
    db.pragma('busy_timeout = 5000');
    this.sqlite = db;
    this.ttlTimer = setInterval(() => this.purgeExpired(), 60 * 1000);
    this.ttlTimer.unref?.();
    return db;
  }
  handle(table) {
    const db = this.open();
    if (!this.tables.has(table)) {
      db.exec(`CREATE TABLE IF NOT EXISTS "${table}" (id TEXT PRIMARY KEY, data TEXT NOT NULL CHECK (json_valid(data)))`);
      this.tables.add(table);
    }
    return db;
  }
  transaction(fn) {
    const db = this.open();
    if (db.inTransaction) return fn();
    return db.transaction(fn).immediate();
  }
  addTtl(table, field, seconds) {
    this.ttl.set(`${table}.${field}`, { table, field, seconds });
    this.purgeExpired();
  }
  purgeExpired() {
    if (!this.sqlite) return;
    for (const { table, field, seconds } of this.ttl.values()) {
      const cutoff = new Date(Date.now() - seconds * 1000).toISOString();
      try {
        this.handle(table).prepare(`DELETE FROM "${table}" WHERE json_type(data, '$."${field}"."$date"') = 'text' AND ${fx(field)} < ?`).run(cutoff);
      } catch (err) {
        console.warn('[sqlite] limpieza TTL falló:', err.message);
      }
    }
  }
  /** Copia consistente del archivo (también con WAL activo). */
  backup(dest) {
    return this.open().backup(dest);
  }
  close() {
    clearInterval(this.ttlTimer);
    this.sqlite?.close();
    this.sqlite = null;
    this.tables.clear();
  }
}

class Db {
  constructor(store) {
    this.store = store;
    this.cols = new Map();
  }
  collection(name) {
    if (!this.cols.has(name)) this.cols.set(name, new Collection(this.store, name));
    return this.cols.get(name);
  }
  async command(cmd) {
    if (cmd && cmd.ping) {
      this.store.open().prepare('SELECT 1').get();
      return { ok: 1 };
    }
    throw new Error('sqlite-store: comando no soportado');
  }
}

/** Ruta del archivo: SQLITE_PATH, o data/mitiendita.db junto al backend. */
function defaultFile() {
  return process.env.SQLITE_PATH || path.join(__dirname, '..', 'data', 'local', 'mitiendita.db');
}

class MongoClient {
  constructor() {
    this.store = new Store(defaultFile());
    this.dbs = new Map();
    this.listeners = {};
  }
  async connect() {
    this.store.open();
    return this;
  }
  db() {
    // Una sola base local: el nombre se ignora
    if (!this.dbs.has('main')) this.dbs.set('main', new Db(this.store));
    return this.dbs.get('main');
  }
  on(event, fn) {
    (this.listeners[event] = this.listeners[event] || []).push(fn);
    return this;
  }
  async close() {
    this.store.close();
    (this.listeners.close || []).forEach((fn) => fn());
  }
}

module.exports = { MongoClient, ObjectId, Store, Db, Collection, matches, applyUpdate };
