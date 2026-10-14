const db = require('../database/mongodb');
const st = require('../database/stocktake.db');
const svc = require('../services/stocktake.service');

const fail = (res, err) => {
  if (!err.status) console.error(err);
  return res.status(err.status || 500).json({ message: err.message || 'Error en el conteo', code: err.code });
};

/** Costo de cada producto, para valuar las diferencias. */
async function costMap(tenantId) {
  const foods = await db.GetFoods(tenantId);
  return new Map(foods.map((f) => [String(f.id), Number(f.cost) || 0]));
}

async function present(stocktake, tenantId) {
  const costs = await costMap(tenantId);
  const lines = stocktake.lines.map((l) => ({ ...l, diff: svc.lineDiff(l) }));
  return { ...stocktake, lines, summary: svc.summarize(stocktake, (id) => costs.get(String(id)) || 0) };
}

async function list(req, res) {
  try {
    const rows = await st.List(req.tenantId);
    return res.status(200).json(rows);
  } catch (err) {
    return fail(res, err);
  }
}

async function create(req, res) {
  try {
    const open = (await st.List(req.tenantId, 40)).filter((r) => r.status === svc.STATUS.OPEN);
    if (open.length >= 5) {
      return res.status(409).json({ message: 'Ya hay 5 conteos abiertos. Aplica o cancela alguno antes de abrir otro.', code: 'too_many_open' });
    }
    const menuId = String(req.body?.menuId || '').trim();
    const menus = await db.GetMenus(req.tenantId);
    if (menuId && !menus.some((m) => String(m.id) === menuId)) return res.status(404).json({ message: 'Categoría no encontrada' });
    const menuNames = Object.fromEntries(menus.map((m) => [String(m.id), m.name]));
    const foods = await db.GetFoods(req.tenantId);
    const lines = svc.buildLines(foods, { menuId, menuNames });
    if (!lines.length) return res.status(400).json({ message: 'No hay productos con existencias para contar.', code: 'no_lines' });
    const name = String(req.body?.name || '').trim().slice(0, 60) || (menuId ? `Conteo de ${menuNames[menuId]}` : 'Conteo general');
    const now = new Date();
    const created = await st.Create({
      tenantId: String(req.tenantId),
      name,
      menuId: menuId || null,
      status: svc.STATUS.OPEN,
      createdBy: req.user?.username || '',
      createdAt: now,
      updatedAt: now,
      lines,
    });
    return res.status(201).json(await present(created, req.tenantId));
  } catch (err) {
    return fail(res, err);
  }
}

async function get(req, res) {
  try {
    const stocktake = await st.GetById(req.params.id, req.tenantId);
    if (!stocktake) return res.status(404).json({ message: 'Conteo no encontrado' });
    return res.status(200).json(await present(stocktake, req.tenantId));
  } catch (err) {
    return fail(res, err);
  }
}

/** Guarda lo capturado (parcial). Body: { counts: [{ foodId, counted, note? }] } */
async function saveCounts(req, res) {
  try {
    const stocktake = await st.GetById(req.params.id, req.tenantId);
    if (!stocktake) return res.status(404).json({ message: 'Conteo no encontrado' });
    // Lo que dice el sistema AHORA: la diferencia se mide contra el momento en que se contó
    const foods = await db.GetFoods(req.tenantId);
    const currentStock = Object.fromEntries(foods.map((f) => [String(f.id), f.stock]));
    svc.mergeCounts(stocktake, req.body?.counts, currentStock);
    const saved = await st.SaveLines(stocktake.id, req.tenantId, stocktake.lines);
    return res.status(200).json(await present(saved, req.tenantId));
  } catch (err) {
    return fail(res, err);
  }
}

function storeFor(req) {
  const tenantId = req.tenantId;
  return {
    getFood: (id) => db.GetFoodById(id, tenantId),
    addStock: async (id, delta) => {
      // El conteo puede restar: se usa $inc directo para respetar lo vendido mientras se contaba
      await db.AdjustFoodStock(id, delta, tenantId);
    },
    takeLots: (id, qty) => db.ConsumeSaleLots(id, qty, tenantId),
    addLot: (food, qty) => {
      const now = new Date();
      return db.CreateLot({
        tenantId,
        foodId: String(food.id),
        foodName: food.name,
        lot: `CONTEO-${now.toISOString().slice(0, 10)}`,
        expiresAt: null,
        quantity: qty,
        initialQuantity: qty,
        unitCost: Number(food.cost) || 0,
        createdAt: now,
        updatedAt: now,
      });
    },
    log: (entry) => db.CreateActivityLog({ tenantId, createdAt: new Date(), ...entry }).catch(() => {}),
  };
}

async function apply(req, res) {
  try {
    const stocktake = await st.GetById(req.params.id, req.tenantId);
    if (!stocktake) return res.status(404).json({ message: 'Conteo no encontrado' });
    // Validaciones antes de reclamarlo: si falta algo no queda nada a medias
    const summary = svc.summarize(stocktake);
    if (stocktake.status !== svc.STATUS.OPEN) throw svc.httpError(409, stocktake.status === svc.STATUS.APPLIED ? 'Este conteo ya se aplicó.' : 'Este conteo ya no está abierto.');
    if (summary.counted === 0) throw svc.httpError(400, 'Todavía no has contado ningún producto.', 'nothing_counted');

    const claimed = await st.Claim(stocktake.id, req.tenantId, svc.STATUS.APPLIED, {
      appliedAt: new Date(),
      appliedBy: req.user?.username || '',
    });
    if (!claimed) throw svc.httpError(409, 'Este conteo ya se aplicó.', 'stocktake_applied');

    let result;
    try {
      result = await svc.applyStocktake({ ...claimed, status: svc.STATUS.OPEN }, storeFor(req), { user: req.user?.username || '' });
    } catch (err) {
      await st.Patch(stocktake.id, req.tenantId, { applyError: String(err.message || err).slice(0, 200) });
      throw err;
    }
    await st.Patch(stocktake.id, req.tenantId, { result: { summary: result.summary, changed: result.applied.length, skipped: result.skipped.length } });
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    return fail(res, err);
  }
}

async function cancel(req, res) {
  try {
    const claimed = await st.Claim(req.params.id, req.tenantId, svc.STATUS.CANCELLED, { cancelledAt: new Date() });
    if (!claimed) return res.status(409).json({ message: 'Este conteo ya no está abierto.' });
    return res.status(200).json({ ok: true });
  } catch (err) {
    return fail(res, err);
  }
}

module.exports = { list, create, get, saveCounts, apply, cancel };
