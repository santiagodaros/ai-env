// dev-flow 2.5: texto oculto (caracteres invisibles) en secscan y en el piso del carril rápido, alcance del ticket
// y "visto y no tocado" en la tarjeta, y el catálogo generado del README.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

module.exports = function hardening({ check }) {
  const ROOT = path.join(__dirname, '..');
  const DF = path.join(ROOT, 'plugins', 'dev-flow');
  const SC = path.join(DF, 'skills', 'security-diff', 'scripts', 'secscan.cjs');
  const risk = require(path.join(DF, 'skills', 'quick-fix', 'scripts', 'risk.cjs'));
  const tmp = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'aienv-hd-')));
  const git = (cwd, a) => spawnSync('git', a, { cwd, encoding: 'utf8' });
  const w = (d, f, t) => { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), t); };
  let n = 0;
  const repo = (files) => {
    const d = path.join(tmp, `r${n++}`); fs.mkdirSync(d);
    for (const a of [['init', '-q'], ['config', 'user.email', 't@example.com'], ['config', 'user.name', 't'], ['config', 'core.autocrlf', 'false']]) git(d, a);
    for (const [f, t] of Object.entries(files)) w(d, f, t);
    git(d, ['add', '-A']); git(d, ['commit', '-q', '-m', 'base']); git(d, ['branch', '-M', 'main']);
    return d;
  };
  const scan = (d) => { const r = spawnSync(process.execPath, [SC, '--range', 'HEAD~1..HEAD', '--json'], { cwd: d, encoding: 'utf8' }); let j = {}; try { j = JSON.parse(r.stdout); } catch { /* */ } return { code: r.status, j }; };

  // --- Texto oculto
  const d = repo({ 'src/a.js': 'const ok = 1;\n', 'docs/guia.md': '# Guía\n' });
  w(d, 'src/a.js', 'const ok = 1;\nconst isAdmin = user.role === "user‮ ⁦// admin⁩ ⁦";\n');
  w(d, 'docs/guia.md', '# Guía\nTexto normal.\u{E0049}\u{E0067}\u{E006E}\u{E006F}\u{E0072}\u{E0061}\n');
  w(d, 'src/b.js', 'const x = "a​b"; // secscan-allow\n');
  w(d, 'src/emoji.js', 'const familia = "👨‍👩‍👧";\n');
  git(d, ['add', '-A']); git(d, ['commit', '-q', '-m', 'oculto']);
  const s = scan(d);
  const hid = (s.j.high || []).filter((f) => f.id === 'S013');
  check('secscan: controles bidi (Trojan Source) en código son hallazgo alto S013 y frenan (exit 3)', s.code === 3 && hid.some((f) => f.file === 'src/a.js' && /U\+202E/.test(f.msg)), JSON.stringify(s.j.high));
  check('secscan: Unicode Tags escondidos en un Markdown también se marcan', hid.some((f) => f.file === 'docs/guia.md' && /U\+E00/.test(f.msg)));
  check('secscan: "secscan-allow" no excluye caracteres invisibles', hid.some((f) => f.file === 'src/b.js'));
  check('secscan: ZWJ de un emoji no es texto oculto', !hid.some((f) => f.file === 'src/emoji.js'));

  const diff = git(d, ['diff', '--unified=0', 'HEAD~1..HEAD']).stdout;
  const rs = risk.contentRisks(diff, (f) => /^docs\//.test(f));
  check('quick-fix: texto oculto saca del carril aunque esté en docs o pruebas', rs.some((x) => x.id === 'hidden' && x.file === 'docs/guia.md') && rs.some((x) => x.id === 'hidden' && x.file === 'src/a.js'), JSON.stringify(rs.map((x) => [x.id, x.file])));
  check('quick-fix: el texto del hallazgo muestra el escape, no el carácter invisible', rs.filter((x) => x.id === 'hidden').every((x) => !risk.HIDDEN.test(x.text)));

  // --- Alcance del ticket y "visto y no tocado"
  const CARD = path.join(DF, 'skills', 'dispatch', 'scripts', 'card.cjs');
  const card = require(CARD);
  const long = Array.from({ length: 30 }, (_, i) => `function f${i}() {\n  return ${i};\n}`).join('\n') + '\n';
  const r = repo({ 'src/calc.js': 'exports.suma = (a, b) => a + b;\n', 'src/otro.js': long, 'test/calc.test.js': '// pruebas\n' });
  git(r, ['checkout', '-q', '-b', 'feat/1-resta']);
  w(r, 'src/calc.js', 'exports.suma = (a, b) => a + b;\nexports.resta = (a, b) => a - b;\n');
  w(r, 'src/otro.js', long.replace(/^ {2}/gm, '    '));
  w(r, 'docs/tickets/1.md', '# #1\n');
  git(r, ['add', '-A']); git(r, ['commit', '-q', '-m', 'resta']);
  const base = { ticket: 1, branch: 'feat/1-resta', summary: 'Agrega resta a la calculadora con su prueba.', files_changed: ['src/calc.js', 'src/otro.js', 'docs/tickets/1.md'], commands: [{ cmd: 'npm test', exit: 0 }], tests: { command: 'npm test', passed: true, added: ['test/calc.test.js'], fail_without_change: 'si' }, acceptance: [{ criterion: 'resta(5,2) = 3', status: 'cumple', evidence: 'test/calc.test.js:3' }], blind_spots: ['No probé con números grandes.'] };
  const cf = path.join(tmp, 'card.json');
  const verify = (c, scope) => { fs.writeFileSync(cf, JSON.stringify(c)); const x = spawnSync(process.execPath, [CARD, 'verify', cf, '--base', 'main', '--scope', scope], { cwd: r, encoding: 'utf8' }); return { code: x.status, out: x.stdout + x.stderr }; };
  let v = verify(base, 'src/calc.js,test/calc.test.js');
  check('card verify --scope: un archivo fuera del Alcance sin justificar es contradicción (exit 1); docs/tickets no cuenta', v.code === 1 && /fuera del Alcance[^\n]*src\/otro\.js/.test(v.out) && !/fuera del Alcance[^\n]*docs\/tickets/.test(v.out), v.out);
  check('card verify: cambios de solo formato (sangría) se marcan con el conteo de líneas', /solo formato[^\n]*src\/otro\.js \(\d+ de \d+ líneas\)/.test(v.out), v.out);
  v = verify({ ...base, scope_extensions: [{ file: 'src/otro.js', reason: 'el ticket pide normalizar la sangría de este módulo' }] }, 'src/calc.js,test/calc.test.js');
  check('card verify: con scope_extensions (archivo y motivo) el mismo cambio pasa', v.code === 0, v.out);
  check('card verify: una carpeta o carpeta/** en el Alcance cubre lo de adentro', card.outOfScope(['src/a/b.js', 'lib/x.js'], ['src/**'], {}).join() === 'lib/x.js' && card.outOfScope(['src/a/b.js'], ['src/'], {}).length === 0);
  check('card: el Alcance sale de la sección "## Alcance" del issue', card.scopeFromBody('# T\n\n## Alcance\n\n- `src/calc.js`\n- test/calc.test.js\n\n## Fuera de alcance\n\n- `src/x.js`\n').join() === 'src/calc.js,test/calc.test.js');
  const withNoticed = { ...base, files_changed: ['src/calc.js'], noticed_out_of_scope: [{ where: 'src/otro.js:3', what: 'la función no valida la entrada' }] };
  check('card: noticed_out_of_scope es válido en el esquema y aparece al renderizar', card.validate(withNoticed).length === 0 && /Visto y no tocado[\s\S]*src\/otro\.js:3/.test(card.render(withNoticed)));
  check('card: scope_extensions sin motivo no valida', card.validate({ ...base, scope_extensions: [{ file: 'x', reason: 'corto' }] }).some((e) => /reason/.test(e)));

  // --- Catálogo: el README cuenta lo que hay
  const catalog = require(path.join(ROOT, 'scripts', 'catalog.cjs'));
  const cat = catalog.collect();
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  check('catálogo: el README coincide con los conteos de skills, subagentes, hooks y perfiles', catalog.checks(cat, readme).length === 0, JSON.stringify(catalog.checks(cat, readme)));
  const wrong = readme.replace(/(\| \[`dev-flow`\][^\n]*?)(\d+) skills/, (m, a, n) => `${a}${Number(n) + 3} skills`).replace(/(\d+) de las (\d+) skills son manuales/, '1 de las $2 skills son manuales');
  const cd = catalog.checks(cat, wrong);
  check('catálogo: un conteo viejo en el README se detecta con el valor correcto', cd.some((x) => /dev-flow: skills/.test(x.what) && x.want === cat.plugins['dev-flow'].skills)&& cd.some((x) => /manuales/.test(x.what) && x.want === cat.manual));
  const lim = catalog.limits(cat);
  check(`catálogo: descripciones de skills automáticas dentro del tope (${lim.tot} de ${catalog.LIMITS.autoTotal} caracteres; ninguna de más de ${catalog.LIMITS.descMax})`, lim.out.length === 0, lim.out.join('; '));
  const big = { ...cat, auto: [...cat.auto, { name: 'x', description: 'a'.repeat(catalog.LIMITS.descMax + 1) }] };
  check('catálogo: una descripción por encima del tope falla', catalog.limits(big).out.some((x) => /descripción de x/.test(x)));

  module.exports.tmp = tmp;
  return { tmp, repo, git, w };
};
