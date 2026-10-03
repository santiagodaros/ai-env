#!/usr/bin/env node
// Instalador no destructivo del kit. Uso:
//   node install.js --repo "C:\ruta\a\hub-csp" [--dry-run] [--force] [--skip-personal]
// Por defecto NO pisa archivos existentes: los saltea y lo informa. --force los reemplaza.
// No modifica ~/.claude/settings.json ni tu CLAUDE.md existente: imprime lo que tenés que pegar a mano.

const fs = require('fs');
const os = require('os');
const path = require('path');

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};

const dry = flag('--dry-run');
const force = flag('--force');
const skipPersonal = flag('--skip-personal');
const repoArg = opt('--repo');
const home = process.env.KIT_HOME_OVERRIDE || os.homedir(); // el override es solo para pruebas
const kit = __dirname;

const log = [];
const say = (tag, msg) => log.push(`[${tag}] ${msg}`);

function copyFile(src, dest) {
  if (fs.existsSync(dest) && !force) return say('OMITIDO', `${dest} ya existe (usá --force para reemplazar)`);
  say(dry ? 'SIMULADO' : 'COPIADO', dest);
  if (dry) return;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function copyTree(srcDir, destDir) {
  for (const e of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const s = path.join(srcDir, e.name);
    const d = path.join(destDir, e.name);
    if (e.isDirectory()) copyTree(s, d);
    else copyFile(s, d);
  }
}

if (!repoArg && !skipPersonal && flag('--help')) {
  console.log('Uso: node install.js --repo <ruta> [--dry-run] [--force] [--skip-personal]');
  process.exit(0);
}

// 1) Personal
if (!skipPersonal) {
  copyTree(path.join(kit, 'personal', 'skills'), path.join(home, '.claude', 'skills'));
  copyFile(path.join(kit, 'personal', 'statusline.cjs'), path.join(home, '.claude', 'statusline.cjs'));
  const userMd = path.join(home, '.claude', 'CLAUDE.md');
  if (fs.existsSync(userMd)) {
    say('MANUAL', `${userMd} ya existe: agregá a mano el contenido de personal/CLAUDE.md`);
  } else {
    copyFile(path.join(kit, 'personal', 'CLAUDE.md'), userMd);
  }
  say('MANUAL', `Para la status line, pegá el bloque de personal/settings.snippet.json en ${path.join(home, '.claude', 'settings.json')}`);
}

// 2) Repo
if (repoArg) {
  const repo = path.resolve(repoArg);
  if (!fs.existsSync(repo) || !fs.statSync(repo).isDirectory()) {
    console.error(`La ruta del repo no existe: ${repo}`);
    process.exit(1);
  }
  copyTree(path.join(kit, 'repo', '.claude'), path.join(repo, '.claude'));
  copyTree(path.join(kit, 'repo', '.github'), path.join(repo, '.github'));
  copyFile(path.join(kit, 'repo', 'docs', 'STATE.md'), path.join(repo, 'docs', 'STATE.md'));
  const md = path.join(repo, 'CLAUDE.md');
  if (fs.existsSync(md) && !force) {
    const alt = path.join(repo, 'CLAUDE.kit.md');
    say('MANUAL', `${md} ya existe: fusioná a mano el contenido de ${alt}`);
    copyFile(path.join(kit, 'repo', 'CLAUDE.md'), alt);
  } else {
    copyFile(path.join(kit, 'repo', 'CLAUDE.md'), md);
  }
  say('MANUAL', 'Agregá a tu .gitignore el contenido de repo/.gitignore.snippet');
  say('MANUAL', 'Reemplazá los comandos de la sección "Comandos" de CLAUDE.md por los reales');
  say('MANUAL', 'Completá en docs/STATE.md dónde corre el backend');
  say('OPCIONAL', 'repo/optional/claude-review.yml: copialo a .github/workflows/ solo tras revisar la política de la empresa');
} else {
  say('INFO', 'Sin --repo: solo se instaló la parte personal');
}

console.log(log.join('\n'));
console.log(`\n${dry ? 'Simulación terminada (no se escribió nada).' : 'Instalación terminada.'} Siguiente paso: node smoke-test.js${repoArg ? ` --repo "${repoArg}"` : ''}`);
