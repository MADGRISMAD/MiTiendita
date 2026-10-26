require('dotenv').config();
const { codeVariants } = require('../utils/barcode');
const { blockedByPlan } = require('../services/branch-plan');
const { MongoClient, ObjectId } = require('mongodb');
const { createTenantDoc } = require('../models/tenant.model');
const { reserveSaleStock } = require('../services/sale-stock.service');
const { withPriceFlag } = require('../utils/needs-price');

const _url = process.env.DATABASE_URI || 'mongodb://127.0.0.1:27017';
const _dbName = process.env.DATABASE_NAME || 'timber';

const connection = new MongoClient(_url, {
  maxPoolSize: 10,
  minPoolSize: 0,
  maxIdleTimeMS: 30000,
  serverSelectionTimeoutMS: 5000,
  connectTimeoutMS: 10000,
});
let dbConnection = connection.db(_dbName);
let connected = false;

function withId(doc) {
  if (!doc) return doc;
  const { _id, ...rest } = doc;
  return { ...rest, id: String(_id), _id };
}

/** Colección cruda (para servicios como el límite de peticiones). */
function getCollection(name) {
  return dbConnection ? dbConnection.collection(name) : null;
}

function oidFilter(id, tenantId) {
  if (!ObjectId.isValid(id) || String(new ObjectId(id)) !== String(id)) return null;
  const filter = { _id: new ObjectId(id) };
  if (tenantId) filter.tenantId = tenantId;
  return filter;
}

async function ensureConnection() {
  if (connected) {
    try {
      await connection.db('admin').command({ ping: 1 });
      return;
    } catch {
      connected = false;
    }
  }
  await connection.connect();
  dbConnection = connection.db(_dbName);
  connected = true;
  console.log(`MongoDB connected → ${_dbName} @ ${_url}`);

  connection.on('close', () => { connected = false; });
  connection.on('error', () => { connected = false; });

  await migrateLegacyTenant();
  await ensureIndexes();
}

async function ensureIndexes() {
  await dbConnection.collection('orders').createIndex(
    { tenantId: 1, clientSaleId: 1 },
    { unique: true, sparse: true, name: 'tenant_clientSaleId' }
  );
  // Consultas más usadas de ventas: reportes y tablero (fecha), corte de caja (turno) e historial de clientes
  for (const [col, keys] of [
    ['orders', { tenantId: 1, createdAt: -1 }],
    ['orders', { tenantId: 1, cashSessionId: 1 }],
    ['orders', { tenantId: 1, customerId: 1, createdAt: -1 }],
    ['foods', { tenantId: 1, barcode: 1 }],
    ['foods', { tenantId: 1, altCodes: 1 }],
    ['master_catalog_items', { catalog: 1, section: 1 }],
    ['foods', { tenantId: 1, sku: 1 }],
    ['cash_sessions', { tenantId: 1, status: 1 }],
    ['print_jobs', { tenantId: 1, status: 1, createdAt: 1 }],
    ['print_stations', { tenantId: 1, stationId: 1 }],
  ]) {
    await dbConnection.collection(col).createIndex(keys).catch(() => {});
  }
  // Los trabajos de impresión no se guardan más de 3 días
  await dbConnection.collection('print_jobs').createIndex({ createdAt: 1 }, { expireAfterSeconds: 3 * 24 * 60 * 60 }).catch(() => {});
  // Códigos de verificación de correo del registro: se borran solos al vencer
  await dbConnection.collection('email_codes').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }).catch(() => {});
  // Un mismo cobro de Mercado Pago no se registra dos veces
  await dbConnection
    .collection('billing_events')
    .createIndex({ mpPaymentId: 1 }, { unique: true, partialFilterExpression: { mpPaymentId: { $type: 'string' } } })
    .catch(() => {});
  await dbConnection.collection('billing_events').createIndex({ type: 1, at: -1 }).catch(() => {});
  await dbConnection.collection('master_catalog_items').createIndex({ catalog: 1, key: 1 }, { unique: true }).catch(() => {});
  await dbConnection.collection('suppliers').createIndex({ tenantId: 1, name: 1 }).catch(() => {});
  await dbConnection.collection('purchases').createIndex({ tenantId: 1, date: -1 }).catch(() => {});
  await dbConnection.collection('lots').createIndex({ tenantId: 1, foodId: 1, expiresAt: 1 }).catch(() => {});
  await dbConnection.collection('activity_log').createIndex({ tenantId: 1, createdAt: -1 }).catch(() => {});
  // Roles de restaurante (recepción, vendedor, almacén) → cajero. Es idempotente.
  await dbConnection
    .collection('users')
    .updateMany({ role: { $in: ['hosstess', 'waiter', 'kitchen'] } }, { $set: { role: 'cashier' }, $inc: { tokenVersion: 1 } })
    .catch(() => {});
}

async function migrateLegacyTenant() {
  const tenants = dbConnection.collection('tenants');
  let defaultTenant = await tenants.findOne({ slug: 'default' });
  if (!defaultTenant) {
    const needs =
      (await dbConnection.collection('users').countDocuments({ tenantId: { $exists: false } })) > 0 ||
      (await dbConnection.collection('settings').countDocuments({ tenantId: { $exists: false } })) > 0 ||
      (await dbConnection.collection('orders').countDocuments({ tenantId: { $exists: false } })) > 0 ||
      (await dbConnection.collection('mesas').countDocuments({ tenantId: { $exists: false } })) > 0;

    if (needs) {
      const insert = await tenants.insertOne({
        ...createTenantDoc('Negocio migrado'),
        slug: 'default',
      });
      defaultTenant = await tenants.findOne({ _id: insert.insertedId });

      const tenantId = String(defaultTenant._id);
      const collections = [
        'users', 'mesas', 'menus', 'foods', 'waiters', 'waitlist', 'settings', 'orders', 'invites',
      ];
      for (const name of collections) {
        await dbConnection.collection(name).updateMany(
          { tenantId: { $exists: false } },
          { $set: { tenantId } }
        );
      }
      console.log(`MongoDB migration: legacy docs → tenant ${tenantId}`);
    }
  }

  await migrateTenantBilling();
}

async function migrateTenantBilling() {
  const { trialEndsFrom } = require('../models/tenant.model');
  const now = new Date();
  const result = await dbConnection.collection('tenants').updateMany(
    { billingStatus: { $exists: false } },
    {
      $set: {
        plan: 'basic',
        billingStatus: 'trialing',
        trialEndsAt: trialEndsFrom(now),
        mpPreapprovalId: null,
        mpPayerEmail: null,
        currentPeriodEnd: null,
        suspendedAt: null,
        suspendedReason: null,
        updatedAt: now,
      },
    }
  );
  if (result.modifiedCount > 0) {
    console.log(`MongoDB migration: billing fields → ${result.modifiedCount} tenants`);
  }
}

ensureConnection().catch((err) => {
  console.error('MongoDB connection error:', err.message);
});

async function CreateTenant(data) {
  const result = await dbConnection.collection('tenants').insertOne(data);
  return withId(await dbConnection.collection('tenants').findOne({ _id: result.insertedId }));
}
/**
 * Sucursales: una sucursal es una tienda más (todo se aísla por tenantId) que cuelga de una organización.
 * No paga por su cuenta: plan, estado y periodo salen SIEMPRE de la matriz. Se resuelve al leer, así lo que
 * escriba la plataforma, Mercado Pago o un pago manual en la matriz se refleja solo en sus sucursales.
 */
