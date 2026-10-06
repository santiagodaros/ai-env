#!/usr/bin/env node
// Copia los archivos de shared/ a cada plugin que los necesita. Un plugin instalado solo ve su propia carpeta,
// así que lo que comparten dos plugins se mantiene en un lugar y se copia. Con --check no escribe: falla si difieren.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const check = process.argv.includes('--check');
// La librería de hooks va a todo plugin que tenga hooks/hooks.json.
const withHooks = fs.readdirSync(path.join(root, 'plugins')).filter((p) => fs.existsSync(path.join(root, 'plugins', p, 'hooks', 'hooks.json')));
const MAP = [
  ['shared/hooks-lib.cjs', withHooks.map((p) => `plugins/${p}/hooks/lib.cjs`)],
  // Contrato de arquitectura: lo define el plugin arch y lo verifican las compuertas de dev-flow.
  ['shared/arch/archlib.cjs', ['plugins/arch/skills/arch-first/scripts/archlib.cjs', 'plugins/dev-flow/lib/arch/archlib.cjs']],
  ['shared/arch/arch-check.cjs', ['plugins/arch/skills/arch-first/scripts/arch-check.cjs', 'plugins/dev-flow/lib/arch/arch-check.cjs']],
  ['shared/adr.cjs', ['plugins/arch/skills/adr/scripts/adr.cjs', 'plugins/dev-flow/lib/adr.cjs']],
];
let bad = 0;
for (const [src, dests] of MAP) {
  const text = fs.readFileSync(path.join(root, src), 'utf8');
  for (const d of dests) {
    const dst = path.join(root, d);
    if (fs.existsSync(dst) && fs.readFileSync(dst, 'utf8') === text) continue;
    if (check) { console.error(`DESINCRONIZADO: ${d} (fuente: ${src}; corré node scripts/sync-shared.cjs)`); bad++; }
    else { fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.writeFileSync(dst, text); console.log(`actualizado ${d}`); }
  }
}
process.exit(bad ? 1 : 0);
