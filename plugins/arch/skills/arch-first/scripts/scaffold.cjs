#!/usr/bin/env node
// Crea el esqueleto hexagonal SIN código: carpetas con README por capa, architecture.json, ARCHITECTURE.md y el ADR 0001.
// Uso: node scaffold.cjs --type web|api|automation|cli --lang ts|py|ps1 --name <nombre> [--dir <carpeta>] [--force]
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const argv = process.argv.slice(2);
const val = n => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const fail = m => { console.error('RECHAZADO: ' + m); process.exit(1); };
const type = val('--type'), lang = val('--lang'), name = val('--name');
const dir = path.resolve(val('--dir') || process.cwd());
if (!['web', 'api', 'automation', 'cli'].includes(type)) fail('--type debe ser web, api, automation o cli.');
if (!['ts', 'py', 'ps1'].includes(lang)) fail('--lang debe ser ts, py o ps1.');
if (!name || !/^[a-z0-9][a-z0-9-]{0,40}$/.test(name)) fail('--name inválido (minúsculas, números y guiones).');
if (fs.existsSync(path.join(dir, 'architecture.json')) && !argv.includes('--force')) fail('ya existe architecture.json (usá --force para reemplazarlo).');

const root = lang === 'py' ? `src/${name.replace(/-/g, '_')}` : 'src';
const FORBID = {
  ts: ['express', 'fastify', 'koa', 'axios', 'node-fetch', 'undici', 'react', 'react-dom', 'next', 'vue', '@angular/core', '@azure/', 'aws-sdk', '@aws-sdk/', 'pg', 'mysql', 'mysql2', 'mongodb', 'mongoose', 'prisma', '@prisma/client', 'fs', 'child_process', 'http', 'https', 'net'],
  py: ['requests', 'httpx', 'flask', 'fastapi', 'django', 'sqlalchemy', 'boto3', 'azure', 'psycopg2', 'pymongo', 'subprocess', 'sqlite3'],
  ps1: ['Az.', 'Az', 'Microsoft.Graph', 'AzureAD', 'MSOnline'],
};
const inboundDesc = { web: 'UI (páginas, componentes) y rutas', api: 'controladores HTTP, colas y triggers', automation: 'entrada por CLI o trigger programado', cli: 'comandos de la CLI' }[type];
const SEC = [
  { layer: 'inbound', control: type === 'web' || type === 'api' ? 'autenticar y autorizar cada ruta; validar y limitar el tamaño de toda entrada; cabeceras de seguridad y CSRF donde corresponda' : 'validar parámetros de entrada; sin secretos en argumentos ni en logs' },
  { layer: 'application', control: 'autorización de negocio por caso de uso; sin acceso directo a infraestructura; errores explícitos sin filtrar datos internos' },
  { layer: 'domain', control: 'invariantes y validaciones de reglas; código puro, sin E/S ni secretos' },
  { layer: 'outbound', control: 'mínimo privilegio y identidad administrada; consultas parametrizadas; timeouts, reintentos acotados y lista permitida de destinos; sin registrar secretos ni datos personales' },
  { layer: 'config', control: 'único lugar que lee entorno y secretos (gestor de secretos); falla al arrancar si falta algo; nada sensible en el repositorio' },
];
const L = (n, may) => ({ paths: [n], mayImport: may });
const cfg = {
  version: 1, name, type, language: lang,
  layers: {
    domain: L(`${root}/domain`, ['domain']),
    application: L(`${root}/application`, ['domain', 'application']),
    inbound: L(`${root}/adapters/inbound`, ['application', 'domain', 'inbound']),
    outbound: L(`${root}/adapters/outbound`, ['application', 'domain', 'outbound']),
    config: L(`${root}/config`, ['domain', 'application', 'inbound', 'outbound', 'config']),
  },
  coreLayers: ['domain', 'application'], envOnlyIn: ['config', 'outbound'],
  forbiddenInCore: FORBID[lang], aliases: lang === 'ts' ? { '@/': 'src/' } : {},
  allowOutside: ['tests/', 'test/', 'scripts/', 'docs/', '.github/', '.claude/', 'node_modules/'],
  ports: { driving: [], driven: [] }, security: SEC,
};
const w = (rel, txt) => { const p = path.join(dir, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, txt); };
w('architecture.json', JSON.stringify(cfg, null, 2) + '\n');
const readme = {
  domain: 'Reglas de negocio y entidades puras. No importa nada de otras capas ni de librerías de infraestructura. Sin E/S, sin variables de entorno.',
  application: 'Casos de uso y los puertos (interfaces) que necesitan. Orquesta el dominio. Depende solo del dominio.',
  'adapters/inbound': `Adaptadores de entrada: ${inboundDesc}. Traducen el mundo externo a llamadas a casos de uso. Dependen de application y domain, nunca de adaptadores de salida.`,
  'adapters/outbound': 'Adaptadores de salida: implementan los puertos con tecnología concreta (bases de datos, APIs, Azure, archivos). Dependen de application y domain.',
  config: 'Raíz de composición: único lugar que arma casos de uso con sus adaptadores y lee variables de entorno y secretos.',
};
for (const [k, t] of Object.entries(readme)) w(`${root}/${k}/README.md`, `# ${k}\n\n${t}\n`);
for (const t of ['domain', 'application', 'adapters']) w(`tests/${t}/README.md`, `# tests/${t}\n\n${t === 'domain' ? 'Pruebas unitarias puras, sin dobles de infraestructura.' : t === 'application' ? 'Casos de uso probados con puertos falsos en memoria.' : 'Pruebas de contrato e integración de cada adaptador contra su puerto.'}\n`);
const tpl = fs.readFileSync(path.join(__dirname, '..', 'templates', 'ARCHITECTURE.md'), 'utf8').replace(/\{\{name\}\}/g, name).replace(/\{\{type\}\}/g, type).replace(/\{\{lang\}\}/g, lang);
w('docs/architecture/ARCHITECTURE.md', tpl);
const adr = path.join(__dirname, '..', '..', 'adr', 'scripts', 'adr.cjs');
if (fs.existsSync(adr)) {
  const r = spawnSync(process.execPath, [adr, 'new', 'Arquitectura hexagonal como estructura base', '--root', dir,
    '--context', `El proyecto ${name} (${type}) necesita una estructura que aísle las reglas de negocio de la infraestructura y se pueda probar y cambiar por partes.`,
    '--decision', 'Puertos y adaptadores: dominio y aplicación en el núcleo; adaptadores de entrada y salida dependen del núcleo; la configuración y los secretos entran solo por la raíz de composición. Contrato en architecture.json, verificado por arch-check y por un hook antes de escribir código.',
    '--alternatives', 'Capas tradicionales (presentación, negocio, datos) y estructura plana por funcionalidad; se descartaron porque permiten que el negocio dependa de la infraestructura.',
    '--consequences', 'Más carpetas e interfaces al inicio; a cambio, pruebas más simples, reemplazo de infraestructura sin tocar el negocio y reglas de dependencia verificables de forma automática.'], { encoding: 'utf8' });
  if (r.status !== 0) console.error('Aviso: no se pudo crear el ADR 0001: ' + (r.stderr || '').trim());
}
console.log(`Esqueleto creado en ${dir}\n- architecture.json (completá ports y revisá forbiddenInCore)\n- docs/architecture/ARCHITECTURE.md (completá las secciones "(completar)")\nNo se escribió ningún archivo de código. Siguiente: preview.cjs y aprobación humana con approve.cjs.`);
