const router = require('express').Router();
const { limits } = require('../services/rate-limit.service');
const invoices = require('../controllers/invoices.controller');

router.get('/public/:token', limits.publicRead(), invoices.getPublic);
router.post('/public/:token', limits.publicWrite(), invoices.submitPublic);

module.exports = router;
