function normalizeCashSession(body = {}, tenantId, openedBy) {
  return {
    tenantId,
    status: 'open',
    openingFloat: Number(body.openingFloat || 0),
    // A cuántos pesos está el dólar en este turno (lo confirma quien abre la caja); null si no se manejan dólares
    usdRate: Number(body.usdRate) > 0 && Number(body.usdRate) <= 500 ? Number(Number(body.usdRate).toFixed(4)) : null,
    openedBy: openedBy || null,
    openedAt: new Date(),
    closedAt: null,
    closedBy: null,
    countedCash: null,
    expectedCash: null,
    expectedCard: null,
    expectedTransfer: null,
    expectedOther: null,
    expectedTotal: null,
    difference: null,
    notes: '',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

module.exports = { normalizeCashSession };
