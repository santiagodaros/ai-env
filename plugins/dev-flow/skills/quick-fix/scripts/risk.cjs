// Piso de carril de quick-fix: reglas fijas sobre las RUTAS y sobre el CONTENIDO del diff.
// Un cambio de una línea puede sacar la autenticación de una ruta: por eso se miran las líneas agregadas Y las
// eliminadas, en cualquier archivo que no sea prueba ni documentación. El script fija el piso; el modelo puede
// subirlo (proponer el flujo completo por su cuenta), nunca bajarlo. No hay flag para saltearlo.
'use strict';

// --- Rutas. Identidad se decide por palabras de la ruta (carpetas, nombre, camelCase), no por subcadenas:
// "authMiddleware.ts" o "src/auth/" cuentan; "author.ts" o "tokenizer.ts" no.
const IDENTITY_WORDS = new Set(['auth', 'authn', 'authz', 'authentication', 'authorization', 'login', 'logout', 'signin', 'oauth', 'oidc', 'saml', 'sso', 'msal', 'jwt', 'token', 'tokens', 'secret', 'secrets', 'credential', 'credentials', 'password', 'passwords', 'permission', 'permissions', 'rbac', 'acl', 'role', 'roles', 'policy', 'policies', 'identity', 'iam', 'crypto', 'session', 'sessions', 'cors', 'csrf', 'xsrf', 'keyvault', 'vault']);
const words = (p) => String(p).replace(/\\/g, '/').split(/[/._\-\s]+/).flatMap((s) => s.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').split(' ')).map((w) => w.toLowerCase()).filter(Boolean);

const PATH_RULES = [
  { id: 'deps', re: /(^|\/)(package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|requirements[\w.-]*\.txt|pyproject\.toml|poetry\.lock|Pipfile(\.lock)?|go\.(mod|sum)|Cargo\.(toml|lock)|pom\.xml|build\.gradle(\.kts)?|[\w.-]+\.csproj|packages\.config|Directory\.Packages\.props)$/i, msg: 'cambia dependencias o el manifiesto del proyecto' },
  { id: 'infra', re: /\.(tf|tfvars|bicep|bicepparam)$|(^|\/)(azure-pipelines[\w.-]*\.ya?ml|\.github\/workflows\/)|(^|\/)(infra|infrastructure|iac|deploy|terraform|bicep)\//i, msg: 'toca infraestructura o pipelines' },
  { id: 'arch', re: /(^|\/)(architecture\.json|ARCHITECTURE\.md)$|(^|\/)docs\/decisions\//, msg: 'cambia la arquitectura o una decisión registrada' },
  { id: 'identity', test: (f) => words(f).some((w) => IDENTITY_WORDS.has(w)) || /(^|\/)\.env(\.|$)/.test(f), msg: 'toca identidad, permisos, secretos o sesión' },
  { id: 'schema', re: /(^|\/)(migrations?|prisma)\/|\.sql$|(^|\/)schema\.prisma$/i, msg: 'toca el esquema o datos persistentes' },
  { id: 'claude', re: /(^|\/)\.claude\/(?!\.feature-flow\/)/, msg: 'cambia la configuración de Claude Code del repo' },
];

function pathReasons(files) {
  const out = [];
  for (const r of PATH_RULES) {
    const hit = files.filter((f) => (r.test ? r.test(f) : r.re.test(f)));
    if (hit.length) out.push({ id: r.id, msg: r.msg, files: hit });
  }
  return out;
}

// --- Contenido. Cada regla se evalúa sobre líneas agregadas (+) y eliminadas (-).
const CONTENT_RULES = [
  { id: 'auth', msg: 'autenticación o autorización', re: /\b(require_?auth\w*|ensure_?auth\w*|is_?authenticated|authenticate\w*|authori[sz]e\w*|passport\.authenticate|jwt\.(verify|sign|decode)|verify_?token|check_?jwt|requires_?auth|with_?auth|auth_?guard|can_?activate|login_required|permission_required|allow_?anonymous|require_?authorization|@PreAuthorize|@Secured|@RolesAllowed|@PermitAll|\[Authorize\b|\[AllowAnonymous\b)/i },
  { id: 'session', msg: 'sesión, cookies o vencimiento de credenciales', re: /\b\w*(session|token|cookie|idle|refresh)\w*(timeout|ttl|expir\w*|lifetime|max_?age)\w*\b|\b(max_?age|expires_?in|http_?only|same_?site)\b|\bsecure\s*[:=]\s*(false|False|0)\b/i },
  { id: 'cors', msg: 'CORS u orígenes permitidos', re: /(Access-Control-Allow-\w+|\bcors\b|allowed_?origins|AllowAnyOrigin|\borigin\s*[:=])/i },
  { id: 'tls', msg: 'validación de certificados o TLS', re: /(rejectUnauthorized|NODE_TLS_REJECT_UNAUTHORIZED|verify\s*=\s*False|SkipCertificateCheck|InsecureSkipVerify|ServerCertificateValidationCallback|checkServerIdentity|ssl_?verify)/i },
  { id: 'roles', msg: 'roles, permisos o alcances', re: /\b(roles|permissions?|scopes|claims|is_?admin|rbac|acl|has_?role|has_?permission|check_?permission|role_?assignment)\b/i },
  { id: 'secrets', msg: 'secretos o credenciales', re: /\b(secret|password|passwd|api_?key|private_?key|client_?secret|connection_?string|sas_?token|bearer)\b/i },
  { id: 'csrf', msg: 'protección CSRF', re: /\b(csrf|xsrf|antiforgery|ValidateAntiForgeryToken)\b/i },
  // `re.exec(` (expresiones regulares) no cuenta; `exec(` suelto o `cp.exec(` sí.
  { id: 'exec', msg: 'ejecución dinámica de código o comandos', re: /(\beval\s*\(|new Function\s*\(|child_process|(?<![.\w])exec(Sync|File\w*)?\s*\(|\b(cp|childProcess)\.(exec|spawn)\w*\s*\(|Invoke-Expression|\biex\b|os\.system|\bsubprocess\b|shell\s*=\s*True)/ },
];

// Diff unificado (git diff --unified=0) → líneas con archivo, signo y número de línea.
function parseDiff(text) {
  const out = [];
  let file = null, oldNo = 0, newNo = 0;
  for (const l of String(text).split('\n')) {
    if (l.startsWith('+++ ')) { file = l.slice(4).replace(/^b\//, '').trim(); if (file === '/dev/null') file = null; continue; }
    if (l.startsWith('--- ')) { if (l.slice(4).trim() !== '/dev/null' && !file) file = l.slice(4).replace(/^a\//, '').trim(); continue; }
    const h = l.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (h) { oldNo = Number(h[1]); newNo = Number(h[2]); continue; }
    if (!file || l.startsWith('\\')) continue;
    if (l.startsWith('+')) out.push({ file, sign: '+', line: newNo++, text: l.slice(1) });
    else if (l.startsWith('-')) out.push({ file, sign: '-', line: oldNo++, text: l.slice(1) });
  }
  return out;
}

// skip(file) → true para pruebas y documentación (no son código que corre en producción).
function contentRisks(diffText, skip = () => false) {
  const found = [];
  for (const d of parseDiff(diffText)) {
    if (skip(d.file)) continue; // sin comentarios de excepción: un comentario lo podría agregar el mismo cambio
    for (const r of CONTENT_RULES) {
      if (r.re.test(d.text)) { found.push({ id: r.id, msg: r.msg, file: d.file, line: d.line, sign: d.sign, text: d.text.trim().slice(0, 100) }); break; }
    }
  }
  return found;
}

module.exports = { PATH_RULES, CONTENT_RULES, IDENTITY_WORDS, words, pathReasons, parseDiff, contentRisks };
