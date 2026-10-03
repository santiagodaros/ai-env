// Utilidades compartidas de feature-close.
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: 'utf8', shell: process.platform === 'win32', ...opts });
const git = (root, args) => run('git', args, { cwd: root });
function repoRoot() {
  const r = run('git', ['rev-parse', '--show-toplevel']);
  if (r.status !== 0) { console.error('RECHAZADO: no estás dentro de un repo git.'); process.exit(1); }
  return r.stdout.trim();
}
// slug explícito, o inferido de la rama / carpeta contra docs/features/*
function resolveSlug(root, explicit) {
  const feats = path.join(root, 'docs', 'features');
  const dirs = fs.existsSync(feats) ? fs.readdirSync(feats, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name) : [];
  if (explicit) return dirs.includes(explicit) ? explicit : null;
  const branch = git(root, ['branch', '--show-current']).stdout.trim();
  const here = path.basename(root);
  const hits = dirs.filter(s => here === s || branch === s || branch.endsWith('/' + s) || branch.endsWith('-' + s));
  return hits.length === 1 ? hits[0] : null;
}
function baseRef(root, forced) {
  const ok = ref => git(root, ['rev-parse', '--verify', '-q', ref]).status === 0;
  if (forced) return ok(forced) ? forced : null;
  const head = git(root, ['symbolic-ref', '-q', 'refs/remotes/origin/HEAD']).stdout.trim().replace('refs/remotes/', '');
  return [head, 'origin/main', 'main', 'origin/master', 'master'].filter(Boolean).find(ok) || null;
}
module.exports = { run, git, repoRoot, resolveSlug, baseRef, fs, path };
