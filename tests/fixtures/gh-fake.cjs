#!/usr/bin/env node
// GitHub CLI falso para las pruebas: guarda issues y PRs en el JSON de FAKE_GH_STATE y registra cada llamada.
'use strict';
const fs = require('fs');
const file = process.env.FAKE_GH_STATE;
const st = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { issues: [], prs: [], calls: [], labels: [] };
const a = process.argv.slice(2);
st.calls.push(a);
const save = () => fs.writeFileSync(file, JSON.stringify(st, null, 2));
const opt = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : undefined; };
const all = (k) => a.flatMap((x, i) => (x === k ? [a[i + 1]] : []));
const out = (x) => { save(); process.stdout.write(typeof x === 'string' ? x + '\n' : JSON.stringify(x)); process.exit(0); };
const lab = (i) => i.labels.map((n) => ({ name: n }));
const view = (i) => ({ number: i.number, title: i.title, body: i.body, state: i.state, url: `https://github.com/o/r/issues/${i.number}`, labels: lab(i), assignees: i.assignees.map((l) => ({ login: l })), closedAt: i.closedAt || null });

if (a[0] === 'label' && a[1] === 'create') { if (!st.labels.includes(a[2])) st.labels.push(a[2]); out(''); }
if (a[0] === 'issue' && a[1] === 'create') {
  const n = st.issues.length + st.prs.length + 1;
  st.issues.push({ number: n, title: opt('--title'), body: fs.readFileSync(opt('--body-file'), 'utf8'), labels: all('--label'), state: 'OPEN', assignees: [] });
  out(`https://github.com/o/r/issues/${n}`);
}
if (a[0] === 'issue' && a[1] === 'list') {
  let l = st.issues;
  const s = opt('--state') || 'open';
  if (s !== 'all') l = l.filter((i) => i.state === s.toUpperCase());
  for (const x of all('--label')) l = l.filter((i) => i.labels.includes(x));
  out(l.map(view));
}
if (a[0] === 'issue' && a[1] === 'view') { const i = st.issues.find((x) => x.number === Number(a[2])); if (!i) { process.stderr.write('not found'); process.exit(1); } out(view(i)); }
if (a[0] === 'issue' && a[1] === 'edit') {
  const i = st.issues.find((x) => x.number === Number(a[2]));
  for (const x of all('--add-label')) if (!i.labels.includes(x)) i.labels.push(x);
  for (const x of all('--remove-label')) i.labels = i.labels.filter((y) => y !== x);
  for (const x of all('--add-assignee')) i.assignees.push(x === '@me' ? 'yo' : x);
  out('');
}
if (a[0] === 'issue' && a[1] === 'develop') out('');
if (a[0] === 'pr' && a[1] === 'create') {
  const n = st.issues.length + st.prs.length + 1;
  st.prs.push({ number: n, title: opt('--title'), body: fs.readFileSync(opt('--body-file'), 'utf8'), headRefName: process.env.FAKE_GH_BRANCH || 'feat/1-x', state: 'OPEN', isDraft: a.includes('--draft'), statusCheckRollup: [{ conclusion: 'SUCCESS' }] });
  out(`https://github.com/o/r/pull/${n}`);
}
if (a[0] === 'pr' && a[1] === 'list') {
  const s = (opt('--state') || 'open').toUpperCase();
  out(st.prs.filter((p) => p.state === s).map((p) => ({ ...p, reviewDecision: p.reviewDecision || '', mergedAt: p.mergedAt || null })));
}
if (a[0] === 'pr' && a[1] === 'view') { const p = st.prs.find((x) => x.number === Number(a[2])); out({ ...p, baseRefName: 'main', files: [] }); }
if (a[0] === 'pr' && a[1] === 'diff') out(process.env.FAKE_GH_DIFF || '');
if (a[0] === 'pr' && a[1] === 'checks') out('build\tpass\t1m\thttps://x');
if (a[0] === 'pr' && a[1] === 'comment') out('');
process.stderr.write(`gh-fake: comando no soportado: ${a.join(' ')}`);
save();
process.exit(1);
