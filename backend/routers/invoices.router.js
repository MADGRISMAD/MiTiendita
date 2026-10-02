const router = require('express').Router();
const invoices = require('../controllers/invoices.controller');

router.get('/public/:token', invoices.getPublic);
router.post('/public/:token', invoices.submitPublic);

module.exports = router;
