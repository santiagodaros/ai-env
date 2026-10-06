#!/usr/bin/env node
// FUENTE ÚNICA: shared/. Los plugins llevan una copia porque un plugin instalado no puede leer archivos de otro.
// Después de editar: node scripts/sync-shared.cjs
// Registro de decisiones de arquitectura (ADR) en docs/decisions/. Sin dependencias.
// Uso: node adr.cjs new "<título>" [--status aceptada|propuesta] [--context t] [--decision t] [--alternatives t] [--consequences t]
//      node adr.cjs index    (regenera docs/decisions/README.md)
//      node adr.cjs check    (falla si algún ADR tiene "(completar)")
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const argv = process.argv.slice(2);
const cmd = argv[0];
const val = n => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const top = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' });
const root = argv.includes('--root') ? path.resolve(val('--root')) : (top.status === 0 ? top.stdout.trim() : process.cwd());
const dir = path.join(root, 'docs', 'decisions');
const files = () => (fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => /^\d{4}-.+\.md$/.test(f)).sort() : []);
const meta = f => { const t = fs.readFileSync(path.join(dir, f), 'utf8'); return { f, n: f.slice(0, 4), title: (t.match(/^#\s*ADR-\d{4}:\s*(.+)$/m) || [])[1] || f, state: (t.match(/^Estado:\s*(.+)$/m) || [])[1] || '?' }; };
const index = () => {
  const rows = files().map(meta).map(m => `| [${m.n}](${m.f}) | ${m.title} | ${m.state} |`);
  fs.writeFileSync(path.join(dir, 'README.md'), `# Decisiones de arquitectura\n\nUna página por decisión. Las decisiones no se reescriben: si cambia una, se agrega otra que la reemplaza y se marca la anterior como "reemplazada por ADR-NNNN".\n\n| Nº | Decisión | Estado |\n|---|---|---|\n${rows.join('\n')}\n`);
};
if (cmd === 'new') {
  const title = argv[1];
  if (!title || title.startsWith('--')) { console.error('Falta el título.'); process.exit(1); }
  const slug = title.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
  const n = String(files().length ? Math.max(...files().map(f => Number(f.slice(0, 4)))) + 1 : 1).padStart(4, '0');
  const st = val('--status') || 'aceptada';
  const sec = (k, d) => val(k) || '(completar)';
  const body = `# ADR-${n}: ${title}\n\nEstado: ${st} (${new Date().toISOString().slice(0, 10)})\n\n## Contexto\n${sec('--context')}\n\n## Decisión\n${sec('--decision')}\n\n## Alternativas consideradas\n${sec('--alternatives')}\n\n## Consecuencias\n${sec('--consequences')}\n`;
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, `${n}-${slug}.md`); fs.writeFileSync(f, body); index();
  console.log(`Creado ${path.relative(root, f).replace(/\\/g, '/')}`);
} else if (cmd === 'index') { fs.mkdirSync(dir, { recursive: true }); index(); console.log('Índice regenerado.'); }
else if (cmd === 'check') {
  const bad = files().filter(f => /\(completar\)/.test(fs.readFileSync(path.join(dir, f), 'utf8')));
  if (bad.length) { console.error('ADR incompletos (tienen "(completar)"):\n- ' + bad.join('\n- ')); process.exit(1); }
  console.log(`OK: ${files().length} ADR completos.`);
} else { console.error('Uso: adr.cjs new "<título>" | index | check'); process.exit(1); }
