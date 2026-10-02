const service = require('../services/mesero.service');
const schema = require('../models/mesero.model');

const AddWaiter = async (req, res) => {
  try {
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).send(error.message);
    value.tenantId = req.tenantId;
    if (await service.GetWaiterByCellphone(value.cellphone, req.tenantId)) {
      return res.status(400).send('Ya hay alguien registrado con ese celular');
    }
    await service.AddWaiter(value);
    const created = await service.GetWaiterByCellphone(value.cellphone, req.tenantId);
    return res.status(201).send(created);
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message);
  }
};

const GetWaiters = async (req, res) => {
  try {
    const result = await service.GetWaiters(req.tenantId);
    return res.status(200).send(result);
  } catch (err) {
    console.error(err.message);
    return res.status(500).send(err.message);
  }
};

const GetWaiterByCellphone = async (req, res) => {
  try {
    const result = await service.GetWaiterByCellphone(req.params.cellphone, req.tenantId);
    if (!result?.matchedCount) return res.status(404).send('No se encontró a esa persona');
    return res.status(200).send(result);
  } catch (err) {
    console.error(err.message);
    return res.status(500).send(err.message);
  }
};

const GetWaiterByDisponibility = async (req, res) => {
  try {
    const result = await service.GetWaiterByDisponibility(
      req.params.disponibility,
      req.tenantId
    );
    if (!result?.matchedCount) return res.status(404).send('No se encontró a esa persona');
    return res.status(200).send(result);
  } catch (err) {
    console.error(err.message);
    return res.status(500).send(err.message);
  }
};

const DeleteWaiter = async (req, res) => {
  try {
    const result = await service.DeleteWaiter(req.params.cellphone, req.tenantId);
    if (!result?.matchedCount) return res.status(404).send('No se encontró a esa persona');
    return res.status(200).send(result);
  } catch (err) {
    console.error(err.message);
    return res.status(500).send(err.message);
  }
};

const UpdateWaiter = async (req, res) => {
  try {
    // Solo datos de la persona; nunca la tienda ni el celular (es la llave)
    const body = req.body || {};
    const data = {};
    for (const key of ['name', 'lastName', 'email']) {
      if (body[key] !== undefined) data[key] = String(body[key]).trim().slice(0, 80);
    }
    if (['morning', 'afternoon', 'evening'].includes(body.workSchedule)) data.workSchedule = body.workSchedule;
    if (['active', 'rest'].includes(body.status)) data.status = body.status;
    if (!Object.keys(data).length) return res.status(400).send('Nada que actualizar');
    const result = await service.UpdateWaiter(
      req.params.cellphone,
      data,
      req.tenantId
    );
    if (!result?.matchedCount) return res.status(404).send('No se encontró a esa persona');
    return res.status(200).send('Mesero actualizado');
  } catch (err) {
    console.error(err.message);
    return res.status(500).send(err.message);
  }
};

module.exports = {
  AddWaiter,
  GetWaiters,
  GetWaiterByCellphone,
  GetWaiterByDisponibility,
  DeleteWaiter,
  UpdateWaiter,
};
