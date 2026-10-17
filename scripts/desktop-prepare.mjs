// Prepara lo que va dentro del instalador de escritorio (src-tauri/staging y src-tauri/binaries):
//  1. compila la interfaz (frontend/dist → staging/ui)
//  2. copia el backend sin pruebas ni secretos e instala SOLO sus dependencias de producción
//     (better-sqlite3 se compila/descarga para ESTA plataforma: el instalador de Windows se arma en Windows)
//  3. copia el ejecutable de Node como sidecar: binaries/node-<target-triple>
import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync, copyFileSync, chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tauri = join(root, 'src-tauri');
const staging = join(tauri, 'staging');
const run = (cmd, cwd = root) => execSync(cmd, { cwd, stdio: 'inherit' });

console.log('› interfaz');
run('npm run build --workspace frontend');
rmSync(staging, { recursive: true, force: true });
mkdirSync(staging, { recursive: true });
cpSync(join(root, 'frontend', 'dist'), join(staging, 'ui'), { recursive: true });

console.log('› backend');
const skip = new Set(['node_modules', 'test', 'ApiTests', 'scripts', '.env', '.env.example', 'webpack.config.js', 'ecosystem.config.js', 'eslint.config.mjs']);
cpSync(join(root, 'backend'), join(staging, 'backend'), {
  recursive: true,
  filter: (src) => {
    const rel = src.slice(join(root, 'backend').length + 1);
    if (!rel) return true;
    const top = rel.split(/[\\/]/)[0];
    if (skip.has(top)) return false;
    if (rel.startsWith(join('data', 'local'))) return false; // base de pruebas local
    return true;
  },
});
// Dependencias de producción, fuera del workspace (para que queden dentro de backend/node_modules)
const pkg = JSON.parse(readFileSync(join(staging, 'backend', 'package.json'), 'utf8'));
delete pkg.devDependencies;
pkg.scripts = {};
writeFileSync(join(staging, 'backend', 'package.json'), JSON.stringify(pkg, null, 2));
run('npm install --omit=dev --no-audit --no-fund --no-package-lock --workspaces=false', join(staging, 'backend'));

console.log('› node');
// Node OFICIAL y autónomo de nodejs.org (el de Homebrew depende de librerías de esta Mac y no sirve en otra).
// Misma versión que compila las dependencias, para que el módulo nativo de SQLite sea compatible.
const triple = execSync('rustc -vV').toString().match(/host: (\S+)/)[1];
const version = process.version; // p. ej. v22.23.3
const isWin = triple.includes('windows');
const arch = triple.startsWith('aarch64') ? 'arm64' : 'x64';
const cache = join(tauri, 'binaries', '.cache');
mkdirSync(cache, { recursive: true });
const dest = join(tauri, 'binaries', `node-${triple}${isWin ? '.exe' : ''}`);
if (isWin) {
  const url = `https://nodejs.org/dist/${version}/win-${arch}/node.exe`;
  run(`curl -fSL "${url}" -o "${dest}"`);
} else if (triple.includes('apple-darwin')) {
  const name = `node-${version}-darwin-${arch}`;
  const tgz = join(cache, `${name}.tar.gz`);
  if (!existsSync(tgz)) run(`curl -fSL "https://nodejs.org/dist/${version}/${name}.tar.gz" -o "${tgz}"`);
  run(`tar -xzf "${tgz}" -C "${cache}" "${name}/bin/node"`);
  copyFileSync(join(cache, name, 'bin', 'node'), dest);
  chmodSync(dest, 0o755);
} else {
  throw new Error(`plataforma no soportada para el instalador: ${triple}`);
}
console.log(`listo: node ${version} (${triple}) → ${dest}`);
if (!existsSync(join(staging, 'backend', 'node_modules', 'better-sqlite3'))) throw new Error('falta better-sqlite3 en el backend empaquetado');