const MATRIX_BILLING_FIELDS = [
  'plan', 'billingStatus', 'billingInterval', 'trialEndsAt', 'mpPreapprovalId', 'mpPayerEmail',
  'currentPeriodEnd', 'cancelAtPeriodEnd', 'suspendedAt', 'suspendedReason', 'promoEligible',
];
function overlayMatrix(branch, matrix, { overPlan = false } = {}) {
  if (!branch || !branch.isBranch || !matrix) return branch;
  const patch = {};
  for (const f of MATRIX_BILLING_FIELDS) if (matrix[f] !== undefined) patch[f] = matrix[f];
  // Una sucursal dada de baja se bloquea como una tienda sin suscripción
  if (branch.branchSuspendedAt && !patch.suspendedAt) {
    patch.billingStatus = 'suspended';
    patch.suspendedAt = branch.branchSuspendedAt;
    patch.suspendedReason = 'Sucursal dada de baja por el dueño';
  }
  // Si el plan de la matriz ya no alcanza para esta sucursal, se bloquea (sin borrar nada)
  if (overPlan && !branch.branchSuspendedAt && !patch.suspendedAt) {
    patch.billingStatus = 'suspended';
    patch.suspendedAt = new Date();
    patch.suspendedReason = 'El plan de tu matriz ya no incluye esta sucursal';
  }
  return { ...branch, ...patch, billedByMatrix: true, overPlan };
}
async function GetTenantById(id) {
  if (!ObjectId.isValid(id)) return null;
  const col = dbConnection.collection('tenants');
  const doc = await col.findOne({ _id: new ObjectId(id) });
  if (doc && doc.isBranch && doc.matrixTenantId && ObjectId.isValid(String(doc.matrixTenantId))) {
    const matrix = await col.findOne({ _id: new ObjectId(String(doc.matrixTenantId)) });
    const siblings = doc.organizationId ? await col.find({ organizationId: doc.organizationId, isBranch: true }).project({ createdAt: 1, branchSuspendedAt: 1 }).toArray() : [];
    const overPlan = Boolean(matrix) && blockedByPlan(siblings.map((b) => ({ ...b, id: String(b._id) })), matrix.plan).has(String(doc._id));
    return withId(overlayMatrix(doc, matrix, { overPlan }));
  }
  return withId(doc);
}
async function UpdateTenant(id, data) {
  if (!ObjectId.isValid(id)) return null;
  const clean = { ...data, updatedAt: new Date() };
  delete clean.id;
  delete clean._id;
  await dbConnection.collection('tenants').updateOne(
    { _id: new ObjectId(id) },
    { $set: clean }
  );
  return GetTenantById(id);
}
/** `includeBranches: false` deja fuera las sucursales: no pagan ni son clientes aparte (las cuenta la matriz). */
async function ListTenants({ includeBranches = true } = {}) {
  const list = await dbConnection.collection('tenants').find({}).sort({ createdAt: -1 }).toArray();
  const byId = new Map(list.map((t) => [String(t._id), t]));
  const blocked = new Set();
  const byOrg = new Map();
  for (const t of list) if (t.isBranch && t.organizationId) byOrg.set(t.organizationId, [...(byOrg.get(t.organizationId) || []), { ...t, id: String(t._id) }]);
  for (const [, kids] of byOrg) {
    const matrix = byId.get(String(kids[0].matrixTenantId));
    if (matrix) blockedByPlan(kids, matrix.plan).forEach((id) => blocked.add(id));
  }
  return list
    .filter((t) => includeBranches || !t.isBranch)
    .map((t) => withId(t.isBranch ? overlayMatrix(t, byId.get(String(t.matrixTenantId)), { overPlan: blocked.has(String(t._id)) }) : t));
}
/** Cuentas que ocupan un lugar del plan: las desactivadas lo liberan. */
async function CountUsersByTenant(tenantId) {
  return dbConnection.collection('users').countDocuments({ tenantId: String(tenantId), disabled: { $ne: true }, linkedOwner: { $exists: false } });
}
async function CountActiveAdmins(tenantId) {
  return dbConnection
    .collection('users')
    .countDocuments({ tenantId: String(tenantId), role: 'admin', disabled: { $ne: true }, linkedOwner: { $exists: false } });
}
/** Una cuenta de la tienda por id (nunca de otra tienda). */
async function FindUserInTenant(id, tenantId) {
  if (!ObjectId.isValid(String(id))) return null;
  return dbConnection.collection('users').findOne({ _id: new ObjectId(String(id)), tenantId: String(tenantId) });
}
async function CountPendingInvites(tenantId) {
  return dbConnection.collection('invites').countDocuments({
    tenantId: String(tenantId),
    status: 'pending',
  });
}
async function ListUsersByTenant(tenantId) {
  const users = await dbConnection
    .collection('users')
    .find({ tenantId: String(tenantId), linkedOwner: { $exists: false } })
    .project({ password: 0, resetToken: 0, resetExpires: 0 })
    .toArray();
  return users.map((user) => ({
    id: String(user._id),
    name: user.name || '',
    lastName: user.lastName || '',
    username: user.username || '',
    email: user.email || '',
    cellphone: user.cellphone || '',
    role: normalizeRoleValue(user.role),
    disabled: Boolean(user.disabled),
    disabledAt: user.disabledAt || null,
    lastLoginAt: user.lastLoginAt || null,
    mfaEnabled: Boolean(user.mfaEnabled),
  }));
}
/** Usuarios de varias tiendas en UNA consulta: Map tenantId → usuarios (mismo formato que ListUsersByTenant). */
async function ListUsersByTenants(tenantIds) {
  const ids = [...new Set((tenantIds || []).map(String))];
  const out = new Map(ids.map((id) => [id, []]));
  if (!ids.length) return out;
  const users = await dbConnection
    .collection('users')
    .find({ tenantId: { $in: ids }, linkedOwner: { $exists: false } })
    .project({ password: 0, resetToken: 0, resetExpires: 0, mfaSecretEnc: 0, mfaPendingEnc: 0, mfaRecovery: 0 })
    .toArray();
  for (const user of users) {
    out.get(String(user.tenantId))?.push({
      id: String(user._id),
      name: user.name || '',
      lastName: user.lastName || '',
      username: user.username || '',
      email: user.email || '',
      cellphone: user.cellphone || '',
      role: normalizeRoleValue(user.role),
      disabled: Boolean(user.disabled),
      disabledAt: user.disabledAt || null,
      lastLoginAt: user.lastLoginAt || null,
      mfaEnabled: Boolean(user.mfaEnabled),
    });
  }
  return out;
}

/** Configuración de varias tiendas en UNA consulta: Map tenantId → settings. */
async function GetSettingsMany(tenantIds) {
  const ids = [...new Set((tenantIds || []).map(String))];
  if (!ids.length) return new Map();
  const rows = await dbConnection.collection('settings').find({ tenantId: { $in: ids } }).toArray();
  return new Map(rows.map((row) => [String(row.tenantId), row]));
}

/** Estado compartido entre instancias (p. ej. cuándo se leyó la bandeja por última vez). */
function appState() {
  return dbConnection.collection('app_state');
}

function normalizeRoleValue(role) {
  return ['hosstess', 'waiter', 'kitchen'].includes(role) ? 'cashier' : role || '';
}
async function GetTenantByMpPreapprovalId(preapprovalId) {
  if (!preapprovalId) return null;
  return withId(
    await dbConnection.collection('tenants').findOne({ mpPreapprovalId: String(preapprovalId) })
  );
}

async function CreateUser(data) {
  return await dbConnection.collection('users').insertOne(data);
}
async function FindUserByEmail(email, tenantId = null) {
  const filter = { email };
  if (tenantId) filter.tenantId = tenantId;
  return await dbConnection.collection('users').findOne(filter);
}
async function FindUserByUsername(username, tenantId = null) {
  const filter = { username };
  if (tenantId) filter.tenantId = tenantId;
  return await dbConnection.collection('users').findOne(filter);
}
async function LoginUsuario(data) {
  let find = await FindUserByUsername(data);
  if (find) return find;
  find = await FindUserByEmail(data);
  if (find) return find;
  return null;
}
async function UpdateUserById(id, data) {
  if (!ObjectId.isValid(id)) return null;
  const clean = { ...data };
  delete clean.id;
  delete clean._id;
  await dbConnection.collection('users').updateOne({ _id: new ObjectId(id) }, { $set: clean });
  return await dbConnection.collection('users').findOne({ _id: new ObjectId(id) });
}
/** Suma un intento fallido; al llegar a `max` bloquea la cuenta `lockMs` y reinicia la cuenta. */
async function RecordLoginFailure(id, { max = 5, lockMs = 15 * 60 * 1000 } = {}) {
  if (!ObjectId.isValid(String(id))) return null;
  const col = dbConnection.collection('users');
  const _id = new ObjectId(String(id));
  const raw = await col.findOneAndUpdate(
    { _id },
    { $inc: { failedLogins: 1 }, $set: { lastFailedLoginAt: new Date() } },
    { returnDocument: 'after' }
  );
  const user = raw && raw.value !== undefined ? raw.value : raw;
  if (user && Number(user.failedLogins) >= max) {
    const lockedUntil = new Date(Date.now() + lockMs);
    await col.updateOne({ _id }, { $set: { failedLogins: 0, lockedUntil } });
    return { ...user, failedLogins: 0, lockedUntil };
  }
  return user;
}
async function ClearLoginFailures(id) {
  if (!ObjectId.isValid(String(id))) return;
  await dbConnection
    .collection('users')
    .updateOne({ _id: new ObjectId(String(id)) }, { $set: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } });
}
async function FindUserById(id) {
  if (!ObjectId.isValid(String(id))) return null;
  return dbConnection.collection('users').findOne({ _id: new ObjectId(String(id)) });
}
/** Sube la versión de sesión: los tokens anteriores dejan de servir. */
async function BumpUserTokenVersion(id) {
  if (!ObjectId.isValid(String(id))) return null;
  const raw = await dbConnection
    .collection('users')
    .findOneAndUpdate({ _id: new ObjectId(String(id)) }, { $inc: { tokenVersion: 1 } }, { returnDocument: 'after' });
  return raw && raw.value !== undefined ? raw.value : raw;
}

// —— Sesiones (refresh tokens; se guarda solo el hash) ——
let sessionsIndexed = false;
function sessionsCol() {
  const col = dbConnection.collection('sessions');
  if (!sessionsIndexed) {
    sessionsIndexed = true;
    col.createIndex({ tokenHash: 1 }, { unique: true }).catch(() => {});
    col.createIndex({ userId: 1 }).catch(() => {});
    col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }).catch(() => {});
  }
  return col;
}
async function CreateSession(data) {
  const result = await sessionsCol().insertOne(data);
  return { ...data, _id: result.insertedId };
}
async function FindSessionByHash(tokenHash) {
  return sessionsCol().findOne({ tokenHash: String(tokenHash) });
}
/** Revoca una sesión solo si sigue activa. Devuelve true si la revocó esta llamada. */
async function RevokeSession(id, data = {}) {
  const res = await sessionsCol().updateOne(
    { _id: id, revokedAt: null },
    { $set: { revokedAt: new Date(), ...data } }
  );
  return res.modifiedCount === 1;
}
async function RevokeUserSessions(userId, reason = 'revoked') {
  await sessionsCol().updateMany(
    { userId: String(userId), revokedAt: null },
    { $set: { revokedAt: new Date(), revokedReason: reason } }
  );
}

