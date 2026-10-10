// Perfiles de plugins: shared/profiles.json es la única fuente de verdad. Verifica que el marketplace, los plugins
// existentes y las copias literales de los dos instaladores coincidan exactamente con la tabla, y que la resolución
// del perfil (AI_ENV_PROFILE, -PluginProfile, AI_ENV_PLUGINS gana, full por defecto) funcione de verdad.
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

module.exports = function profiles({ check, add }) {
  const root = path.join(__dirname, '..');
  const P = JSON.parse(fs.readFileSync(path.join(root, 'shared', 'profiles.json'), 'utf8'));
  const market = JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin', 'marketplace.json'), 'utf8')).plugins.map((p) => p.name);
  const names = Object.keys(P.profiles);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const sorted = (a) => [...a].sort();

  check('perfiles: el orden declarado cubre exactamente los perfiles definidos', same(sorted(P.order), sorted(names)) && same(P.order, ['core', 'app', 'cloud', 'frontend', 'full']));
  check('perfiles: el perfil por defecto es full', P.default === 'full');
  check('perfiles: full es exactamente el marketplace', same(sorted(P.profiles.full.plugins), sorted(market)), `${P.profiles.full.plugins} vs ${market}`);
  check('perfiles: todo plugin de un perfil existe en el marketplace y en plugins/', names.every((n) => P.profiles[n].plugins.every((p) => market.includes(p) && fs.existsSync(path.join(root, 'plugins', p, '.claude-plugin', 'plugin.json')))));
  const core = P.profiles.core.plugins;
  check('perfiles: todos incluyen core (dev-flow depende de arch)', names.every((n) => core.every((p) => P.profiles[n].plugins.includes(p))));
  check('perfiles: la matriz es la acordada', same(P.profiles.app.plugins, [...core, 'app-review']) && same(P.profiles.cloud.plugins, [...core, 'cloud-ops']) && same(P.profiles.frontend.plugins, [...core, 'app-review', 'front-studio']));
  check('perfiles: dev-flow lleva la copia sincronizada', fs.readFileSync(path.join(root, 'plugins', 'dev-flow', 'lib', 'profiles.json'), 'utf8') === fs.readFileSync(path.join(root, 'shared', 'profiles.json'), 'utf8'));

  // Copias literales en los instaladores.
  const sh = fs.readFileSync(path.join(root, 'install.sh'), 'utf8');
  const ps = fs.readFileSync(path.join(root, 'install.ps1'), 'utf8');
  const shTable = Object.fromEntries([...sh.matchAll(/^\s*(\w+)\) PROFILE_PLUGINS="([^"]+)" ;;$/gm)].map((m) => [m[1], m[2].split(' ')]));
  const psTable = Object.fromEntries([...ps.matchAll(/^\s*(\w+) = '([^']+)'$/gm)].map((m) => [m[1], m[2].split(' ')]));
  const table = Object.fromEntries(P.order.map((n) => [n, P.profiles[n].plugins]));
  check('perfiles: install.sh tiene la misma tabla que shared/profiles.json', same(shTable, table), JSON.stringify(shTable));
  check('perfiles: install.ps1 tiene la misma tabla que shared/profiles.json', same(psTable, table), JSON.stringify(psTable));
  check('perfiles: install.ps1 usa -PluginProfile (no -Profile, que pisa $PROFILE)', /^param\(\[string\]\$PluginProfile = ''\)$/m.test(ps) && !/\$Profile\b(?!s)/.test(ps.replace(/\$PROFILE es/g, '')));

  // Resolución real, sin instalar nada (AI_ENV_DRY_RUN).
  const dry = (env) => { const r = spawnSync('sh', [path.join(root, 'install.sh')], { encoding: 'utf8', env: { ...process.env, AI_ENV_PLUGINS: '', AI_ENV_PROFILE: '', ...env, AI_ENV_DRY_RUN: '1' } }); return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}`.trim() }; };
  if (process.platform !== 'win32' && spawnSync('sh', ['-c', 'true']).status === 0) {
    check('instalador (sh): sin perfil instala full', dry({}).out === `Plugins (perfil full): ${table.full.join(' ')}`, dry({}).out);
    check('instalador (sh): AI_ENV_PROFILE elige el perfil', P.order.every((n) => dry({ AI_ENV_PROFILE: n }).out === `Plugins (perfil ${n}): ${table[n].join(' ')}`));
    check('instalador (sh): AI_ENV_PLUGINS gana sobre el perfil', dry({ AI_ENV_PROFILE: 'cloud', AI_ENV_PLUGINS: 'guard dev-flow' }).out === 'Plugins (AI_ENV_PLUGINS): guard dev-flow');
    const bad = dry({ AI_ENV_PROFILE: 'todo' });
    check('instalador (sh): un perfil desconocido falla y dice cuáles hay', bad.code === 1 && /core, app, cloud, frontend o full/.test(bad.out));
  }
  const pwsh = ['powershell', 'pwsh'].find((c) => spawnSync(c, ['-NoProfile', '-Command', 'exit 0'], { encoding: 'utf8' }).status === 0);
  if (pwsh) {
    const psFile = path.join(root, 'install.ps1').replace(/'/g, "''");
    const run = (cmd, env = {}) => { const r = spawnSync(pwsh, ['-NoProfile', '-NonInteractive', '-Command', cmd], { encoding: 'utf8', env: { ...process.env, AI_ENV_PLUGINS: '', AI_ENV_PROFILE: '', ...env, AI_ENV_DRY_RUN: '1' } }); return `${r.stdout || ''}${r.stderr || ''}`.trim(); };
    const viaBlock = (args) => `& ([scriptblock]::Create((Get-Content -Raw '${psFile}'))) ${args}`;
    check(`instalador (${pwsh}): -PluginProfile elige el perfil`, run(viaBlock('-PluginProfile cloud')) === `Plugins (perfil cloud): ${table.cloud.join(' ')}`, run(viaBlock('-PluginProfile cloud')));
    check(`instalador (${pwsh}): AI_ENV_PROFILE funciona con irm | iex (el bloque param no rompe Invoke-Expression)`, run(`Get-Content -Raw '${psFile}' | Invoke-Expression`, { AI_ENV_PROFILE: 'app' }) === `Plugins (perfil app): ${table.app.join(' ')}`, run(`Get-Content -Raw '${psFile}' | Invoke-Expression`, { AI_ENV_PROFILE: 'app' }));
    check(`instalador (${pwsh}): sin perfil instala full`, run(viaBlock('')) === `Plugins (perfil full): ${table.full.join(' ')}`);
    check(`instalador (${pwsh}): AI_ENV_PLUGINS gana sobre -PluginProfile`, run(viaBlock('-PluginProfile core'), { AI_ENV_PLUGINS: 'guard' }) === 'Plugins (AI_ENV_PLUGINS): guard');
    check(`instalador (${pwsh}): un perfil desconocido falla`, /Perfil desconocido/.test(run(viaBlock('-PluginProfile todo'))));
  } else add('AVISO', 'instalador PowerShell sin probar en esta máquina', 'no hay powershell ni pwsh');
};
