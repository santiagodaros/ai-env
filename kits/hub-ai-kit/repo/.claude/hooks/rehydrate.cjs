#!/usr/bin/env node
// SessionStart (matcher: compact): reinyecta docs/STATE.md en el contexto tras cada compactación.
// Lo que se imprime por stdout entra al contexto de Claude. Si no existe el STATE, no imprime nada.

const fs = require('fs');
const path = require('path');

let raw = '';
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  let cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  try {
    const input = JSON.parse(raw);
    if (!process.env.CLAUDE_PROJECT_DIR && input.cwd) cwd = input.cwd;
  } catch {
    /* sin stdin válido: seguir con cwd */
  }

  const statePath = path.join(cwd, 'docs', 'STATE.md');
  if (!fs.existsSync(statePath)) process.exit(0);

  const MAX = 8000; // margen bajo el tope de 10.000 caracteres
  let text = fs.readFileSync(statePath, 'utf8');
  let note = '';
  if (text.length > MAX) {
    text = text.slice(0, MAX);
    note = '\n[STATE truncado: mover lo histórico a docs/STATE-archive.md]';
  }

  process.stdout.write(
    'La conversación acaba de compactarse. Este es el estado del proyecto (docs/STATE.md). ' +
      'Si algo del resumen automático lo contradice, gana el STATE. ' +
      'Antes de seguir, resumí en 5 líneas lo entendido y pedí confirmación.\n\n' +
      text +
      note +
      '\n'
  );
  process.exit(0);
});
