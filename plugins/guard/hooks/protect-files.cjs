#!/usr/bin/env node
// PreToolUse (Edit|Write|MultiEdit): bloquea escrituras a archivos protegidos y contenido con apariencia de secreto.
// exit 2 + stderr = bloquea y Claude recibe el motivo. exit 0 = sin objeción.
// La heurística de secretos es una red de contención; gitleaks en CI es la barrera real.
const { run, block, ask } = require('./lib.cjs');

run('protect-files', (input) => {
  const ti = input.tool_input || {};
  const filePath = String(ti.file_path || '').replace(/\\/g, '/');
  const base = filePath.split('/').pop() || '';

  // 1) Rutas protegidas
  if (/(^|\/)\.git\//.test(filePath)) block(`${filePath} está dentro de .git/`);
  if (/^(package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/.test(base)) block(`${base} es un lockfile; regeneralo con el gestor de paquetes, no a mano`);
  if (/^\.env(\..+)?$/.test(base) && !/^\.env\.(example|sample|template)$/.test(base)) block(`${base} puede contener secretos; usá managed identity o variables de entorno del servicio`);

  // 2) Contenido con apariencia de secreto (Write: content; Edit: new_string; MultiEdit: edits[])
  const text = [ti.content, ti.new_string, ...(Array.isArray(ti.edits) ? ti.edits.map((e) => e && e.new_string) : [])].filter(Boolean).join('\n');
  const patterns = [
    [/AccountKey=[A-Za-z0-9+/=]{20,}/, 'clave de Storage (AccountKey=)'],
    [/SharedAccessKey=[A-Za-z0-9+/=]{20,}/, 'clave de acceso compartido (SharedAccessKey=)'],
    [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, 'clave privada'],
    [/client_?secret['"]?\s*[:=]\s*['"][^'"\s]{8,}['"]/i, 'client secret literal'],
    [/(?:Password|Pwd)=[^;'"\s]{6,}/i, 'password en connection string'],
    [/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/, 'token JWT literal'],
  ];
  for (const [re, label] of patterns) {
    if (re.test(text)) block(`el contenido para ${filePath || 'el archivo'} parece incluir ${label}. No pongas credenciales en el código: usá managed identity, federación OIDC o variables de entorno del servicio.`);
  }

  // 3) La configuración que activa estos hooks: que la cambie la persona, no Claude por su cuenta.
  if (/(^|\/)\.claude\/settings(\.local)?\.json$/.test(filePath)) ask(`${filePath} define permisos, hooks y plugins activos. Confirmá solo si pediste este cambio.`);
});