async function FindUserByResetToken(token) {
  return await dbConnection.collection('users').findOne({
    resetToken: token,
    resetExpires: { $gt: new Date() },
  });
}
async function ListPlatformUsers() {
  const users = await dbConnection
    .collection('users')
    .find({ role: { $in: ['platform_admin', 'platform_support'] } })
    .project({ password: 0, resetToken: 0, resetExpires: 0 })
    .sort({ createdAt: 1 })
    .toArray();
  return users.map((user) => ({
    id: String(user._id),
    name: user.name || '',
    lastName: user.lastName || '',
    username: user.username || '',
    email: user.email || '',
    cellphone: user.cellphone || '',
    role: user.role || 'platform_admin',
    createdAt: user.createdAt || null,
    lastLoginAt: user.lastLoginAt || null,
    mfaEnabled: Boolean(user.mfaEnabled),
  }));
}
async function CountPlatformAdmins() {
  return dbConnection.collection('users').countDocuments({ role: 'platform_admin' });
}
async function DeleteUserById(id) {
  if (!ObjectId.isValid(id)) return false;
  const result = await dbConnection.collection('users').deleteOne({ _id: new ObjectId(id) });
  return result.deletedCount === 1;
}
async function ListTenantAdminEmails(tenantId) {
  if (!tenantId) return [];
  const users = await dbConnection
    .collection('users')
    .find({ tenantId: String(tenantId), role: 'admin' })
    .project({ email: 1 })
    .toArray();
  return [
    ...new Set(
      users
        .map((u) => String(u.email || '').trim().toLowerCase())
        .filter((e) => e.includes('@'))
    ),
  ];
}

async function GetMenus(tenantId) {
  const filter = tenantId ? { tenantId } : {};
  return (await dbConnection.collection('menus').find(filter).toArray()).map(withId);
}
async function GetMenuById(id, tenantId) {
  const filter = oidFilter(id, tenantId);
  if (!filter) return null;
  const menu = await dbConnection.collection('menus').findOne(filter);
  if (!menu) return null;
  const foodFilter = { menuId: String(id), ...(tenantId ? { tenantId } : {}) };
  const foods = await dbConnection.collection('foods').find(foodFilter).toArray();
  return { ...withId(menu), foods: foods.map(withId) };
}
async function CreateMenu(data) {
  const result = await dbConnection.collection('menus').insertOne(data);
  return withId(await dbConnection.collection('menus').findOne({ _id: result.insertedId }));
}
async function UpdateMenu(id, data, tenantId) {
  const filter = oidFilter(id, tenantId);
  if (!filter) return null;
  const clean = { ...data };
  delete clean.id; delete clean._id; delete clean.foods;
  await dbConnection.collection('menus').updateOne(filter, { $set: clean });
  return GetMenuById(id, tenantId);
}
async function DeleteMenu(id, tenantId) {
  const filter = oidFilter(id, tenantId);
  if (!filter) return { deletedCount: 0 };
  await dbConnection.collection('foods').deleteMany({ menuId: String(id), ...(tenantId ? { tenantId } : {}) });
  return await dbConnection.collection('menus').deleteOne(filter);
}
async function GetFoods(tenantId) {
  const filter = tenantId ? { tenantId } : {};
  return (await dbConnection.collection('foods').find(filter).toArray()).map(withId);
}
/** Productos que cuentan para el tope del plan: los del catálogo maestro sin precio todavía no. */
async function CountPlanFoods(tenantId) {
  return dbConnection.collection('foods').countDocuments({ tenantId: String(tenantId), needsPrice: { $ne: true } });
}
/** Alta de varios productos de una vez (catálogo maestro). */
async function CreateFoods(docs) {
  if (!docs.length) return 0;
  const result = await dbConnection.collection('foods').insertMany(docs);
  return result.insertedCount;
}
/** Quita los productos del catálogo maestro que siguen sin precio (la tienda cambió a un giro que no los usa). */
async function DeleteUnpricedCatalogFoods(tenantId) {
  const result = await dbConnection.collection('foods').deleteMany({ tenantId: String(tenantId), catalogId: { $exists: true }, needsPrice: true });
  return result.deletedCount;
}
/** Quita las categorías que creó el catálogo maestro y quedaron vacías. */
async function DeleteEmptyCatalogMenus(tenantId) {
  const tid = String(tenantId);
  const menus = await dbConnection.collection('menus').find({ tenantId: tid, fromCatalog: true }).toArray();
  let deleted = 0;
  for (const menu of menus) {
    if (await dbConnection.collection('foods').countDocuments({ tenantId: tid, menuId: String(menu._id) }, { limit: 1 })) continue;
    deleted += (await dbConnection.collection('menus').deleteOne({ _id: menu._id })).deletedCount;
  }
  return deleted;
}
/** Tiendas ya configuradas, de un giro con catálogo maestro, que todavía no lo tienen cargado. */
async function ListSettingsNeedingCatalog(giros, version) {
  return dbConnection
    .collection('settings')
    .find({
      setupCompleted: true,
      masterCatalogVersion: { $ne: version },
      masterCatalogSkipped: { $ne: true },
      $or: [{ businessType: { $in: giros } }, { businessType: { $exists: false } }],
    })
    .toArray();
}
async function CountPaidOrders(tenantId) {
  return dbConnection.collection('orders').countDocuments({
    tenantId: String(tenantId),
    paymentStatus: 'paid',
  });
}
async function CountCashSessions(tenantId) {
  return dbConnection.collection('cash_sessions').countDocuments({ tenantId: String(tenantId) });
}
async function GetFoodById(id, tenantId) {
  const filter = oidFilter(id, tenantId);
  if (!filter) return null;
  return withId(await dbConnection.collection('foods').findOne(filter));
}
async function GetFoodByBarcode(code, tenantId) {
  const variants = codeVariants(code);
  if (!variants.length) return null;
  const filter = {
    ...(tenantId ? { tenantId } : {}),
    $or: [{ barcode: { $in: variants } }, { sku: { $in: variants } }, { altCodes: { $in: variants } }],
  };
  return withId(await dbConnection.collection('foods').findOne(filter));
}
async function CreateFood(data) {
  const result = await dbConnection.collection('foods').insertOne(data);
  return withId(await dbConnection.collection('foods').findOne({ _id: result.insertedId }));
}
async function UpdateFood(id, data, tenantId) {
  const filter = oidFilter(id, tenantId);
  if (!filter) return null;
  const clean = withPriceFlag({ ...data });
  delete clean.id; delete clean._id;
  await dbConnection.collection('foods').updateOne(filter, { $set: clean });
  return GetFoodById(id, tenantId);
}
/** Resta existencias al cobrar. No bloquea la venta; el stock no baja de 0. */
/**
 * Descuenta del stock lo vendido de forma atómica (ver services/sale-stock.service.js).
 * Sin allowNegative lanza un error 409 y no descuenta nada si algún producto no alcanza.
 */
async function ReserveSaleStock(items, tenantId, { allowNegative = false } = {}) {
  return reserveSaleStock(
    dbConnection.collection('foods'),
    (id) => oidFilter(id, tenantId),
    items,
    { allowNegative }
  );
}

/** Si el producto lleva caducidad, consume sus lotes FEFO. Devuelve lo tomado de cada lote. */
async function ConsumeSaleLots(id, quantity, tenantId) {
  const filter = oidFilter(id, tenantId);
  if (!filter) return [];
  const food = await dbConnection.collection('foods').findOne(filter);
  const qty = Math.max(0, Number(quantity) || 0);
  if (!food || !qty || !food.tracksExpiry) return [];

  const allocations = [];
  const lots = await dbConnection
    .collection('lots')
    .find({ tenantId, foodId: String(id), quantity: { $gt: 0 } })
    .sort({ expiresAt: 1, createdAt: 1 })
    .toArray();
  let remaining = qty;
  for (const lot of lots) {
    if (remaining <= 0) break;
    const take = Math.min(Math.max(0, Number(lot.quantity) || 0), remaining);
    if (!take) continue;
    await dbConnection.collection('lots').updateOne(
      { _id: lot._id },
      { $inc: { quantity: -take }, $set: { updatedAt: new Date() } }
    );
    allocations.push({
      lotId: String(lot._id),
      qty: take,
      lot: lot.lot || '',
      expiresAt: lot.expiresAt || null,
    });
    remaining -= take;
  }
  return allocations;
}

