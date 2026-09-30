require('dotenv').config();
const { MongoClient, ObjectId } = require('mongodb');
const { createTenantDoc } = require('../models/tenant.model');

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

function withMesaId(doc) {
  return withId(doc);
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
  await dbConnection.collection('suppliers').createIndex({ tenantId: 1, name: 1 }).catch(() => {});
  await dbConnection.collection('purchases').createIndex({ tenantId: 1, date: -1 }).catch(() => {});
  await dbConnection.collection('lots').createIndex({ tenantId: 1, foodId: 1, expiresAt: 1 }).catch(() => {});
  await dbConnection.collection('activity_log').createIndex({ tenantId: 1, createdAt: -1 }).catch(() => {});
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
async function GetTenantById(id) {
  if (!ObjectId.isValid(id)) return null;
  return withId(await dbConnection.collection('tenants').findOne({ _id: new ObjectId(id) }));
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
async function ListTenants() {
  const list = await dbConnection.collection('tenants').find({}).sort({ createdAt: -1 }).toArray();
  return list.map(withId);
}
async function CountUsersByTenant(tenantId) {
  return dbConnection.collection('users').countDocuments({ tenantId: String(tenantId) });
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
    .find({ tenantId: String(tenantId) })
    .project({ password: 0, resetToken: 0, resetExpires: 0 })
    .toArray();
  return users.map((user) => ({
    id: String(user._id),
    name: user.name || '',
    lastName: user.lastName || '',
    username: user.username || '',
    email: user.email || '',
    cellphone: user.cellphone || '',
    role: user.role || '',
  }));
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

async function AddMesa(data) {
  const result = await dbConnection.collection('mesas').insertOne(data);
  return withMesaId(await dbConnection.collection('mesas').findOne({ _id: result.insertedId }));
}
async function UpdateStatusMesa(id, data, tenantId) {
  const clean = { ...data };
  delete clean.id;
  delete clean._id;
  let filter = oidFilter(id, tenantId);
  if (!filter) {
    filter = { numero: parseInt(id, 10), ...(tenantId ? { tenantId } : {}) };
  }
  let result = await dbConnection.collection('mesas').updateOne(filter, { $set: clean });
  if (result.matchedCount === 0 && tenantId) {
    result = await dbConnection.collection('mesas').updateOne(
      { nombre: String(id), tenantId },
      { $set: clean }
    );
  }
  return result;
}
async function Getmesas(tenantId) {
  const filter = tenantId ? { tenantId } : {};
  return (await dbConnection.collection('mesas').find(filter).toArray()).map(withMesaId);
}
async function GetMesaById(id, tenantId) {
  const byOid = oidFilter(id, tenantId);
  if (byOid) {
    const doc = await dbConnection.collection('mesas').findOne(byOid);
    if (doc) return withMesaId(doc);
  }
  const base = tenantId ? { tenantId } : {};
  let result = await dbConnection.collection('mesas').findOne({ ...base, nombre: id });
  if (!result) {
    result = await dbConnection.collection('mesas').findOne({ ...base, numero: parseInt(id, 10) });
  }
  return withMesaId(result);
}
async function GetNextMesaNumero(tenantId) {
  const filter = tenantId ? { tenantId } : {};
  const last = await dbConnection.collection('mesas').find(filter).sort({ numero: -1 }).limit(1).toArray();
  return last.length ? (last[0].numero || 0) + 1 : 1;
}
async function GetMesaFreeWaiter(tenantId) {
  const filter = { disponible: true, ...(tenantId ? { tenantId } : {}) };
  return (await dbConnection.collection('mesas').find(filter).toArray()).map(withMesaId);
}
async function DeleteMesa(id, tenantId) {
  const byOid = oidFilter(id, tenantId);
  if (byOid) {
    const byOidRes = await dbConnection.collection('mesas').deleteOne(byOid);
    if (byOidRes.deletedCount) return byOidRes;
  }
  return await dbConnection.collection('mesas').deleteOne({
    numero: parseInt(id, 10),
    ...(tenantId ? { tenantId } : {}),
  });
}
async function CloseMesas(tenantId) {
  const filter = tenantId ? { tenantId } : {};
  return await dbConnection.collection('mesas').updateMany(filter, { $set: { disponible: false, personaTitular: null } });
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
async function CountFoods(tenantId) {
  return dbConnection.collection('foods').countDocuments({ tenantId: String(tenantId) });
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
  const c = String(code || '').trim();
  if (!c) return null;
  const filter = {
    ...(tenantId ? { tenantId } : {}),
    $or: [{ barcode: c }, { sku: c }],
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
  const clean = { ...data };
  delete clean.id; delete clean._id;
  await dbConnection.collection('foods').updateOne(filter, { $set: clean });
  return GetFoodById(id, tenantId);
}
/** Resta existencias al cobrar. No bloquea la venta; el stock no baja de 0. */
async function DecrementFoodStock(id, quantity, tenantId) {
  const result = await ApplySaleDecrement(id, quantity, tenantId);
  return result.food;
}

/** Descuenta stock y, si el producto lleva caducidad, consume lotes FEFO. */
async function ApplySaleDecrement(id, quantity, tenantId) {
  const filter = oidFilter(id, tenantId);
  if (!filter) return { food: null, allocations: [] };
  const food = await dbConnection.collection('foods').findOne(filter);
  if (!food) return { food: null, allocations: [] };
  const qty = Math.max(0, Number(quantity) || 0);
  if (!qty) return { food: withId(food), allocations: [] };

  const allocations = [];
  if (food.tracksExpiry) {
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
  }

  const current = Math.max(0, Number(food.stock) || 0);
  const next = Math.max(0, current - qty);
  await dbConnection.collection('foods').updateOne(filter, { $set: { stock: next } });
  return { food: await GetFoodById(id, tenantId), allocations };
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
/** Suma piezas al inventario (entrada por compra / pack). */
async function IncrementFoodStock(id, quantity, tenantId) {
  const filter = oidFilter(id, tenantId);
  if (!filter) return null;
  const food = await dbConnection.collection('foods').findOne(filter);
  if (!food) return null;
  const qty = Math.max(0, Math.floor(Number(quantity) || 0));
  if (!qty) return withId(food);
  const current = Math.max(0, Number(food.stock) || 0);
  await dbConnection.collection('foods').updateOne(filter, { $set: { stock: current + qty } });
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

/** Productos cuyo stock está por debajo o igual al umbral mínimo. */
async function GetLowStockFoods(tenantId) {
  const filter = {
    ...(tenantId ? { tenantId } : {}),
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
  const regex = { $regex: q, $options: 'i' };
  const filter = {
    ...(tenantId ? { tenantId } : {}),
    $or: [{ name: regex }, { barcode: regex }, { sku: regex }],
  };
  return (await dbConnection.collection('foods').find(filter).toArray()).map(withId);
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

async function AddWaitList(data) {
  return await dbConnection.collection('waitlist').insertOne(data);
}
async function GetWaitList(tenantId) {
  const filter = tenantId ? { tenantId } : {};
  return await dbConnection.collection('waitlist').find(filter).toArray();
}
async function GetWaitListByNumber(number, tenantId) {
  return await dbConnection.collection('waitlist').findOne({ cellphone: parseInt(number, 10), ...(tenantId ? { tenantId } : {}) });
}
async function DeleteWaitList(id, tenantId) {
  return await dbConnection.collection('waitlist').deleteOne({ telefono: id, ...(tenantId ? { tenantId } : {}) });
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

async function GetOrders(tenantId) {
  const filter = tenantId ? { tenantId } : {};
  return (await dbConnection.collection('orders').find(filter).sort({ createdAt: -1 }).toArray()).map(withId);
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
async function UpdateOrder(id, data, tenantId) {
  const filter = oidFilter(id, tenantId);
  if (!filter) return null;
  const clean = { ...data };
  delete clean.id; delete clean._id;
  await dbConnection.collection('orders').updateOne(filter, { $set: clean });
  return GetOrderById(id, tenantId);
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
    mpStatus: data.mpStatus || null,
    at: data.at || new Date(),
  };
  const result = await dbConnection.collection('billing_events').insertOne(doc);
  return { id: String(result.insertedId), ...doc };
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

// ── Bitácora ──
async function CreateActivityLog(data) {
  const result = await dbConnection.collection('activity_log').insertOne(data);
  return withId(await dbConnection.collection('activity_log').findOne({ _id: result.insertedId }));
}
async function GetActivityLog(tenantId, limit = 80) {
  const filter = tenantId ? { tenantId } : {};
  return (await dbConnection
    .collection('activity_log')
    .find(filter)
    .sort({ createdAt: -1 })
    .limit(Math.min(200, Math.max(1, Number(limit) || 80)))
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

module.exports = {
  ensureConnection,
  CreateTenant, GetTenantById, UpdateTenant, ListTenants, CountUsersByTenant, CountPendingInvites, ListUsersByTenant, GetTenantByMpPreapprovalId,
  CreateUser, FindUserByEmail, LoginUsuario, FindUserByUsername, UpdateUserById, FindUserByResetToken,
  ListPlatformUsers, CountPlatformAdmins, DeleteUserById,
  ListTenantAdminEmails,
  AddMesa, UpdateStatusMesa, Getmesas, GetMesaFreeWaiter, GetMesaById, DeleteMesa, CloseMesas, GetNextMesaNumero,
  AddWaiter, GetWaiters, GetWaiterByCellphone, GetWaiterByDisponibility, DeleteWaiter, UpdateWaiter,
  AddWaitList, GetWaitList, GetWaitListByNumber, DeleteWaitList,
  GetSettings, CreateSettings, UpdateSettings,
  GetMenus, GetMenuById, CreateMenu, UpdateMenu, DeleteMenu,
  GetFoods, CountFoods, CountPaidOrders, CountCashSessions, GetFoodById, GetFoodByBarcode, CreateFood, UpdateFood, DecrementFoodStock, ApplySaleDecrement, RestoreSaleStock, IncrementFoodStock, DeleteFood, GetLowStockFoods, SearchFoods,
  CreateBillingEvent, ListBillingEvents,
  GetOrders, GetOrderById, GetOrderByInvoiceToken, GetOrderByClientSaleId, CreateOrder, UpdateOrder, GetOrdersByCashSession,
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
  CreateLot, GetLotsByFood, GetExpiringLots,
  CreateActivityLog, GetActivityLog, GetPaidItemQtySince,
};
