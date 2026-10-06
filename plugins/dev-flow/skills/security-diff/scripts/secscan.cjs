#!/usr/bin/env node
// Revisión de seguridad determinista sobre las líneas AGREGADAS de un rango de git.
// Uso: node secscan.cjs --range <base>..HEAD [--state docs/features/<slug>/STATE.md] [--json]
// Una línea se puede excluir con el comentario "secscan-allow" (por ejemplo, un secreto falso en una prueba).
// Un riesgo aceptado se declara en el STATE: "Riesgo aceptado: <Sxxx> <motivo de al menos 10 caracteres>".
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const argv = process.argv.slice(2);
const val = n => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const range = val('--range');
if (!range) { console.error('Falta --range <base>..HEAD'); process.exit(1); }
const top = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' });
const root = top.status === 0 ? top.stdout.trim() : process.cwd();
const d = spawnSync('git', ['diff', '--unified=0', '--no-color', range], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
if (d.status !== 0) { console.error('git diff falló: ' + (d.stderr || '').trim()); process.exit(1); }

const GUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
const RULES = [
  ['S001', 'alta', /(AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{30,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|AccountKey=[A-Za-z0-9+\/=]{30,})/, 'credencial o clave privada'],
  ['S001', 'alta', /(client[_-]?secret|password|passwd|pwd|api[_-]?key|secret|token)\s*[:=]\s*['"](?!(\$\{|<|your|example|changeme|xxx|\*\*\*|process\.env))[^'"\s]{8,}['"]/i, 'credencial literal en el código'],
  ['S002', 'alta', /(rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED|verify\s*=\s*False|-SkipCertificateCheck|InsecureSkipVerify|curl\s[^|]*\s-k\b|--insecure)/, 'verificación de TLS desactivada'],
  ['S003', 'alta', /(\beval\s*\(|new Function\s*\(|Invoke-Expression|\biex\s+[\$\(]|os\.system\s*\(|shell\s*=\s*True|child_process[^\n]*\bexec(Sync)?\s*\(\s*[`'"][^`'"]*(\$\{|['"]\s*\+))/, 'ejecución dinámica de código o comandos'],
  ['S004', 'media', /\b(query|execute|exec|raw)\s*\(\s*(f?[`'"][^`'"]*(\$\{|%s|\{[a-z_]+\})|[^)]*['"]\s*\+\s*\w)/i, 'posible inyección: consulta armada con datos concatenados (usar parámetros)'],
  ['S005', 'media', /(dangerouslySetInnerHTML|\.innerHTML\s*=|document\.write\s*\()/, 'inserción de HTML sin escapar (XSS)'],
  ['S006', 'media', /(Access-Control-Allow-Origin['"]?\s*[:,]\s*['"]\*|origin\s*:\s*['"]\*['"])/i, 'CORS abierto a cualquier origen'],
  ['S007', 'media', /(\.ReadWrite\.All|Directory\.ReadWrite|RoleManagement\.ReadWrite|--role\s+['"]?Owner\b|RoleDefinitionName\s+['"]?Owner\b)/, 'permiso amplio: revisá mínimo privilegio'],
  ['S008', 'media', GUID, 'GUID literal (posible id de tenant, suscripción o cliente)'],
  ['S010', 'media', /(console\.(log|info|debug)|\bprint|Write-(Host|Output)|logger\.\w+)\s*\(?[^\n]*\b(token|secret|password|authorization|bearer)\b/i, 'posible registro de un secreto'],
  ['S012', 'baja', /createHash\(\s*['"](md5|sha1)['"]\s*\)|hashlib\.(md5|sha1)\(/, 'hash débil'],
  ['S009', 'baja', /['"`]http:\/\/(?!localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|www\.w3\.org|schemas\.|example\.)[^\s'"`]+/, 'URL sin cifrar'],
];
const LOCK = /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|poetry\.lock|Pipfile\.lock)$/;
const found = [], deps = []; const touched = new Set(); let file = null, ln = 0;
for (const l of d.stdout.split('\n')) {
  if (l.startsWith('+++ ')) { file = l.slice(4).replace(/^b\//, ''); if (file === '/dev/null') file = null; if (file) touched.add(file); continue; }
  const h = l.match(/^@@ -\d+(?:,\d+)? \+(\d+)/); if (h) { ln = Number(h[1]) - 1; continue; }
  if (!file || !l.startsWith('+') || l.startsWith('+++')) continue;
  ln++; const t = l.slice(1);
  if (/secscan-allow/.test(t)) continue;
  if (/(^|\/)package\.json$/.test(file) && /^\s*"(@?[\w.\/-]+)"\s*:\s*"[\^~><=]*\d/.test(t) && !/^\s*"(version|name)"/.test(t)) deps.push({ file, line: ln, msg: `dependencia nueva o actualizada: ${t.trim().replace(/,$/, '')}` });
  if (/(^|\/)requirements[\w.-]*\.txt$/.test(file) && /^[\w.\-\[\]]+\s*[=<>~!]/.test(t)) deps.push({ file, line: ln, msg: `dependencia nueva o actualizada: ${t.trim()}` });
  for (const [id, sev, re, msg] of RULES) if (re.test(t)) { found.push({ id, sev, file, line: ln, msg }); break; }
}
const manifests = [...touched].filter(f => /(^|\/)(package\.json|requirements[\w.-]*\.txt|pyproject\.toml|Pipfile)$/.test(f));
for (const f of touched) if (LOCK.test(f) && !manifests.some(m => path.posix.dirname(m) === path.posix.dirname(f))) found.push({ id: 'S011', sev: 'media', file: f, line: 1, msg: 'el lockfile cambió sin cambiar el manifiesto: revisá qué dependencias se movieron' });

let accepted = [];
const sp = val('--state');
if (sp) { try { accepted = [...fs.readFileSync(path.resolve(root, sp), 'utf8').matchAll(/^Riesgo aceptado:\s*(S\d{3})\s+(.{10,})$/gim)].map(m => ({ id: m[1], why: m[2].trim() })); } catch { /* sin STATE */ } }
const isAcc = f => accepted.some(a => a.id === f.id);
const open = found.filter(f => !isAcc(f)), acc = found.filter(isAcc);
const res = { high: open.filter(f => f.sev === 'alta'), medium: open.filter(f => f.sev === 'media'), low: open.filter(f => f.sev === 'baja'), accepted: acc.map(f => ({ ...f, why: accepted.find(a => a.id === f.id).why })), deps };
if (argv.includes('--json')) console.log(JSON.stringify(res));
else {
  const p = (t, a) => a.length && console.log(`${t}:\n` + a.map(f => `- ${f.id ? f.id + ' ' : ''}${f.file}:${f.line}: ${f.msg}${f.why ? ' (aceptado: ' + f.why + ')' : ''}`).join('\n'));
  p('ALTA (bloquea)', res.high); p('MEDIA (revisar)', res.medium); p('BAJA', res.low); p('ACEPTADOS', res.accepted); p('DEPENDENCIAS', deps);
  if (!found.length && !deps.length) console.log('Sin hallazgos en las líneas agregadas.');
}
process.exit(res.high.length ? 3 : 0);
