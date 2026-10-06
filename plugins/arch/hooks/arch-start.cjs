#!/usr/bin/env node
// SessionStart (startup|resume): si el repo tiene una arquitectura declarada y todavía sin aprobar, lo avisa al
// arrancar, antes de que el primer intento de escribir código choque con arch-guard. Si no hay nada que decir, no imprime.
const fs = require('fs'), path = require('path');
const { run, projectDir } = require('./lib.cjs');

run('arch-start', (input) => {
  const cwd = projectDir(input);
  if (!fs.existsSync(path.join(cwd, 'architecture.json'))) return;
  let st;
  try { const L = require(path.join(__dirname, '..', 'skills', 'arch-first', 'scripts', 'archlib.cjs')); st = L.approvalState(L.loadConfig(path.join(cwd, 'architecture.json'))); }
  catch { return; } // architecture.json ilegible: lo informa arch-guard al escribir
  if (!st.approved) process.stdout.write(`Este repo tiene una arquitectura sin aprobar (${st.reason}). No se puede escribir código hasta que la persona la apruebe: mostrale el preview de /arch:arch-first y pedile que corra approve.cjs en su terminal.\n`);
});
