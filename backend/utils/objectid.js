/**
 * Identificador de 24 caracteres hexadecimales, compatible con los ids que ya existen
 * (mismo formato que los ObjectId de MongoDB: 4 bytes de fecha + 5 aleatorios + 3 de contador).
 * Así los ids de tiendas, productos y ventas no cambian al pasar a PostgreSQL.
 */
const crypto = require('crypto');
const util = require('util');

const HEX24 = /^[0-9a-fA-F]{24}$/;
const PROCESS_RANDOM = crypto.randomBytes(5);
let counter = crypto.randomInt(0xffffff);

function generate() {
  const buf = Buffer.alloc(12);
  buf.writeUInt32BE(Math.floor(Date.now() / 1000), 0);
  PROCESS_RANDOM.copy(buf, 4);
  counter = (counter + 1) % 0x1000000;
  buf.writeUIntBE(counter, 9, 3);
  return buf.toString('hex');
}

class ObjectId {
  constructor(id) {
    if (id == null) this.hex = generate();
    else if (id instanceof ObjectId) this.hex = id.hex;
    else if (typeof id === 'string' && HEX24.test(id)) this.hex = id.toLowerCase();
    else throw new TypeError(`Id inválido: ${String(id).slice(0, 40)}`);
  }

  static isValid(value) {
    if (value instanceof ObjectId) return true;
    return typeof value === 'string' && HEX24.test(value);
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

  [util.inspect.custom]() {
    return `ObjectId('${this.hex}')`;
  }
}

module.exports = { ObjectId };
