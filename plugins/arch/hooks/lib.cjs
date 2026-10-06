// Utilidades comunes de los hooks de ai-env. Sin dependencias.
// FUENTE ÚNICA: shared/hooks-lib.cjs. Cada plugin lleva una copia en hooks/lib.cjs porque un plugin
// instalado no puede leer archivos fuera de su carpeta. Después de editar: node scripts/sync-shared.cjs
//
// Interruptores (variables de entorno del proceso de Claude Code, no de los comandos que corre Claude):
//   AI_ENV_HOOKS=off              apaga todos los hooks de ai-env
//   AI_ENV_HOOKS_SKIP=a,b         apaga los hooks nombrados (p. ej. bash-guard,stop-verify)
//   AI_ENV_GUARD_STRICT=1         lo que normalmente pide confirmación pasa a bloquearse
//   AI_ENV_LOG=off                no registra las decisiones de los hooks
const fs = require('fs'), os = require('os'), path = require('path');
const on = (v) => /^(1|true|on|yes)$/i.test(String(v || ''));
const isOff = (v) => /^(off|0|false|no)$/i.test(String(v || ''));

const off = (name) => {
  if (isOff(process.env.AI_ENV_HOOKS)) return true;
  return String(process.env.AI_ENV_HOOKS_SKIP || '').split(',').map((s) => s.trim()).includes(name);
};

// Registro local de decisiones: qué hook actuó, qué decidió y por qué regla. Nunca guarda el comando,
// la ruta ni el contenido: solo identificadores fijos. Sirve para saber qué reglas ayudan y cuáles molestan
// (/dev-flow:doctor stats). Mejor esfuerzo: un error acá jamás cambia la decisión del hook.
const LOG_MAX = 512 * 1024;
const logFile = () => path.join(process.env.AI_ENV_HOME || os.homedir(), '.claude', 'ai-env', 'usage.jsonl');
const log = (hook, decision, rule) => {
  if (isOff(process.env.AI_ENV_LOG)) return;
  try {
    const f = logFile();
    fs.mkdirSync(path.dirname(f), { recursive: true });
    try { if (fs.statSync(f).size > LOG_MAX) { const l = fs.readFileSync(f, 'utf8').split('\n'); fs.writeFileSync(f, l.slice(Math.floor(l.length / 2)).join('\n')); } } catch { /* todavía no existe */ }
    const clean = (s) => String(s || '').replace(/[^a-z0-9-]/gi, '').slice(0, 40);
    fs.appendFileSync(f, JSON.stringify({ t: new Date().toISOString(), hook: clean(hook), d: clean(decision), rule: clean(rule) }) + '\n');
  } catch { /* sin registro */ }
};

let current = 'hook';
// block: exit 2 + stderr. Claude recibe el motivo y no ejecuta la herramienta (o no termina el turno, en Stop).
const block = (msg, rule = 'sin-regla') => { log(current, 'block', rule); process.stderr.write(`Bloqueado: ${msg}\n`); process.exit(2); };
// ask: pide confirmación humana. En modo estricto, o sin persona delante, equivale a bloquear.
const ask = (reason, rule = 'sin-regla') => {
  if (on(process.env.AI_ENV_GUARD_STRICT)) block(reason, rule);
  log(current, 'ask', rule);
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: reason } }));
  process.exit(0);
};
// Lee el JSON del hook por stdin y llama a fn(input). Entrada ilegible o error interno: no bloquear.
const run = (name, fn) => {
  current = name;
  if (off(name)) process.exit(0);
  let raw = '';
  process.stdin.on('data', (c) => (raw += c));
  process.stdin.on('end', () => {
    let input;
    try { input = JSON.parse(raw); } catch { process.exit(0); }
    try { fn(input || {}); } catch (e) { process.stderr.write(`ai-env ${name}: error interno, no se aplicó la regla (${e && e.message})\n`); process.exit(0); }
    process.exit(0);
  });
};
// Carpeta del proyecto: la que informa Claude Code, o el cwd del evento.
const projectDir = (input) => process.env.CLAUDE_PROJECT_DIR || (input && input.cwd) || process.cwd();
module.exports = { off, block, ask, run, log, logFile, projectDir };
