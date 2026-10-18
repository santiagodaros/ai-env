// idea-lab: de una idea a una idea definida (idea.cjs) y de ahí a un plan con PRD (plan.cjs). Reglas fijas: ángulos,
// fuentes, frescura del mercado, términos privados, decisión de la persona, rebanadas, hitos, dependencias y el PRD
// en el formato de /dev-flow:prd.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

module.exports = function ideaLab({ check }) {
  const ROOT = path.join(__dirname, '..');
  const IL = path.join(ROOT, 'plugins', 'idea-lab');
  const I = path.join(IL, 'skills', 'shape', 'scripts', 'idea.cjs');
  const P = path.join(IL, 'skills', 'plan', 'scripts', 'plan.cjs');
  const PRD = path.join(ROOT, 'plugins', 'dev-flow', 'skills', 'prd', 'scripts', 'prd.cjs');
  const tmp = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'aienv-il-')));
  spawnSync('git', ['init', '-q'], { cwd: tmp });
  const run = (s, args) => { const r = spawnSync(process.execPath, [s, ...args], { cwd: tmp, encoding: 'utf8' }); return { code: r.status, out: `${r.stdout}${r.stderr}` }; };
  const F = (slug) => path.join(tmp, 'docs', 'ideas', slug, 'idea.json');
  const today = new Date().toISOString().slice(0, 10);

  let r = run(I, ['new', 'Radar de retiros de Azure']);
  const slug = 'radar-de-retiros-de-azure';
  check('idea-lab: new crea docs/ideas/<slug>/idea.json con el slug del título', r.code === 0 && fs.existsSync(F(slug)), r.out);
  check('idea-lab: new no pisa una idea existente', run(I, ['new', 'Radar de retiros de Azure']).code === 1);
  r = run(I, ['check', slug]);
  check('idea-lab: una idea vacía está INCOMPLETA y lista lo que falta por ángulo (exit 1)', r.code === 1 && /INCOMPLETA: \d+ de 16/.test(r.out) && /Mercado/.test(r.out) && /Pre-mortem/.test(r.out), r.out.slice(0, 200));
  check('idea-lab: avanzar se rechaza mientras la idea está incompleta', run(I, ['decide', slug, 'avanzar', '--reason', 'me gusta mucho la idea']).code === 1);
  check('idea-lab: plan se rechaza sin la decisión avanzar', /no tiene la decisión "avanzar"/.test(run(P, ['new', slug]).out));

  const full = {
    ...JSON.parse(fs.readFileSync(F(slug), 'utf8')),
    pitch: 'Un aviso semanal de qué servicios de Azure se retiran y a qué recursos propios afecta.',
    problem: { statement: 'Los equipos se enteran tarde de los retiros de servicios de Azure y migran a las apuradas.', who: 'Equipos de infraestructura de empresas medianas', jtbd: 'Cuando Microsoft anuncia un retiro, quiero saber si me afecta, para planificar la migración con tiempo', current_alternative: 'Leer Azure Updates a mano y revisar Advisor cada tanto', pain_evidence: [{ claim: 'Advisor muestra recursos afectados por retiros', source: 'https://learn.microsoft.com/azure/advisor/advisor-overview' }, { claim: 'Dos migraciones de último momento el último año', source: 'experiencia propia: equipo de infraestructura' }] },
    users: [{ segment: 'Líder de infraestructura', need: 'Lista priorizada de retiros que lo afectan' }],
    value: { proposition: 'Saber cada lunes qué retiros te afectan y cuánto tiempo queda', differentiation: 'Cruza el anuncio con tu inventario real, cosa que Azure Updates no hace' },
    market: { checked_at: today, verdict: 'nicho', unavailable_reason: '', competitors: [{ name: 'Azure Advisor', url: 'https://learn.microsoft.com/azure/advisor/', what: 'Recomendaciones, incluye retiros', price: 'incluido', gap: 'No prioriza ni avisa por correo con contexto' }], alternatives: [{ name: 'Leer Azure Updates', kind: 'status-quo', what: 'Revisión manual del feed', gap: 'Depende de que alguien se acuerde' }, { name: 'Script propio con Resource Graph', kind: 'diy', what: 'Consulta de recursos afectados', gap: 'No mantiene la lista de retiros' }], demand_signals: [{ claim: 'Hilos de quejas por retiros no anunciados con tiempo', url: 'https://techcommunity.microsoft.com/', date: today }] },
    business: { model: 'Herramienta interna', pricing_hypothesis: '', cost_benefit: 'Una tarde de configuración contra semanas de migración apurada', channels: ['interno'] },
    feasibility: { approach: 'Tarea programada que lee el feed de retiros y cruza con Resource Graph', unknowns: ['Si el feed trae el tipo de recurso de forma consistente'], dependencies: ['Resource Graph'] },
    risks: [{ risk: 'El feed cambia de formato', kind: 'tecnico', mitigation: 'Prueba diaria que avisa si no parsea' }, { risk: 'Nadie lee el aviso', kind: 'adopcion', mitigation: 'Una sola línea por retiro con fecha' }, { risk: 'Permisos de lectura en todas las suscripciones', kind: 'seguridad', mitigation: 'Rol Reader por grupo de administración' }],
    premortem: ['El aviso llegó con tantos retiros irrelevantes que lo ignoraron', 'El feed dejó de publicarse y nadie se dio cuenta', 'No tenía permisos de lectura en la mitad de las suscripciones'],
    metrics: { north_star: 'retiros detectados con más de 90 días de anticipación', leading: ['avisos abiertos'], success_criteria: '90 % de los retiros que afectan detectados con 90 días o más, en 3 meses' },
    mvp: { appetite: '2 semanas', in: ['Aviso semanal por correo'], out: ['Panel web', 'Remediación automática'] },
    assumptions: [{ text: 'El feed trae el tipo de recurso', test: 'Parsear 50 anuncios', status: 'sin-probar' }, { text: 'Resource Graph cubre todos los tipos', test: 'Probar con 5 retiros recientes', status: 'sin-probar' }, { text: 'El equipo lee correos semanales', test: 'Medir aperturas un mes', status: 'confirmada' }],
    kill_criteria: ['Si en 2 meses no detectó ningún retiro que no supiéramos ya'],
    open_questions: [{ q: '¿Hace falta Teams además del correo?', blocking: false }],
    skeptic: { objections: [{ objection: 'Advisor ya lo muestra', severity: 'alta', answer: 'Advisor no avisa ni prioriza por fecha; el aviso cruza y ordena' }, { objection: 'El feed no es una API estable', severity: 'media' }, { objection: 'Poco valor si hay pocas suscripciones', severity: 'baja' }] },
    prfaq: { headline: 'Los retiros de Azure ya no te toman por sorpresa', subheadline: 'Cada lunes, qué te afecta y cuánto queda', problem: 'Hoy los retiros se descubren cuando falta poco y la migración se hace a las apuradas.', solution: 'Un aviso que cruza los anuncios de retiro con tus recursos y los ordena por fecha.', customer_quote: 'Por primera vez planificamos una migración con un trimestre de margen.', how_to_start: 'Un rol Reader y una tarea programada', faq_external: [{ q: '¿Qué permisos necesita?', a: 'Solo lectura' }, { q: '¿Cada cuánto llega?', a: 'Cada lunes' }, { q: '¿Qué pasa si no me afecta nada?', a: 'Llega una línea diciendo que no hay retiros' }], faq_internal: [{ q: '¿Cuánto cuesta?', a: 'Una tarea programada y consultas de Resource Graph sin costo' }, { q: '¿Por qué ahora?', a: 'Este año hubo dos migraciones apuradas' }, { q: '¿Qué riesgo tiene?', a: 'Permisos de lectura amplios' }] },
  };
  const put = (o) => fs.writeFileSync(F(slug), JSON.stringify(o, null, 2));
  put(full);
  r = run(I, ['check', slug]);
  check('idea-lab: con los 16 ángulos cubiertos la idea está DEFINIDA (exit 0)', r.code === 0 && /DEFINIDA: 16 de 16/.test(r.out), r.out.slice(0, 600));
  const lens = (o) => JSON.parse(run(I, ['check', slug, '--json']).out || '{}').lenses?.find((l) => l.id === o) || {};
  put({ ...full, problem: { ...full.problem, pain_evidence: [{ claim: 'A todos les pasa', source: '' }] } });
  check('idea-lab: una evidencia sin fuente no cuenta y pide pasarla a supuestos', lens('evidencia').ok === false && /pasala a supuestos/.test((lens('evidencia').missing || []).join()));
  put({ ...full, market: { ...full.market, checked_at: '2020-01-01' } });
  check('idea-lab: un mercado relevado hace más de 30 días no vale', lens('mercado').ok === false && /checked_at/.test((lens('mercado').missing || []).join()));
  put({ ...full, market: { verdict: 'sin-datos', unavailable_reason: 'sin herramientas web en esta sesión', competitors: [], alternatives: [], demand_signals: [] } });
  check('idea-lab: sin herramientas web, sin-datos con motivo es válido (no se inventa mercado)', lens('mercado').ok === true);
  put({ ...full, skeptic: { objections: full.skeptic.objections.map((o) => ({ ...o, answer: undefined })) } });
  check('idea-lab: una objeción alta sin respuesta deja la idea incompleta', lens('escéptico').ok === false);
  put({ ...full, open_questions: [{ q: '¿Lo aprueba seguridad?', blocking: true }] });
  check('idea-lab: una pregunta abierta que bloquea deja la idea incompleta', lens('preguntas').ok === false);
  fs.writeFileSync(path.join(tmp, '.private-terms'), 'Advisor\n');
  put(full);
  check('idea-lab: un término de .private-terms en el expediente lo frena', lens('privado').ok === false);
  fs.rmSync(path.join(tmp, '.private-terms'));

  put({ ...full, pitch: 'Aviso <script>alert(1)</script> & más' });
  r = run(I, ['render', slug]);
  const html = fs.readFileSync(path.join(tmp, 'docs', 'ideas', slug, 'preview.html'), 'utf8');
  check('idea-lab: render deja IDEA.md y preview.html', r.code === 0 && fs.existsSync(path.join(tmp, 'docs', 'ideas', slug, 'IDEA.md')) && /Si existiera hoy/.test(html));
  check('idea-lab: preview.html escapa lo que viene del JSON y no carga nada de afuera', !html.includes('<script>alert') && html.includes('&lt;script&gt;') && !/<(script|link)[^>]+(src|href)=/.test(html));
  put(full);
  check('idea-lab: decide pide un motivo', run(I, ['decide', slug, 'avanzar']).code === 1);
  r = run(I, ['decide', slug, 'avanzar', '--reason', 'el escéptico no encontró nada que la frene']);
  check('idea-lab: avanzar con la idea definida queda registrado y apunta al plan', r.code === 0 && /idea-lab:plan/.test(r.out) && JSON.parse(fs.readFileSync(F(slug), 'utf8')).status === 'definida');
  check('idea-lab: status muestra una línea por idea', /radar-de-retiros-de-azure\s+definida\s+16\/16/.test(run(I, ['status']).out));

  // --- Plan
  r = run(P, ['new', slug]);
  const pf = path.join(tmp, 'docs', 'ideas', slug, 'plan.json');
  check('plan: new arma el esqueleto desde la idea (alcance, riesgos, supuestos sin probar)', r.code === 0 && /2 supuesto\(s\) sin probar/.test(r.out) && JSON.parse(fs.readFileSync(pf, 'utf8')).scope_out.includes('Panel web'), r.out);
  r = run(P, ['check', slug]);
  check('plan: el esqueleto está INCOMPLETO (rebanadas, hitos, validaciones)', r.code === 1 && /slices/.test(r.out) && /supuesto sin probar sin plan/.test(r.out), r.out.slice(0, 300));
  const sk = JSON.parse(fs.readFileSync(pf, 'utf8'));
  const plan = {
    ...sk,
    outcome: '90 % de los retiros que afectan detectados con 90 días o más',
    no_gos: ['Remediar recursos automáticamente'],
    rabbit_holes: [{ risk: 'Parsear HTML del feed', decision: 'Usar el feed RSS y fallar visible si cambia' }],
    validation_first: [{ assumption: 'El feed trae el tipo de recurso', experiment: 'Parsear 50 anuncios del feed', cost: '1 tarde', success: '45 de 50 con tipo identificable' }],
    accepted_assumptions: [{ assumption: 'Resource Graph cubre todos los tipos', reason: 'Lo que no cubra se lista como no verificado en el aviso' }],
    slices: [
      { id: 'F-01', title: 'Lista de retiros desde el feed', why: 'Ver los retiros publicados en un solo lugar', criteria: ['Lee el feed y lista retiros con fecha'], size: 'S', depends_on: [] },
      { id: 'F-02', title: 'Cruce con recursos propios', why: 'Saber cuáles me afectan', criteria: ['Por retiro, los recursos afectados de Resource Graph'], size: 'M', depends_on: ['F-01'] },
      { id: 'F-03', title: 'Aviso semanal por correo', why: 'Enterarse sin entrar a ningún lado', criteria: ['El lunes llega un correo ordenado por fecha de retiro'], size: 'S', depends_on: ['F-02'] },
    ],
    milestones: [{ id: 'M1', goal: 'Primer aviso real, aunque sea feo', slices: ['F-01', 'F-02', 'F-03'], exit_criteria: 'El equipo recibe un correo con los retiros que lo afectan', user_visible: true }],
    metrics_instrumentation: [{ metric: 'retiros detectados con más de 90 días de anticipación', event: 'registro por retiro con días restantes al detectarlo', where: 'log de la tarea' }],
    rollout: { strategy: 'Piloto con una suscripción y después todas', rollback: 'Desactivar la tarea programada' },
    decisions_pending: [{ decision: 'Dónde corre la tarea', options: ['Azure Functions', 'GitHub Actions'] }],
  };
  fs.writeFileSync(pf, JSON.stringify(plan, null, 2));
  r = run(P, ['check', slug]);
  check('plan: un plan completo está LISTO', r.code === 0 && /LISTO/.test(r.out), r.out.slice(0, 600));
  const pcheck = (o) => { fs.writeFileSync(pf, JSON.stringify(o)); const x = run(P, ['check', slug]); fs.writeFileSync(pf, JSON.stringify(plan)); return x; };
  check('plan: dependencias en ciclo se detectan', /ciclo: F-01 → F-02 → F-01|ciclo: F-02 → F-01 → F-02/.test(pcheck({ ...plan, slices: plan.slices.map((s) => (s.id === 'F-01' ? { ...s, depends_on: ['F-02'] } : s)) }).out));
  check('plan: una rebanada en dos hitos o en ninguno se rechaza', /F-03: tiene que estar en exactamente un hito/.test(pcheck({ ...plan, milestones: [{ ...plan.milestones[0], slices: ['F-01', 'F-02'] }] }).out));
  check('plan: un hito que no entrega algo usable se rechaza', /user_visible: true/.test(pcheck({ ...plan, milestones: [{ ...plan.milestones[0], user_visible: false }] }).out));
  check('plan: sin instrumentar la métrica estrella no está listo', /falta la métrica estrella/.test(pcheck({ ...plan, metrics_instrumentation: [{ metric: 'otra', event: 'algo' }] }).out));
  check('plan: más de 7 criterios en una rebanada pide partirla', /partila/.test(pcheck({ ...plan, slices: plan.slices.map((s, k) => (k === 0 ? { ...s, criteria: Array.from({ length: 8 }, (_, n) => `criterio número ${n}`) } : s)) }).out));
  // Hallado en la prueba real (headless): el modelo citó el hito H-01 en un no_go y el PRD generado no pasaba prd check.
  check('plan: el texto que va al PRD no puede citar un hito (H-01) ni ids que el PRD no tiene', /cita H-01, que no es una sección del PRD/.test(pcheck({ ...plan, no_gos: ['Empezar H-01 antes de las entrevistas'] }).out) && !/cita/.test(pcheck({ ...plan, no_gos: ['Nada fuera de F-01 hasta validar (ver ADR-0002)'] }).out));
  r = run(P, ['render', slug]);
  const prdF = path.join(tmp, 'docs', 'PRD.md');
  check('plan: render escribe PLAN.md y docs/PRD.md', r.code === 0 && fs.existsSync(path.join(tmp, 'docs', 'ideas', slug, 'PLAN.md')) && fs.existsSync(prdF), r.out);
  const pc = spawnSync(process.execPath, [PRD, 'check', '--prd', 'docs/PRD.md'], { cwd: tmp, encoding: 'utf8' });
  check('plan: el PRD generado pasa /dev-flow:prd check', pc.status === 0, `${pc.stdout}${pc.stderr}`.slice(0, 300));
  const sl = spawnSync(process.execPath, [PRD, 'slice', 'F-02', '--prd', 'docs/PRD.md', '--json'], { cwd: tmp, encoding: 'utf8' });
  let sj = {}; try { sj = JSON.parse(sl.stdout); } catch { /* */ }
  check('plan: la rebanada F-02 del PRD trae su dependencia, su tamaño y las globales', JSON.stringify(sj.deps) === '["F-01"]' && sj.size === 'M' && (sj.globals || []).includes('G-01'), sl.stdout.slice(0, 300));
  fs.writeFileSync(prdF, '# PRD propio\n');
  r = run(P, ['render', slug]);
  check('plan: con un docs/PRD.md existente no lo pisa: escribe PRD.draft.md', /PRD\.draft\.md/.test(r.out) && fs.readFileSync(prdF, 'utf8') === '# PRD propio\n' && fs.existsSync(path.join(tmp, 'docs', 'ideas', slug, 'PRD.draft.md')));

  // --- Contrato de los subagentes y skills
  const fm = (f) => (fs.readFileSync(f, 'utf8').match(/^---\n([\s\S]*?)\n---/) || [])[1] || '';
  check('idea-lab: scout no tiene Bash ni edición; skeptic no puede escribir', /disallowedTools:[^\n]*Bash/.test(fm(path.join(IL, 'agents', 'scout.md'))) && /disallowedTools:[^\n]*Write/.test(fm(path.join(IL, 'agents', 'skeptic.md'))));
  check('idea-lab: las dos skills son manuales (no cargan descripción en cada sesión)', ['shape', 'plan'].every((s) => /disable-model-invocation: true/.test(fm(path.join(IL, 'skills', s, 'SKILL.md')))));

  fs.rmSync(tmp, { recursive: true, force: true });
};
