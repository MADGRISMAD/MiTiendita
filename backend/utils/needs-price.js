// Los productos del catálogo maestro llegan sin precio (`needsPrice: true`). En cuanto se les pone
// uno, por cualquier camino (caja, edición, factura mágica), el marcador se apaga solo.

/** Parche listo para guardar: si trae un precio mayor a 0 y no dice otra cosa, el producto ya no necesita precio. */
function withPriceFlag(patch) {
  const hasPrice = patch && patch.price != null && Number(patch.price) > 0;
  return hasPrice && patch.needsPrice === undefined ? { ...patch, needsPrice: false } : patch;
}

module.exports = { withPriceFlag };