/** Devuelve piezas al inventario y restaura lotes si la venta se anuló. */
async function RestoreSaleStock(id, quantity, allocations, tenantId) {
  const qty = Math.max(0, Number(quantity) || 0);
  if (Array.isArray(allocations)) {
    for (const alloc of allocations) {
      const take = Math.max(0, Number(alloc?.qty) || 0);
      if (!take || !ObjectId.isValid(alloc.lotId)) continue;
      const lotFilter = { _id: new ObjectId(alloc.lotId) };
      if (tenantId) lotFilter.tenantId = tenantId;
      await dbConnection.collection('lots').updateOne(
        lotFilter,
        { $inc: { quantity: take }, $set: { updatedAt: new Date() } }
      );
    }
  }
  return IncrementFoodStock(id, qty, tenantId);
}
/** Suma o resta (delta con signo) a la existencia, de forma atómica y a 3 decimales. Lo usa el conteo de inventario. */
async function AdjustFoodStock(id, delta, tenantId) {
  const filter = oidFilter(id, tenantId);
  if (!filter) return null;
  const d = Math.round((Number(delta) || 0) * 1000) / 1000;
  if (!d) return GetFoodById(id, tenantId);
  await dbConnection.collection('foods').updateOne(filter, { $inc: { stock: d }, $set: { updatedAt: new Date() } });
  return GetFoodById(id, tenantId);
}
/** Suma piezas al inventario (entrada por compra / pack). */
async function IncrementFoodStock(id, quantity, tenantId) {
  const filter = oidFilter(id, tenantId);
  if (!filter) return null;
  const food = await dbConnection.collection('foods').findOne(filter);
  if (!food) return null;
  // A 3 decimales: los productos a granel regresan kilos o litros con fracción
  const qty = Math.max(0, Math.round((Number(quantity) || 0) * 1000) / 1000);
  if (!qty) return withId(food);
  // $inc: atómico y respeta un stock negativo (venta sin existencias) en lugar de saltarlo a 0
  await dbConnection.collection('foods').updateOne(filter, { $inc: { stock: qty } });
  return GetFoodById(id, tenantId);
}
async function DeleteFood(id, tenantId) {
  const filter = oidFilter(id, tenantId);
  if (!filter) return { deletedCount: 0 };
  await dbConnection.collection('lots').deleteMany({
    foodId: String(id),
    ...(tenantId ? { tenantId } : {}),
  });
  return await dbConnection.collection('foods').deleteOne(filter);
}

async function DeleteFoodsByIds(ids, tenantId) {
  if (!ids.length || !tenantId) return { deletedCount: 0 };
  const oids = ids.map((id) => { try { return new ObjectId(id); } catch { return null; } }).filter(Boolean);
  if (!oids.length) return { deletedCount: 0 };
  const filter = { _id: { $in: oids }, tenantId: String(tenantId) };
  await dbConnection.collection('lots').deleteMany({ foodId: { $in: ids.map(String) }, tenantId: String(tenantId) });
  return dbConnection.collection('foods').deleteMany(filter);
}

async function DeleteAllFoods(tenantId) {
  if (!tenantId) return { deletedCount: 0 };
  const tid = String(tenantId);
  await dbConnection.collection('lots').deleteMany({ tenantId: tid });
  const result = await dbConnection.collection('foods').deleteMany({ tenantId: tid });
  await dbConnection.collection('menus').deleteMany({ tenantId: tid });
  // Quien vació su catálogo a propósito no quiere que se vuelva a llenar solo
  await dbConnection.collection('settings').updateOne({ tenantId: tid }, { $unset: { masterCatalogVersion: '' }, $set: { masterCatalogSkipped: true } });
  return result;
}

/** Productos cuyo stock está por debajo o igual al umbral mínimo. */
async function GetLowStockFoods(tenantId) {
  const filter = {
    ...(tenantId ? { tenantId } : {}),
    needsPrice: { $ne: true }, // sin precio todavía no se vende: no tiene caso avisar que se acaba
    $expr: {
      $lte: [
        { $ifNull: ['$stock', 0] },
        { $ifNull: ['$lowStockThreshold', 5] },
      ],
    },
  };
  return (await dbConnection.collection('foods').find(filter).toArray()).map(withId);
}

/** Busca productos por nombre, barcode o SKU (regex case-insensitive). */
async function SearchFoods(tenantId, query) {
  const q = String(query || '').trim();
  if (!q) return [];
  // Cada palabra se busca por separado (en cualquier orden) y sin tratar lo escrito como expresión regular
  const words = q.split(/\s+/).slice(0, 6).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const filter = {
    ...(tenantId ? { tenantId } : {}),
    $and: words.map((w) => {
      const regex = { $regex: w, $options: 'i' };
      return { $or: [{ name: regex }, { barcode: regex }, { sku: regex }] };
    }),
  };
  return (await dbConnection.collection('foods').find(filter).limit(60).toArray()).map(withId);
}

async function AddWaiter(data) {
  return await dbConnection.collection('waiters').insertOne(data);
}
async function GetWaiters(tenantId) {
  const filter = tenantId ? { tenantId } : {};
  return await dbConnection.collection('waiters').find(filter).toArray();
}
async function GetWaiterByCellphone(id, tenantId) {
  return await dbConnection.collection('waiters').findOne({ cellphone: id, ...(tenantId ? { tenantId } : {}) });
}
async function GetWaiterByDisponibility(disponibility, tenantId) {
  return await dbConnection.collection('waiters').findOne({ status: disponibility, ...(tenantId ? { tenantId } : {}) });
}
async function DeleteWaiter(id, tenantId) {
  return await dbConnection.collection('waiters').deleteOne({ cellphone: id, ...(tenantId ? { tenantId } : {}) });
}
async function UpdateWaiter(id, data, tenantId) {
  return await dbConnection.collection('waiters').updateOne({ cellphone: id, ...(tenantId ? { tenantId } : {}) }, { $set: data });
}

async function GetSettings(tenantId) {
  if (!tenantId) return await dbConnection.collection('settings').findOne({});
  return await dbConnection.collection('settings').findOne({ tenantId });
}
async function CreateSettings(data) {
  await dbConnection.collection('settings').insertOne(data);
  return await GetSettings(data.tenantId);
}
async function UpdateSettings(data, tenantId) {
  const tid = tenantId || data.tenantId;
  await dbConnection.collection('settings').updateOne({ tenantId: tid }, { $set: data }, { upsert: true });
  return await GetSettings(tid);
}

/** Ventas de la tienda, las más nuevas primero. `before`: solo las anteriores a esa fecha (paginación). */
async function GetOrders(tenantId, { limit = 1000, before = null, cashSessionId = null } = {}) {
  const filter = tenantId ? { tenantId } : {};
  if (before) filter.createdAt = { $lt: new Date(before) };
  if (cashSessionId) filter.cashSessionId = String(cashSessionId);
  const cap = Math.min(1000, Math.max(1, Number(limit) || 1000));
  return (await dbConnection.collection('orders').find(filter).sort({ createdAt: -1 }).limit(cap).toArray()).map(withId);
}
async function GetOrderById(id, tenantId) {
  const filter = oidFilter(id, tenantId);
  if (!filter) return null;
  return withId(await dbConnection.collection('orders').findOne(filter));
}
async function GetOrderByInvoiceToken(token) {
  const key = String(token || '').trim();
  if (!key) return null;
  return withId(await dbConnection.collection('orders').findOne({ invoiceToken: key }));
}
async function GetOrderByClientSaleId(clientSaleId, tenantId) {
  const key = String(clientSaleId || '').trim();
  if (!key || !tenantId) return null;
  return withId(await dbConnection.collection('orders').findOne({ tenantId, clientSaleId: key }));
}
async function CreateOrder(data) {
  const result = await dbConnection.collection('orders').insertOne(data);
  return withId(await dbConnection.collection('orders').findOne({ _id: result.insertedId }));
}
async function DeleteOrder(id, tenantId) {
  const filter = oidFilter(id, tenantId);
  if (!filter) return { deletedCount: 0 };
  return dbConnection.collection('orders').deleteOne(filter);
}
async function UpdateOrder(id, data, tenantId) {
  const filter = oidFilter(id, tenantId);
  if (!filter) return null;
  const clean = { ...data };
  delete clean.id; delete clean._id;
  await dbConnection.collection('orders').updateOne(filter, { $set: clean });
  return GetOrderById(id, tenantId);
}
/**
 * Aplica una devolución parcial solo si la venta sigue igual que cuando se calculó (mismo total y cobrada):
 * dos devoluciones al mismo tiempo no pueden reembolsar de más. Devuelve la venta nueva o null si cambió.
 */
async function ApplyOrderReturn(id, tenantId, expectedTotal, set, entry) {
  const filter = oidFilter(id, tenantId);
  if (!filter) return null;
  const res = await dbConnection
    .collection('orders')
    .updateOne({ ...filter, paymentStatus: 'paid', total: expectedTotal }, { $set: set, $push: { returns: entry } });
  return res.modifiedCount === 1 ? GetOrderById(id, tenantId) : null;
}
async function GetOrdersByCashSession(sessionId, tenantId) {
  return (await dbConnection.collection('orders').find({ cashSessionId: sessionId, ...(tenantId ? { tenantId } : {}) }).toArray()).map(withId);
}

async function GetInvites(tenantId) {
  const filter = tenantId ? { tenantId } : {};
  return (await dbConnection.collection('invites').find(filter).sort({ createdAt: -1 }).toArray()).map(withId);
}
async function GetInviteByToken(token) {
  return withId(await dbConnection.collection('invites').findOne({ token }));
}
async function CreateInvite(data) {
  const result = await dbConnection.collection('invites').insertOne(data);
  return withId(await dbConnection.collection('invites').findOne({ _id: result.insertedId }));
}
async function UpdateInvite(id, data, tenantId) {
  const filter = oidFilter(id, tenantId);
  if (!filter) return null;
  const clean = { ...data };
  delete clean.id; delete clean._id;
  await dbConnection.collection('invites').updateOne(filter, { $set: clean });
  return withId(await dbConnection.collection('invites').findOne(filter));
}
async function DeleteInvite(id, tenantId) {
  const filter = oidFilter(id, tenantId);
  if (!filter) return { deletedCount: 0 };
  return await dbConnection.collection('invites').deleteOne(filter);
}

