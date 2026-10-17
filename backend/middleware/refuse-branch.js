/**
 * Las sucursales las administra el dueño de la matriz: el panel de la plataforma las puede VER pero no
 * cambiarles plan, estado, cobros ni vendedor (todo eso sale de la matriz; ver `overlayMatrix` en database/mongodb.js).
 * Se pone en las rutas del panel que modifican una tienda por `:id`.
 */
function refuseBranch(db) {
  return async function refuseBranchMiddleware(req, res, next) {
    try {
      const tenant = await db.GetTenantById(req.params.id);
      if (tenant?.isBranch) {
        return res
          .status(409)
          .send('Esta tienda es una sucursal: su plan, sus cobros y su estado se administran desde su matriz. Aquí solo se puede consultar.');
      }
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = { refuseBranch };
