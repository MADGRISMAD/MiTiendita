/**
 * Arma el correo interno de deploy (MiTiendita) para GitHub Actions o una vista previa local.
 *
 *   node backend/scripts/render-deploy-mail.js
 *   node backend/scripts/render-deploy-mail.js --preview
 */
const fs = require('fs');
const path = require('path');
const { deployStatusEmail } = require('../utils/internal-mail-templates');

function tijuanaStamp(date = new Date()) {
  const formatted = new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Tijuana',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(date);
  return `${formatted} · Tijuana`;
}

function fromEnv() {
  return {
    result: process.env.DEPLOY_RESULT || 'success',
    repository: process.env.REPOSITORY || '',
    branch: process.env.BRANCH || '',
    sha: process.env.SHA || '',
    author: (process.env.COMMIT_AUTHOR || '').trim() || '(desconocido)',
    pusher: (process.env.PUSHER || '').trim() || '(desconocido)',
    when: tijuanaStamp(),
    message: (process.env.COMMIT_MESSAGE || '').trim() || '(sin mensaje)',
    commitUrl: process.env.COMMIT_URL || '',
    runUrl: process.env.RUN_URL || '',
    prodUrl: process.env.PROD_URL || 'https://www.mitiendita.software/',
    serviceName: process.env.SERVICE_NAME || 'Mi Tiendita',
  };
}

function writeMail(dir, payload) {
  fs.mkdirSync(dir, { recursive: true });
  const mail = deployStatusEmail(payload);
  const htmlPath = path.join(dir, 'deploy-status.html');
  const textPath = path.join(dir, 'deploy-status.txt');
  fs.writeFileSync(htmlPath, mail.html, 'utf8');
  fs.writeFileSync(textPath, mail.text, 'utf8');
  return { ...mail, htmlPath, textPath };
}

function writeGithubOutput(subject, ready) {
  const dest = process.env.GITHUB_OUTPUT;
  if (!dest) return;
  fs.appendFileSync(
    dest,
    `subject<<MAILSUBJECT\n${subject}\nMAILSUBJECT\nready=${ready ? 'true' : 'false'}\n`,
    'utf8'
  );
}

function previewSamples() {
  const outDir = path.join(__dirname, '..', '..', 'tmp-mail-preview');
  const base = {
    repository: 'MADGRISMAD/timberPOS',
    branch: 'main',
    sha: 'c0be09a1234567890',
    author: 'Manuel Sabino',
    pusher: 'MADGRISMAD',
    when: tijuanaStamp(),
    message: 'chore: machote MiTiendita para avisos de deploy\n\nVerde bosque, sistema interno.',
    commitUrl: 'https://github.com/MADGRISMAD/timberPOS/commit/c0be09a1234567890',
    runUrl: 'https://github.com/MADGRISMAD/timberPOS/actions',
    prodUrl: 'https://www.mitiendita.software/',
    serviceName: 'Mi Tiendita',
  };

  const indexRows = ['success', 'failure', 'cancelled'].map((result) => {
    const dir = path.join(outDir, result);
    const mail = writeMail(dir, { ...base, result });
    fs.writeFileSync(path.join(outDir, `${result}.html`), mail.html, 'utf8');
    return `<a href="${result}.html" style="display:block;padding:14px 16px;margin:0 0 8px;border-radius:12px;background:#e7efe4;color:#122017;text-decoration:none;font-weight:700">${result} — ${mail.subject}</a>`;
  });

  const index = `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><title>MiTiendita · previews</title></head>
<body style="margin:0;background:#e7efe4;font-family:Figtree,Segoe UI,sans-serif;padding:32px">
  <h1 style="letter-spacing:-.04em">MiTiendita · correos de deploy</h1>
  ${indexRows.join('')}
</body></html>`;
  fs.writeFileSync(path.join(outDir, 'index.html'), index, 'utf8');
  console.log(`Previews en ${outDir}`);
}

function main() {
  if (process.argv.includes('--preview')) {
    previewSamples();
    return;
  }

  const mail = writeMail(process.cwd(), fromEnv());
  const ready =
    process.env.MAIL_USER_SET === 'true' && process.env.MAIL_PASS_SET === 'true';
  writeGithubOutput(mail.subject, ready);
  console.log(mail.text);
  if (!ready) {
    console.log(
      '::warning::No se envió el correo: faltan MAIL_USERNAME y/o MAIL_PASSWORD en el entorno production (Settings > Environments > production).'
    );
  }
}

main();
