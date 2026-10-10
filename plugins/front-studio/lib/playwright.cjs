// Ubica Playwright sin instalar nada: primero el del proyecto, después el global de npm.
'use strict';
const path = require('path');
const { spawnSync } = require('child_process');

function loadPlaywright() {
  const tries = [() => require(require.resolve('playwright', { paths: [process.cwd()] })), () => require('playwright')];
  tries.push(() => {
    const r = spawnSync('npm', ['root', '-g'], { encoding: 'utf8', shell: process.platform === 'win32' });
    const root = (r.stdout || '').trim();
    if (!root) throw new Error('sin npm root');
    return require(path.join(root, 'playwright'));
  });
  for (const t of tries) { try { return t(); } catch { /* siguiente */ } }
  return null;
}

const HOW_TO = [
  'Playwright no está disponible. Opciones:',
  '  En el proyecto:  npm i -D playwright  y  npx playwright install chromium',
  '  Global:          npm i -g playwright  y  npx playwright install chromium',
  '  Interactivo:     npm i -g @playwright/cli  y luego  playwright-cli open <url>  /  playwright-cli resize 1280 800  /  playwright-cli screenshot',
].join('\n');

module.exports = { loadPlaywright, HOW_TO };