/** Cortes de caja hechos en un rango (para el resumen diario). */
async function GetClosedCashSessionsBetween(tenantId, from, to) {
  return (await dbConnection
    .collection('cash_sessions')
    .find({ tenantId, status: 'closed', closedAt: { $gte: new Date(from), $lte: new Date(to) } })
    .toArray()).map(withId);
}
// —— Cola de impresión: tickets que un dispositivo (celular) manda a imprimir en otro (la computadora con la impresora) ——
async function CreatePrintJob(data) {
  const result = await dbConnection.collection('print_jobs').insertOne(data);
  return withId(await dbConnection.collection('print_jobs').findOne({ _id: result.insertedId }));
}
/**
 * Toma, de forma atómica, el trabajo más viejo pendiente. También rescata uno «imprimiendo» cuya estación no
 * respondió a tiempo (`claimTimeoutMs`). Los trabajos más viejos que `ttlMs` ya no se imprimen.
 */
async function ClaimPrintJob(tenantId, stationId, { ttlMs, claimTimeoutMs, now = new Date() }) {
  const doc = await dbConnection.collection('print_jobs').findOneAndUpdate(
    {
      tenantId: String(tenantId),
      createdAt: { $gte: new Date(now.getTime() - ttlMs) },
      $or: [{ status: 'pending' }, { status: 'printing', claimedAt: { $lt: new Date(now.getTime() - claimTimeoutMs) } }],
    },
    { $set: { status: 'printing', stationId: String(stationId), claimedAt: now }, $inc: { attempts: 1 } },
    { sort: { createdAt: 1 }, returnDocument: 'after' }
  );
  return withId(doc);
}
/** Cierra un trabajo, solo si lo tiene esa estación. */
async function FinishPrintJob(id, tenantId, stationId, { ok, error = null }) {
  if (!ObjectId.isValid(id)) return false;
  const r = await dbConnection.collection('print_jobs').updateOne(
    { _id: new ObjectId(id), tenantId: String(tenantId), status: 'printing', stationId: String(stationId) },
    { $set: { status: ok ? 'done' : 'failed', error: ok ? null : String(error || 'error').slice(0, 200), finishedAt: new Date() } }
  );
  return r.modifiedCount === 1;
}
async function GetPrintJob(id, tenantId) {
  if (!ObjectId.isValid(id)) return null;
  return withId(await dbConnection.collection('print_jobs').findOne({ _id: new ObjectId(id), tenantId: String(tenantId) }));
}
/** Latido de la estación: sirve para saber desde el celular si la computadora está conectada. */
async function TouchPrintStation(tenantId, stationId, name) {
  await dbConnection
    .collection('print_stations')
    .updateOne({ tenantId: String(tenantId), stationId: String(stationId) }, { $set: { name: String(name || '').slice(0, 60), lastSeenAt: new Date() } }, { upsert: true });
}
async function GetPrintStation(tenantId) {
  const rows = await dbConnection.collection('print_stations').find({ tenantId: String(tenantId) }).sort({ lastSeenAt: -1 }).limit(1).toArray();
  return rows[0] ? { stationId: rows[0].stationId, name: rows[0].name || '', lastSeenAt: rows[0].lastSeenAt } : null;
}

/**
 * Candado de una tarea programada: solo quien lo toma la ejecuta (útil con varias instancias).
 * El candado vence solo (`ttlMs`) por si la instancia que lo tenía se cae a medio trabajo.
 */
async function AcquireJobLock(name, ttlMs) {
  const now = new Date();
  try {
    await dbConnection.collection('job_runs').findOneAndUpdate(
      { _id: name, $or: [{ lockedUntil: null }, { lockedUntil: { $lt: now } }] },
      { $set: { lockedUntil: new Date(now.getTime() + ttlMs), startedAt: now } },
      { upsert: true }
    );
    return true;
  } catch (err) {
    if (err.code === 11000) return false; // el documento existe y alguien más tiene el candado
    throw err;
  }
}
/** Libera el candado y deja constancia de la última corrida (para saber si una tarea dejó de correr). */
async function FinishJob(name, { ok, error = null, ms = 0 }) {
  await dbConnection
    .collection('job_runs')
    .updateOne({ _id: name }, { $set: { lockedUntil: null, lastRunAt: new Date(), lastOk: Boolean(ok), lastError: error, lastMs: ms } });
}
/** Estado de las tareas programadas (para /health/jobs). */
async function ListJobRuns() {
  return (await dbConnection.collection('job_runs').find({}).toArray()).map((j) => ({ name: j._id, lastRunAt: j.lastRunAt || null, lastOk: j.lastOk ?? null, lastError: j.lastError || null, lastMs: j.lastMs || 0 }));
}

/** Reserva el aviso de pago fallido del día N de forma atómica: solo una instancia lo consigue. */
async function ClaimDunningNotice(tenantId, day) {
  if (!ObjectId.isValid(tenantId)) return false;
  const r = await dbConnection
    .collection('tenants')
    .updateOne({ _id: new ObjectId(tenantId), dunningSent: { $ne: day } }, { $addToSet: { dunningSent: day }, $set: { updatedAt: new Date() } });
  return r.modifiedCount === 1;
}
async function ReleaseDunningNotice(tenantId, day) {
  if (!ObjectId.isValid(tenantId)) return;
  await dbConnection.collection('tenants').updateOne({ _id: new ObjectId(tenantId) }, { $pull: { dunningSent: day } });
}
/** Tiendas con el resumen diario activado y correo destino. */
async function ListSettingsWithDailySummary() {
  return dbConnection
    .collection('settings')
    .find({ dailySummaryEnabled: true, dailySummaryEmail: { $type: 'string', $ne: '' } })
    .toArray();
}
/** Reserva el envío de hoy de forma atómica: solo una instancia lo consigue. */
async function ClaimDailySummary(tenantId, dayKey) {
  const r = await dbConnection
    .collection('settings')
    .updateOne({ tenantId, lastDailySummary: { $ne: dayKey } }, { $set: { lastDailySummary: dayKey } });
  return r.modifiedCount === 1;
}
async function ReleaseDailySummary(tenantId, dayKey) {
  await dbConnection.collection('settings').updateOne({ tenantId, lastDailySummary: dayKey }, { $unset: { lastDailySummary: '' } });
}

async function GetOpenCashSession(tenantId) {
  return withId(await dbConnection.collection('cash_sessions').findOne({ tenantId, status: 'open' }));
}
async function GetCashSessionById(id, tenantId) {
  const filter = oidFilter(id, tenantId);
  if (!filter) return null;
  return withId(await dbConnection.collection('cash_sessions').findOne(filter));
}
async function CreateCashSession(data) {
  const result = await dbConnection.collection('cash_sessions').insertOne(data);
  return withId(await dbConnection.collection('cash_sessions').findOne({ _id: result.insertedId }));
}
function aiMonthKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date);
  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  return `${year}-${month}`;
}

async function GetAiUsage(tenantId, month = aiMonthKey()) {
  const doc = await dbConnection.collection('ai_usage').findOne({
    tenantId: String(tenantId),
    month,
  });
  return doc ? Number(doc.count) || 0 : 0;
}

/** Reserva 1 uso si todavía hay cupo. null = ya se acabó. */
let aiIndexReady = false;
async function ReserveAiUse(tenantId, limit, month = aiMonthKey()) {
  const col = dbConnection.collection('ai_usage');
  if (!aiIndexReady) {
    await col.createIndex({ tenantId: 1, month: 1 }, { unique: true }).catch(() => {});
    aiIndexReady = true;
  }
  const key = { tenantId: String(tenantId), month };
  await col.updateOne(
    key,
    { $setOnInsert: { count: 0, createdAt: new Date() } },
    { upsert: true }
  );
  const filter = limit == null ? key : { ...key, count: { $lt: Number(limit) } };
  const raw = await col.findOneAndUpdate(
    filter,
    { $inc: { count: 1 }, $set: { updatedAt: new Date() } },
    { returnDocument: 'after' }
  );
  const doc = raw && raw.value !== undefined ? raw.value : raw;
  if (!doc) return null;
  const used = Number(doc.count) || 0;
  return {
    used,
    limit: limit == null ? null : Number(limit),
    remaining: limit == null ? null : Math.max(0, Number(limit) - used),
    month,
  };
}

async function RefundAiUse(tenantId, month = aiMonthKey()) {
  await dbConnection.collection('ai_usage').updateOne(
    { tenantId: String(tenantId), month, count: { $gt: 0 } },
    { $inc: { count: -1 }, $set: { updatedAt: new Date() } }
  );
}

async function ListAiUsage(month = aiMonthKey()) {
  const list = await dbConnection.collection('ai_usage').find({ month }).toArray();
  return list.map((doc) => ({
    tenantId: String(doc.tenantId),
    count: Number(doc.count) || 0,
  }));
}

async function ListAiUsageAll() {
  const list = await dbConnection.collection('ai_usage').find({}).toArray();
  return list.map((doc) => ({
    month: doc.month || '',
    count: Number(doc.count) || 0,
  }));
}

async function ListPlatformExpenses(month = aiMonthKey()) {
  const list = await dbConnection.collection('platform_expenses').find({ month }).sort({ createdAt: -1 }).toArray();
  return list.map((doc) => {
    const row = withId(doc);
    return {
      id: row.id,
      label: row.label || '',
      amount: Number(row.amount) || 0,
      note: row.note || '',
      month: row.month,
      createdAt: row.createdAt || null,
    };
  });
}

