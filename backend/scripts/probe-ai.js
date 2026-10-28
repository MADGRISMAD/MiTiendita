/**
 * Prueba la IA de búsqueda de productos en el servidor y muestra qué responde (sin gastar usos de ninguna tienda).
 * Uso:   docker compose exec api node scripts/probe-ai.js 7501483147860
 *        (o, fuera de docker: node scripts/probe-ai.js 7501483147860)
 */
require('dotenv').config();
const gemini = require('../services/gemini.service');

(async () => {
  const code = String(process.argv[2] || '').replace(/\D/g, '');
  console.log('Llave de Gemini configurada:', gemini.hasGeminiConfig() ? 'sí' : 'NO (falta GEMINI_API_KEY)');
  console.log('Modelo:', gemini.geminiModel());
  if (!gemini.hasGeminiConfig()) process.exit(1);
  if (code.length < 8) {
    console.log('Pasa un código de barras: node scripts/probe-ai.js 7501483147860');
    process.exit(1);
  }
  try {
    const r = await gemini.identifyProduct({ code, categories: ['Limpieza', 'Botanas', 'Bebidas'] });
    const { debug, ...result } = r;
    console.log('\nResultado que vería la tienda:\n', JSON.stringify(result, null, 2));
    console.log('\nDetalle de la IA:\n', JSON.stringify(debug, null, 2));
  } catch (err) {
    console.log('\nLa IA respondió con un ERROR:', err.code || '', err.message);
    if (err.debug) console.log(JSON.stringify(err.debug, null, 2));
    process.exit(2);
  }
})();
