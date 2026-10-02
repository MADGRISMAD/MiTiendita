function normalizeCashSession(body = {}, tenantId, openedBy) {
  return {
    tenantId,
    status: 'open',
    openingFloat: Number(body.openingFloat || 0),
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