async function CreatePlatformExpense(data) {
  const result = await dbConnection.collection('platform_expenses').insertOne(data);
  return withId(await dbConnection.collection('platform_expenses').findOne({ _id: result.insertedId }));
}

async function DeletePlatformExpense(id) {
  if (!ObjectId.isValid(id)) return false;
  const result = await dbConnection.collection('platform_expenses').deleteOne({ _id: new ObjectId(id) });
  return result.deletedCount > 0;
}

async function ListPlatformExpensesAll() {
  const list = await dbConnection.collection('platform_expenses').find({}).toArray();
  return list.map((doc) => ({
    month: doc.month || '',
    amount: Number(doc.amount) || 0,
  }));
}

async function SavePlatformSnapshot(month, data) {
  await dbConnection.collection('platform_snapshots').updateOne(
    { month },
    {
      $set: { ...data, month, updatedAt: new Date() },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true }
  );
}

async function ListPlatformSnapshots() {
  const list = await dbConnection.collection('platform_snapshots').find({}).toArray();
  return list.map((doc) => ({
    month: doc.month,
    revenue: Number(doc.revenue) || 0,
  }));
}

async function UpdateCashSession(id, data, tenantId) {
  const filter = oidFilter(id, tenantId);
  if (!filter) return null;
  const clean = { ...data };
  delete clean.id; delete clean._id;
  await dbConnection.collection('cash_sessions').updateOne(filter, { $set: clean });
  return GetCashSessionById(id, tenantId);
}

function mailAssignee(value) {
  const email = String(value || '').trim().toLowerCase();
  return email.includes('@') ? email : '';
}

let supportMailIndex = false;
async function ensureSupportMailIndex() {
  if (supportMailIndex) return;
  await dbConnection.collection('support_mail').createIndex({ messageId: 1 }, { unique: true }).catch(() => {});
  await dbConnection.collection('support_mail').createIndex({ tenantId: 1, at: -1 }).catch(() => {});
  await dbConnection.collection('support_mail').createIndex({ assignedTo: 1, at: -1 }).catch(() => {});
  supportMailIndex = true;
}

async function SaveSupportMail(doc) {
  await ensureSupportMailIndex();
  const messageId = String(doc.messageId || '').trim();
  if (!messageId) return null;
  const assignedTo = mailAssignee(doc.assignedTo);
  const insert = {
    messageId,
    tenantId: doc.tenantId ? String(doc.tenantId) : null,
    ticketId: doc.ticketId || null,
    direction: doc.direction,
    from: doc.from || '',
    to: doc.to || '',
    subject: doc.subject || '',
    text: doc.text || '',
    inReplyTo: doc.inReplyTo || '',
    references: Array.isArray(doc.references) ? doc.references : [],
    assignedTo: assignedTo || null,
    at: doc.at || new Date(),
    createdAt: new Date(),
  };
  await dbConnection.collection('support_mail').updateOne(
    { messageId },
    { $setOnInsert: insert },
    { upsert: true }
  );
  const set = {};
  if (doc.tenantId) set.tenantId = String(doc.tenantId);
  if (doc.ticketId) set.ticketId = String(doc.ticketId);
  if (doc.inReplyTo) set.inReplyTo = String(doc.inReplyTo);
  if (Array.isArray(doc.references) && doc.references.length) set.references = doc.references;
  if (Object.keys(set).length) {
    await dbConnection.collection('support_mail').updateOne({ messageId }, { $set: set });
  }
  if (assignedTo) {
    await dbConnection.collection('support_mail').updateOne(
      {
        messageId,
        $or: [{ assignedTo: { $exists: false } }, { assignedTo: null }, { assignedTo: '' }],
      },
      { $set: { assignedTo } }
    );
  }
  return dbConnection.collection('support_mail').findOne({ messageId });
}

async function ListSupportMailRaw(limit = 800) {
  await ensureSupportMailIndex();
  return dbConnection
    .collection('support_mail')
    .find({})
    .sort({ at: 1 })
    .limit(Math.min(1200, Math.max(1, Number(limit) || 800)))
    .toArray();
}

async function FindSupportMailByMessageIds(ids) {
  await ensureSupportMailIndex();
  const wanted = [...new Set((ids || []).map((id) => String(id || '').trim()).filter(Boolean))];
  if (!wanted.length) return [];
  return dbConnection.collection('support_mail').find({ messageId: { $in: wanted } }).toArray();
}

async function ListSupportMail(tenantId, opts = {}) {
  await ensureSupportMailIndex();
  const rows = await dbConnection
    .collection('support_mail')
    .find(mailOwnerFilter({ tenantId: String(tenantId) }, opts))
    .sort({ at: 1 })
    .limit(80)
    .toArray();
  return rows.map(publicMail);
}

async function ListSupportMailAll(opts = {}) {
  await ensureSupportMailIndex();
  const rows = await dbConnection
    .collection('support_mail')
    .find(mailOwnerFilter({ tenantId: { $nin: [null, ''] } }, opts))
    .sort({ at: 1 })
    .limit(400)
    .toArray();
  return rows.map(publicMail);
}

async function ListUnmatchedSupportMail(opts = {}) {
  await ensureSupportMailIndex();
  const rows = await dbConnection
    .collection('support_mail')
    .find(mailOwnerFilter({ tenantId: null, direction: 'in' }, opts))
    .sort({ at: -1 })
    .limit(30)
    .toArray();
  return rows.map(publicMail);
}

function mailOwnerFilter(base, opts = {}) {
  if (!Object.prototype.hasOwnProperty.call(opts, 'assignedTo')) return base;
  const me = mailAssignee(opts.assignedTo);
  if (!me) return { ...base, assignedTo: '__nobody__' };
  const mailbox = mailAssignee(opts.mailboxOwner);
  if (mailbox && me === mailbox) {
    return {
      ...base,
      $or: [
        { assignedTo: me },
        { assignedTo: null },
        { assignedTo: '' },
        { assignedTo: { $exists: false } },
      ],
    };
  }
  return { ...base, assignedTo: me };
}

async function AssignUnassignedSupportMail(email) {
  const assignedTo = mailAssignee(email);
  if (!assignedTo) return 0;
  await ensureSupportMailIndex();
  const result = await dbConnection.collection('support_mail').updateMany(
    { $or: [{ assignedTo: { $exists: false } }, { assignedTo: null }, { assignedTo: '' }] },
    { $set: { assignedTo } }
  );
  return result.modifiedCount || 0;
}

async function CreateBillingEvent(data) {
  const doc = {
    tenantId: String(data.tenantId),
    type: String(data.type || 'event'),
    plan: data.plan || null,
    interval: data.interval || null,
    amount: data.amount == null ? null : Number(data.amount),
    note: data.note || '',
    ...(data.months ? { months: Number(data.months) } : {}),
    mpStatus: data.mpStatus || null,
    // Identificador del pago en Mercado Pago: evita registrar dos veces el mismo cobro si el aviso se repite
    ...(data.mpPaymentId ? { mpPaymentId: String(data.mpPaymentId) } : {}),
    at: data.at || new Date(),
  };
  const result = await dbConnection.collection('billing_events').insertOne(doc);
  return { id: String(result.insertedId), ...doc };
}
/** Cobros recibidos en un rango (para el panel de los socios). */
async function ListPaymentsBetween(from, to) {
  const rows = await dbConnection
    .collection('billing_events')
    .find({ type: 'payment', amount: { $gt: 0 }, at: { $gte: new Date(from), $lte: new Date(to) } })
    .sort({ at: -1 })
    .toArray();
  return rows.map((r) => ({ id: String(r._id), tenantId: r.tenantId, plan: r.plan, interval: r.interval, amount: r.amount, note: r.note || '', mpPaymentId: r.mpPaymentId || null, at: r.at }));
}
async function ListBillingEvents(tenantId, limit = 40) {
  const rows = await dbConnection
    .collection('billing_events')
    .find({ tenantId: String(tenantId) })
    .sort({ at: -1 })
    .limit(Math.min(80, Math.max(1, Number(limit) || 40)))
    .toArray();
  return rows.map((row) => ({
    id: String(row._id),
    type: row.type,
    plan: row.plan,
    interval: row.interval,
    amount: row.amount,
    note: row.note || '',
    mpStatus: row.mpStatus || null,
    at: row.at,
  }));
}

function publicMail(row) {
  return {
    id: String(row._id),
    messageId: row.messageId,
    tenantId: row.tenantId || null,
    direction: row.direction,
    from: row.from || '',
    to: row.to || '',
    subject: row.subject || '',
    text: row.text || '',
    ticketId: row.ticketId || null,
    assignedTo: mailAssignee(row.assignedTo) || null,
    inReplyTo: row.inReplyTo || '',
    references: Array.isArray(row.references) ? row.references : [],
    at: row.at || row.createdAt || null,
  };
}

