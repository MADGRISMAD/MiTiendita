const service = require('../services/mesero.service');
const schema = require('../models/mesero.model');

const AddWaiter = async (req, res) => {
  try {
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).send(error.message);
    value.tenantId = req.tenantId;
    if (await service.GetWaiterByCellphone(value.cellphone, req.tenantId)) {
      return res.status(400).send('Mesero ya existe');
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
    if (!result) return res.status(404).send('Mesero no encontrado');
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
    if (!result) return res.status(404).send('Mesero no encontrado');
    return res.status(200).send(result);
  } catch (err) {
    console.error(err.message);
    return res.status(500).send(err.message);
  }
};

const DeleteWaiter = async (req, res) => {
  try {
    const result = await service.DeleteWaiter(req.params.cellphone, req.tenantId);
    if (!result) return res.status(404).send('Mesero no encontrado');
    return res.status(200).send(result);
  } catch (err) {
    console.error(err.message);
    return res.status(500).send(err.message);
  }
};

const UpdateWaiter = async (req, res) => {
  try {
    const result = await service.UpdateWaiter(
      req.params.cellphone,
      req.body,
      req.tenantId
    );
    if (!result) return res.status(404).send('Mesero no encontrado');
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
