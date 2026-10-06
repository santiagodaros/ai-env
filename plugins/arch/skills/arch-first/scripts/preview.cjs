#!/usr/bin/env node
// Genera la vista previa de la arquitectura (diagrama SVG + carpetas + reglas + seguridad) sin dependencias.
// Uso: node preview.cjs [--dir <carpeta>] [--artifact]  -> docs/architecture/preview.html (o preview.artifact.html)
const fs = require('fs'), path = require('path');
const L = require('./archlib.cjs');
const argv = process.argv.slice(2);
const dir = path.resolve(argv.includes('--dir') ? argv[argv.indexOf('--dir') + 1] : process.cwd());
const found = L.findConfig(dir, dir);
if (!found) { console.error('RECHAZADO: no hay architecture.json.'); process.exit(1); }
const cfg = L.loadConfig(found.file);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ports = cfg.ports || { driving: [], driven: [] };
const dr = ports.driving || [], dn = ports.driven || [];
const st = L.approvalState(cfg);

const rowH = 18, gap = 6, colTop = 64;
const wrap = (str, n) => { const out = []; let cur = ''; for (const w of String(str).split(/\s+/)) { if ((cur + ' ' + w).trim().length > n && cur) { out.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); } if (cur) out.push(cur); return out; };
// Lista con ajuste de línea: devuelve el SVG y el alto que ocupa.
const list = (texts, x, y0, n) => { let y = y0, out = ''; if (!texts.length) texts = ['(sin declarar)']; for (const t of texts) { const ls = wrap(t, n); ls.forEach((l, i) => { out += `<text x="${x}" y="${y + i * rowH}" class="t${t === '(sin declarar)' ? ' mute' : ''}">${esc(l)}</text>`; }); y += ls.length * rowH + gap; } return { out, h: y - y0 }; };
const inL = list(dr.map(p => p.adapter || p.name), 26, colTop + 20, 34);
const outL = list(dn.map(p => p.adapter || p.name), 696, colTop + 20, 34);
const coreL = list([...dr.map(p => `entra: ${p.name}`), ...dn.map(p => `sale: ${p.name}`)], 356, colTop + 20, 36);
const domY = colTop + 20 + coreL.h + 10;
const bottom = Math.max(inL.h + colTop + 40, outL.h + colTop + 40, domY + 74);
const H = bottom + 8, bh = bottom - (colTop - 34) - 4;
const svg = `<svg viewBox="0 0 960 ${H}" role="img" aria-label="Diagrama hexagonal: adaptadores de entrada y salida dependen del núcleo, formado por aplicación y dominio">
<defs><marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="var(--ink2)"/></marker></defs>
<rect x="10" y="${colTop - 34}" width="270" height="${bh}" rx="6" class="box"/><text x="26" y="${colTop - 10}" class="h">Adaptadores de entrada</text>${inL.out}
<rect x="340" y="${colTop - 34}" width="280" height="${bh}" rx="6" class="box core"/><text x="356" y="${colTop - 10}" class="h">Aplicación (casos de uso y puertos)</text>${coreL.out}
<rect x="356" y="${domY}" width="248" height="62" rx="4" class="dom"/><text x="368" y="${domY + 24}" class="h">Dominio</text><text x="368" y="${domY + 44}" class="t mute">reglas y entidades puras</text>
<rect x="680" y="${colTop - 34}" width="270" height="${bh}" rx="6" class="box"/><text x="696" y="${colTop - 10}" class="h">Adaptadores de salida</text>${outL.out}
<line x1="280" y1="${H / 2}" x2="338" y2="${H / 2}" class="ln" marker-end="url(#ar)"/><line x1="680" y1="${H / 2}" x2="622" y2="${H / 2}" class="ln" marker-end="url(#ar)"/>
</svg>`;
const tree = Object.entries(cfg.layers).map(([n, l]) => `<tr><td><code>${esc(l.paths.join(', '))}</code></td><td>${esc(n)}</td><td>${esc(l.mayImport.filter(x => x !== n).join(', ') || 'nada')}</td></tr>`).join('');
const sec = (cfg.security || []).map(s => `<tr><td>${esc(s.layer)}</td><td>${esc(s.control)}</td></tr>`).join('') || '<tr><td colspan="2">(sin declarar)</td></tr>';
const css = `:root{--bg:#F7F7F4;--ink:#1D2A2A;--ink2:#55625F;--line:#C9D1CC;--accent:#1F6F5C;--panel:#FFFFFF;--warn:#8A5A00}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#101716;--ink:#E3ECE8;--ink2:#9DB0AA;--line:#2B3A37;--accent:#4FC3A5;--panel:#16201E;--warn:#E0A33A;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#101716;--ink:#E3ECE8;--ink2:#9DB0AA;--line:#2B3A37;--accent:#4FC3A5;--panel:#16201E;--warn:#E0A33A;color-scheme:dark}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,"Segoe UI",Roboto,sans-serif}
main{max-width:1000px;margin:0 auto;padding:24px 16px 48px;display:grid;gap:20px}
h1{font-size:24px;margin:0}h2{font-size:17px;margin:0 0 8px}p{margin:0;max-width:70ch}
.meta{color:var(--ink2)}.ok{color:var(--accent)}.no{color:var(--warn)}
section{min-width:0}.fig{overflow-x:auto;border:1px solid var(--line);border-radius:6px;background:var(--panel)}
.fig svg{display:block;min-width:720px;width:100%;height:auto}
.box{fill:var(--panel);stroke:var(--line)}.core{stroke:var(--accent)}.dom{fill:none;stroke:var(--accent);stroke-dasharray:4 3}
.h{fill:var(--ink);font:600 13px system-ui,sans-serif}.t{fill:var(--ink);font:13px system-ui,sans-serif}.mute{fill:var(--ink2)}.ln{stroke:var(--ink2);stroke-width:1.5}
.tw{overflow-x:auto}table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}th,td{text-align:left;padding:6px 10px;border-bottom:1px solid var(--line);vertical-align:top}th{font-weight:600}
code{font:13px ui-monospace,Consolas,monospace}`;
const body = `<main><header><h1>Arquitectura de ${esc(cfg.name || path.basename(cfg.dir))}</h1><p class="meta">Tipo ${esc(cfg.type || '—')}, lenguaje ${esc(cfg.language || '—')}. Las flechas indican quién depende de quién: todo apunta hacia el núcleo.</p>
<p class="${st.approved ? 'ok' : 'no'}">${st.approved ? 'Diseño aprobado.' : 'Sin aprobar: ' + esc(st.reason) + '. No se escribe código hasta que lo apruebes.'}</p></header>
<section><h2>Diagrama</h2><div class="fig">${svg}</div></section>
<section><h2>Capas y regla de dependencia</h2><div class="tw"><table><thead><tr><th>Carpeta</th><th>Capa</th><th>Puede importar de</th></tr></thead><tbody>${tree}</tbody></table></div></section>
<section><h2>Seguridad por capa</h2><div class="tw"><table><thead><tr><th>Capa</th><th>Control</th></tr></thead><tbody>${sec}</tbody></table></div></section>
<section><h2>Prohibido en el núcleo</h2><p>${esc((cfg.forbiddenInCore || []).join(', ') || '(sin lista)')}. Variables de entorno solo en: ${esc(cfg.envOnlyIn.join(', '))}.</p></section></main>`;
const title = `Arquitectura ${esc(cfg.name || path.basename(cfg.dir))}`;
const artifact = argv.includes('--artifact');
const html = artifact ? `<title>${title}</title>\n<style>${css}</style>\n${body}\n` : `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${css}</style></head><body>${body}</body></html>\n`;
const out = path.join(cfg.dir, 'docs', 'architecture', artifact ? 'preview.artifact.html' : 'preview.html');
fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, html);
console.log(`Vista previa: ${path.relative(process.cwd(), out)}`);