// ── Clientes ──
async function CreateCustomer(data) {
  const result = await dbConnection.collection('customers').insertOne(data);
  return withId(await dbConnection.collection('customers').findOne({ _id: result.insertedId }));
}
async function GetCustomers(tenantId) {
  const filter = tenantId ? { tenantId } : {};
  return (await dbConnection.collection('customers').find(filter).sort({ createdAt: -1 }).toArray()).map(withId);
}
async function GetCustomerById(id, tenantId) {
  const filter = oidFilter(id, tenantId);
  if (!filter) return null;
  return withId(await dbConnection.collection('customers').findOne(filter));
}
async function UpdateCustomer(id, data, tenantId) {
  const filter = oidFilter(id, tenantId);
  if (!filter) return null;
  const clean = { ...data, updatedAt: new Date() };
  delete clean.id;
  delete clean._id;
  await dbConnection.collection('customers').updateOne(filter, { $set: clean });
  return GetCustomerById(id, tenantId);
}
async function DeleteCustomer(id, tenantId) {
  const filter = oidFilter(id, tenantId);
  if (!filter) return { deletedCount: 0 };
  return await dbConnection.collection('customers').deleteOne(filter);
}
/** Compras cobradas por cliente (para clientes frecuentes). Solo ventas ligadas a un cliente. */
async function CustomerOrderStats(tenantId, since30) {
  return dbConnection
    .collection('orders')
    .aggregate([
      { $match: { tenantId: String(tenantId), paymentStatus: 'paid', status: { $ne: 'cancelled' }, customerId: { $type: 'string', $ne: '' } } },
      {
        $group: {
          _id: '$customerId',
          visits: { $sum: 1 },
          spent: { $sum: '$total' },
          last: { $max: '$createdAt' },
          visits30: { $sum: { $cond: [{ $gte: ['$createdAt', since30] }, 1, 0] } },
        },
      },
    ])
    .toArray()
    .then((rows) => rows.map((r) => ({ customerId: r._id, visits: r.visits, spent: r.spent, last: r.last, visits30: r.visits30 })));
}
async function GetOrdersByCustomer(tenantId, customerId, limit = 500) {
  return (await dbConnection
    .collection('orders')
    .find({ tenantId: String(tenantId), customerId: String(customerId) })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray()).map(withId);
}
async function SearchCustomers(tenantId, query) {
  const q = String(query || '').trim();
  if (!q) return GetCustomers(tenantId);
  const regex = { $regex: q, $options: 'i' };
  const filter = {
    tenantId,
    $or: [{ name: regex }, { phone: regex }],
  };
  return (await dbConnection.collection('customers').find(filter).sort({ name: 1 }).toArray()).map(withId);
}

// ── Reportes de ventas ──
async function GetOrdersByDateRange(tenantId, from, to) {
  const filter = {
    tenantId,
    createdAt: { $gte: new Date(from), $lte: new Date(to) },
  };
  return (await dbConnection.collection('orders').find(filter).sort({ createdAt: -1 }).toArray()).map(withId);
}
async function GetSalesReport(tenantId, from, to) {
  const match = {
    tenantId,
    paymentStatus: 'paid',
    createdAt: { $gte: new Date(from), $lte: new Date(to) },
  };
  const orders = await dbConnection.collection('orders').find(match).toArray();

  const totalOrders = orders.length;
  const totalSales = orders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
  const averageTicket = totalOrders ? totalSales / totalOrders : 0;

  // Top productos vendidos en el rango
  const productMap = {};
  for (const order of orders) {
    for (const item of order.items || []) {
      const key = item.foodId || item.name || 'Desconocido';
      if (!productMap[key]) {
        productMap[key] = { name: item.name || key, quantity: 0, revenue: 0 };
      }
      productMap[key].quantity += Number(item.quantity) || 1;
      productMap[key].revenue += (Number(item.price) || 0) * (Number(item.quantity) || 1);
    }
  }
  const topProducts = Object.values(productMap)
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 5);

  return {
    totalSales: Number(totalSales.toFixed(2)),
    totalOrders,
    averageTicket: Number(averageTicket.toFixed(2)),
    topProducts,
  };
}

// ── Historial de costos (Lector de Facturas) ──
async function SaveCostSnapshot(tenantId, foodId, cost, source = 'invoice_scan') {
  return dbConnection.collection('cost_history').insertOne({
    tenantId,
    foodId: String(foodId),
    cost: Number(cost),
    source,
    createdAt: new Date(),
  });
}

async function GetCostHistory(tenantId, foodId, limit = 10) {
  return dbConnection.collection('cost_history')
    .find({ tenantId, foodId: String(foodId) })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray()
    .then(docs => docs.map(withId));
}

async function GetLastCostSnapshot(tenantId, foodId) {
  return withId(
    await dbConnection.collection('cost_history')
      .findOne({ tenantId, foodId: String(foodId) }, { sort: { createdAt: -1 } })
  );
}

async function GetBulkLastCosts(tenantId, foodIds) {
  const pipeline = [
    { $match: { tenantId, foodId: { $in: foodIds.map(String) } } },
    { $sort: { createdAt: -1 } },
    { $group: { _id: '$foodId', cost: { $first: '$cost' }, createdAt: { $first: '$createdAt' } } },
  ];
  const docs = await dbConnection.collection('cost_history').aggregate(pipeline).toArray();
  const map = {};
  for (const d of docs) map[d._id] = { cost: d.cost, at: d.createdAt };
  return map;
}

// ── Proveedores ──
async function CreateSupplier(data) {
  const result = await dbConnection.collection('suppliers').insertOne(data);
  return withId(await dbConnection.collection('suppliers').findOne({ _id: result.insertedId }));
}
async function GetSuppliers(tenantId) {
  const filter = tenantId ? { tenantId } : {};
  return (await dbConnection.collection('suppliers').find(filter).sort({ name: 1 }).toArray()).map(withId);
}
async function GetSupplierById(id, tenantId) {
  const filter = oidFilter(id, tenantId);
  if (!filter) return null;
  return withId(await dbConnection.collection('suppliers').findOne(filter));
}
async function UpdateSupplier(id, data, tenantId) {
  const filter = oidFilter(id, tenantId);
  if (!filter) return null;
  const clean = { ...data, updatedAt: new Date() };
  delete clean.id;
  delete clean._id;
  await dbConnection.collection('suppliers').updateOne(filter, { $set: clean });
  return GetSupplierById(id, tenantId);
}
async function DeleteSupplier(id, tenantId) {
  const filter = oidFilter(id, tenantId);
  if (!filter) return { deletedCount: 0 };
  return dbConnection.collection('suppliers').deleteOne(filter);
}
async function SearchSuppliers(tenantId, query) {
  const q = String(query || '').trim();
  if (!q) return GetSuppliers(tenantId);
  const regex = { $regex: q, $options: 'i' };
  const filter = {
    ...(tenantId ? { tenantId } : {}),
    $or: [{ name: regex }, { contact: regex }, { whatsapp: regex }],
  };
  return (await dbConnection.collection('suppliers').find(filter).sort({ name: 1 }).toArray()).map(withId);
}
async function FindSupplierByName(tenantId, name) {
  const n = String(name || '').trim();
  if (!n) return null;
  const escaped = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return withId(
    await dbConnection.collection('suppliers').findOne({
      ...(tenantId ? { tenantId } : {}),
      name: { $regex: `^${escaped}$`, $options: 'i' },
    })
  );
}
async function GetFoodsBySupplier(supplierId, tenantId) {
  const filter = {
    ...(tenantId ? { tenantId } : {}),
    supplierIds: String(supplierId),
  };
  return (await dbConnection.collection('foods').find(filter).sort({ name: 1 }).toArray()).map(withId);
}
async function UnlinkSupplierFromFoods(supplierId, tenantId) {
  const filter = tenantId ? { tenantId } : {};
  await dbConnection.collection('foods').updateMany(filter, { $pull: { supplierIds: String(supplierId) } });
}

// ── Compras ──
async function CreatePurchase(data) {
  const result = await dbConnection.collection('purchases').insertOne(data);
  return withId(await dbConnection.collection('purchases').findOne({ _id: result.insertedId }));
}
async function GetPurchases(tenantId, opts = {}) {
  const filter = { ...(tenantId ? { tenantId } : {}) };
  if (opts.supplierId) filter.supplierId = String(opts.supplierId);
  return (await dbConnection.collection('purchases').find(filter).sort({ date: -1, createdAt: -1 }).limit(200).toArray()).map(withId);
}
async function GetPurchaseById(id, tenantId) {
  const filter = oidFilter(id, tenantId);
  if (!filter) return null;
  return withId(await dbConnection.collection('purchases').findOne(filter));
}

// ── Lotes ──
async function CreateLot(data) {
  const result = await dbConnection.collection('lots').insertOne(data);
  return withId(await dbConnection.collection('lots').findOne({ _id: result.insertedId }));
}
async function GetLotsByFood(foodId, tenantId) {
  const filter = { foodId: String(foodId), ...(tenantId ? { tenantId } : {}) };
  return (await dbConnection.collection('lots').find(filter).sort({ expiresAt: 1 }).toArray()).map(withId);
}
async function GetExpiringLots(tenantId, until) {
  const filter = {
    ...(tenantId ? { tenantId } : {}),
    quantity: { $gt: 0 },
    expiresAt: { $ne: null, $lte: until },
  };
  return (await dbConnection.collection('lots').find(filter).sort({ expiresAt: 1 }).toArray()).map(withId);
}

