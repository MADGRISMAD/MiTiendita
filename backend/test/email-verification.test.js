const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const root = path.join(__dirname, '..');
const stub = (rel, exports) => {
  const file = require.resolve(path.join(root, rel));
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
};

function load({ smtp = true, mailDown = false } = {}) {
  delete process.env.SIGNUP_VERIFY;
  const codes = new Map();
  const mails = [];
  stub('database/mongodb.js', {
    async GetEmailCode(email) { return codes.get(email) || null; },
    async SaveEmailCode(email, f) { codes.set(email, { ...(codes.get(email) || {}), ...f }); },
    async BumpEmailCodeTries(email) { const d = codes.get(email); d.tries += 1; return d.tries; },
    async DeleteEmailCode(email) { codes.delete(email); },
  });
  stub('utils/mail.utils.js', {
    hasSmtpConfig: () => smtp,
    sendVerificationEmail: async ({ to, code }) => { if (mailDown) throw new Error('smtp caído'); mails.push({ to, code }); },
  });
  delete require.cache[require.resolve(path.join(root, 'services/email-verification.service.js'))];
  return { svc: require('../services/email-verification.service'), codes, mails };
}

test('el código llega al correo, sirve una vez y no se puede reusar', async () => {
  const { svc, mails } = load();
  await svc.send('Ana@Tienda.mx ');
  assert.equal(mails.length, 1);
  assert.equal(mails[0].to, 'ana@tienda.mx');
  assert.match(mails[0].code, /^\d{6}$/);
  await svc.consume('ana@tienda.mx', mails[0].code);
  await assert.rejects(svc.consume('ana@tienda.mx', mails[0].code), (e) => e.status === 400 && e.code === 'email_code_expired');
});

test('sin código, con código corto o con uno equivocado no pasa; a los 5 errores se invalida', async () => {
  const { svc, mails } = load();
  await assert.rejects(svc.consume('ana@tienda.mx', ''), (e) => e.code === 'email_code_required');
  await svc.send('ana@tienda.mx');
  const real = mails[0].code;
  const wrong = real === '000000' ? '111111' : '000000';
  await assert.rejects(svc.consume('ana@tienda.mx', wrong), (e) => e.code === 'email_code_wrong');
  for (let i = 0; i < 3; i += 1) await assert.rejects(svc.consume('ana@tienda.mx', wrong));
  await assert.rejects(svc.consume('ana@tienda.mx', wrong), (e) => e.code === 'email_code_expired');
  await assert.rejects(svc.consume('ana@tienda.mx', real), (e) => e.code === 'email_code_expired');
});

test('un código de otro correo no sirve y uno vencido tampoco', async () => {
  const { svc, mails, codes } = load();
  await svc.send('ana@tienda.mx');
  await assert.rejects(svc.consume('otra@tienda.mx', mails[0].code), (e) => e.code === 'email_code_expired');
  codes.get('ana@tienda.mx').expiresAt = new Date(Date.now() - 1000);
  await assert.rejects(svc.consume('ana@tienda.mx', mails[0].code), (e) => e.code === 'email_code_expired');
});

test('hay que esperar entre envíos, y hay tope por hora', async () => {
  const { svc, codes } = load();
  await svc.send('ana@tienda.mx');
  await assert.rejects(svc.send('ana@tienda.mx'), (e) => e.status === 429);
  codes.get('ana@tienda.mx').sentAt = new Date(Date.now() - 61000);
  codes.get('ana@tienda.mx').sends = Array(5).fill(new Date());
  await assert.rejects(svc.send('ana@tienda.mx'), (e) => e.status === 429);
  await assert.rejects(svc.send('no-es-correo'), (e) => e.status === 400);
});

test('si el correo no sale, no queda código guardado', async () => {
  const { svc, codes } = load({ mailDown: true });
  await assert.rejects(svc.send('ana@tienda.mx'), (e) => e.status === 502);
  assert.equal(codes.size, 0);
});

test('sin correo configurado en el servidor, no se exige', async () => {
  const { svc } = load({ smtp: false });
  assert.equal(svc.required(), false);
  await svc.consume('ana@tienda.mx', '');
});
