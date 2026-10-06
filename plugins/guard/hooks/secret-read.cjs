#!/usr/bin/env node
// PreToolUse (Read): evita que Claude lea archivos de secretos. Reemplaza las reglas permissions.deny,
// que un plugin no puede distribuir.
const { run, block } = require('./lib.cjs');

run('secret-read', (input) => {
  const p = String((input.tool_input || {}).file_path || '').replace(/\\/g, '/');
  const base = p.split('/').pop() || '';
  if (/^\.env(\..+)?$/.test(base) && !/^\.env\.(example|sample|template)$/.test(base)) block(`${base} puede contener secretos. Si necesitás saber qué variables existen, leé .env.example o pedile los nombres al usuario.`, 'env-file');
  if (/(^|\/)secrets\//.test(p)) block(`${p} está en una carpeta de secretos.`, 'secrets-dir');
  if (/\.(pem|pfx|p12)$/i.test(base) || /^id_(rsa|ed25519|ecdsa)$/.test(base)) block(`${base} es una clave o certificado privado.`, 'private-key');
});