/** Saca piezas de un lote concreto (atómico: no deja el lote en negativo). Devuelve el lote o null. */
async function TakeFromLot(lotId, quantity, tenantId) {
  if (!ObjectId.isValid(String(lotId))) return null;
  const qty = Math.max(0, Number(quantity) || 0);
  const filter = { _id: new ObjectId(String(lotId)), quantity: { $gte: qty }, ...(tenantId ? { tenantId } : {}) };
  const lot = await dbConnection.collection('lots').findOneAndUpdate(filter, { $inc: { quantity: -qty }, $set: { updatedAt: new Date() } }, { returnDocument: 'before' });
  return lot ? withId(lot.value !== undefined ? lot.value : lot) : null;
}
// ── Canjes con proveedor ──
async function CreateExchange(data) {
  const result = await dbConnection.collection('exchanges').insertOne(data);
  return withId(await dbConnection.collection('exchanges').findOne({ _id: result.insertedId }));
}
async function GetExchanges(tenantId, opts = {}) {
  const filter = { ...(tenantId ? { tenantId } : {}) };
  if (opts.supplierId) filter.supplierId = String(opts.supplierId);
  return (await dbConnection.collection('exchanges').find(filter).sort({ createdAt: -1 }).limit(300).toArray()).map(withId);
}

// ── Catálogos maestros por giro (los edita la plataforma) ──
async function GetEmailCode(email) {
  return dbConnection.collection('email_codes').findOne({ email });
}
async function SaveEmailCode(email, fields) {
  await dbConnection.collection('email_codes').updateOne({ email }, { $set: fields }, { upsert: true });
}
async function BumpEmailCodeTries(email) {
  const doc = await dbConnection.collection('email_codes').findOneAndUpdate({ email }, { $inc: { tries: 1 } }, { returnDocument: 'after' });
  return doc?.tries ?? doc?.value?.tries ?? 0;
}
async function DeleteEmailCode(email) {
  await dbConnection.collection('email_codes').deleteOne({ email });
}
async function ListCatalogItems(catalog) {
  const rows = await dbConnection.collection('master_catalog_items').find({ catalog }).sort({ section: 1, name: 1 }).toArray();
  return rows.map(withId);
}
async function CountCatalogItems(catalog) {
  return dbConnection.collection('master_catalog_items').countDocuments({ catalog });
}
async function GetCatalogItem(catalog, key) {
  return withId(await dbConnection.collection('master_catalog_items').findOne({ catalog, key: String(key) }));
}
async function InsertCatalogItems(items) {
  if (!items.length) return 0;
  const result = await dbConnection.collection('master_catalog_items').insertMany(items);
  return result.insertedCount;
}
/** Crea o actualiza un producto del catálogo por su `key`. */
async function UpsertCatalogItem(catalog, key, data) {
  const now = new Date();
  await dbConnection
    .collection('master_catalog_items')
    .updateOne({ catalog, key: String(key) }, { $set: { ...data, catalog, key: String(key), updatedAt: now }, $setOnInsert: { createdAt: now } }, { upsert: true });
  return GetCatalogItem(catalog, key);
}
async function DeleteCatalogItem(catalog, key) {
  return (await dbConnection.collection('master_catalog_items').deleteOne({ catalog, key: String(key) })).deletedCount;
}
async function IsCatalogSeeded() {
  return Boolean(await dbConnection.collection('app_state').findOne({ _id: 'master_catalog_seeded' }));
}
async function MarkCatalogSeeded() {
  await dbConnection.collection('app_state').updateOne({ _id: 'master_catalog_seeded' }, { $set: { at: new Date() } }, { upsert: true });
}

// ── Bitácora ──
async function CreateActivityLog(data) {
  const result = await dbConnection.collection('activity_log').insertOne(data);
  return withId(await dbConnection.collection('activity_log').findOne({ _id: result.insertedId }));
}
// —— Auditoría de la plataforma (lo que hace el equipo de Mi Tiendita). Colección aparte: los dueños no la ven ——
async function CreatePlatformAudit(entry) {
  const result = await dbConnection.collection('platform_audit').insertOne(entry);
  return { ...entry, id: String(result.insertedId) };
}
async function ListPlatformAudit({ tenantId = null, limit = 60 } = {}) {
  const filter = tenantId ? { tenantId: String(tenantId) } : {};
  const rows = await dbConnection
    .collection('platform_audit')
    .find(filter)
    .sort({ createdAt: -1 })
    .limit(Math.min(200, Math.max(1, Number(limit) || 60)))
    .toArray();
  return rows.map(({ _id, ...rest }) => ({ id: String(_id), ...rest }));
}
async function GetActivityLog(tenantId, limit = 80, { from, to, user, types } = {}) {
  const filter = tenantId ? { tenantId } : {};
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = from;
    if (to) filter.createdAt.$lte = to;
  }
  if (user) filter.user = String(user);
  if (Array.isArray(types) && types.length) filter.type = { $in: types.map(String) };
  return (await dbConnection
    .collection('activity_log')
    .find(filter)
    .sort({ createdAt: -1 })
    .limit(Math.min(500, Math.max(1, Number(limit) || 80)))
    .toArray()).map(withId);
}

async function GetPaidItemQtySince(tenantId, since) {
  const orders = await dbConnection
    .collection('orders')
    .find({
      tenantId,
      paymentStatus: 'paid',
      createdAt: { $gte: since },
    })
    .project({ items: 1 })
    .toArray();
  const map = {};
  for (const order of orders) {
    for (const item of order.items || []) {
      const id = String(item.foodId || item.food || '');
      if (!id) continue;
      map[id] = (map[id] || 0) + (Number(item.quantity) || 0);
    }
  }
  return map;
}

/** Para /health/ready: responde si la base contesta (lanza si no). */
async function Ping() {
  await dbConnection.command({ ping: 1 });
}

module.exports = {
  overlayMatrix,
  Ping, ListPaymentsBetween, CreatePrintJob, ClaimPrintJob, FinishPrintJob, GetPrintJob, TouchPrintStation, GetPrintStation, AcquireJobLock, FinishJob, ListJobRuns, ClaimDunningNotice, ReleaseDunningNotice, CustomerOrderStats, GetOrdersByCustomer, ApplyOrderReturn, GetClosedCashSessionsBetween, ListSettingsWithDailySummary, ClaimDailySummary, ReleaseDailySummary,
  ensureConnection,
  CreateTenant, GetTenantById, UpdateTenant, ListTenants, CountUsersByTenant, CountPendingInvites, ListUsersByTenant, GetTenantByMpPreapprovalId,
  CreateUser, FindUserByEmail, LoginUsuario, FindUserByUsername, UpdateUserById, FindUserByResetToken,
  ListPlatformUsers, CountPlatformAdmins, DeleteUserById,
  ListTenantAdminEmails,
  AddWaiter, GetWaiters, GetWaiterByCellphone, GetWaiterByDisponibility, DeleteWaiter, UpdateWaiter,
  GetSettings, CreateSettings, UpdateSettings,
  GetMenus, GetMenuById, CreateMenu, UpdateMenu, DeleteMenu,
  GetFoods, CountPlanFoods, CreateFoods, DeleteUnpricedCatalogFoods, DeleteEmptyCatalogMenus, ListSettingsNeedingCatalog, CountPaidOrders, CountCashSessions, GetFoodById, GetFoodByBarcode, CreateFood, UpdateFood, ReserveSaleStock, ConsumeSaleLots, RestoreSaleStock, IncrementFoodStock, DeleteFood, DeleteFoodsByIds, DeleteAllFoods, GetLowStockFoods, SearchFoods,
  AdjustFoodStock, CreateBillingEvent, ListBillingEvents, getCollection, ListUsersByTenants, GetSettingsMany, appState,
  RecordLoginFailure, ClearLoginFailures, FindUserById, BumpUserTokenVersion, CountActiveAdmins, FindUserInTenant,
  CreateSession, FindSessionByHash, RevokeSession, RevokeUserSessions,
  GetOrders, GetOrderById, GetOrderByInvoiceToken, GetOrderByClientSaleId, CreateOrder, UpdateOrder, DeleteOrder, GetOrdersByCashSession,
  GetOrdersByDateRange, GetSalesReport,
  SaveSupportMail, FindSupportMailByMessageIds, ListSupportMail, ListSupportMailAll, ListSupportMailRaw, ListUnmatchedSupportMail, AssignUnassignedSupportMail,
  GetInvites, GetInviteByToken, CreateInvite, UpdateInvite, DeleteInvite,
  GetOpenCashSession, GetCashSessionById, CreateCashSession, UpdateCashSession,
  aiMonthKey, GetAiUsage, ReserveAiUse, RefundAiUse, ListAiUsage, ListAiUsageAll,
  ListPlatformExpenses, ListPlatformExpensesAll, CreatePlatformExpense, DeletePlatformExpense,
  SavePlatformSnapshot, ListPlatformSnapshots,
  CreateCustomer, GetCustomers, GetCustomerById, UpdateCustomer, DeleteCustomer, SearchCustomers,
  SaveCostSnapshot, GetCostHistory, GetLastCostSnapshot, GetBulkLastCosts,
  CreateSupplier, GetSuppliers, GetSupplierById, UpdateSupplier, DeleteSupplier, SearchSuppliers, FindSupplierByName,
  GetFoodsBySupplier, UnlinkSupplierFromFoods,
  CreatePurchase, GetPurchases, GetPurchaseById,
  CreateLot, GetLotsByFood, GetExpiringLots, TakeFromLot, CreateExchange, GetExchanges,
  GetEmailCode, SaveEmailCode, BumpEmailCodeTries, DeleteEmailCode,
  ListCatalogItems, CountCatalogItems, GetCatalogItem, InsertCatalogItems, UpsertCatalogItem, DeleteCatalogItem, IsCatalogSeeded, MarkCatalogSeeded,
  CreatePlatformAudit, ListPlatformAudit, CreateActivityLog, GetActivityLog, GetPaidItemQtySince,
};
