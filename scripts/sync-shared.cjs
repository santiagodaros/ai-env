#!/usr/bin/env node
// Copia shared/hooks-lib.cjs a hooks/lib.cjs de cada plugin que tiene hooks. Con --check no escribe: falla si difieren.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), src = fs.readFileSync(path.join(root, 'shared', 'hooks-lib.cjs'), 'utf8');
const check = process.argv.includes('--check');
let bad = 0;
for (const p of fs.readdirSync(path.join(root, 'plugins'))) {
  const dir = path.join(root, 'plugins', p, 'hooks');
  if (!fs.existsSync(path.join(dir, 'hooks.json'))) continue;
  const dst = path.join(dir, 'lib.cjs');
  const same = fs.existsSync(dst) && fs.readFileSync(dst, 'utf8') === src;
  if (same) continue;
  if (check) { console.error(`DESINCRONIZADO: plugins/${p}/hooks/lib.cjs (corré node scripts/sync-shared.cjs)`); bad++; }
  else { fs.writeFileSync(dst, src); console.log(`actualizado plugins/${p}/hooks/lib.cjs`); }
}
process.exit(bad ? 1 : 0);
