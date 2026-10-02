const db = require('../database/mongodb');

async function AddWaiter(data) {
  return await db.AddWaiter(data);
}
async function GetWaiters(tenantId) {
  return await db.GetWaiters(tenantId);
}
async function GetWaiterByCellphone(id, tenantId) {
  return await db.GetWaiterByCellphone(id, tenantId);
}
async function GetWaiterByDisponibility(disponibility, tenantId) {
  return await db.GetWaiterByDisponibility(disponibility, tenantId);
}
async function DeleteWaiter(id, tenantId) {
  return await db.DeleteWaiter(id, tenantId);
}
async function UpdateWaiter(id, data, tenantId) {
  return await db.UpdateWaiter(id, data, tenantId);
}

module.exports = {
  AddWaiter,
  GetWaiters,
  GetWaiterByCellphone,
  GetWaiterByDisponibility,
  DeleteWaiter,
  UpdateWaiter,
};
