// Configuración del repo para dev-flow: .claude/dev-flow.json (versionado). Todo tiene valor por defecto.
// Compatibilidad: si existe .claude/feature-flow.json (versión anterior), sus topes se leen como "launch".
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULTS = {
  prd: 'docs/PRD.md',
  state: 'docs/STATE.md',
  branchPrefix: { feat: 'feat/', fix: 'fix/' },
  worktrees: { root: null, include: '.worktreeinclude' }, // null = comportamiento nativo (<repo>/.claude/worktrees)
  launch: { maxConcurrent: 2, maxPerDay: 3, cooldownMinutes: 10 }, // conservador; el flujo Tech Lead lo sube en .claude/dev-flow.json (techo en lib/launch-guard.cjs)
  workers: { mode: 'headless', permissionMode: 'auto', maxTurns: 80, allowedTools: ['Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash(git *)', 'Bash(gh issue *)', 'Bash(gh pr *)', 'Bash(npm *)', 'Bash(pnpm *)', 'Bash(yarn *)', 'Bash(npx *)', 'Bash(node *)', 'Bash(python *)', 'Bash(pytest *)', 'Bash(dotnet *)', 'Bash(terraform fmt *)', 'Bash(terraform validate *)', 'Bash(terraform plan *)', 'PowerShell'] },
  testCommand: null, // null = el script "test" de package.json
  labels: { ready: 'estado:listo', doing: 'estado:en-curso', review: 'estado:en-revision', blocked: 'estado:bloqueado' },
};

function readJson(f) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } }

function merge(a, b) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b || {})) out[k] = v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' ? merge(a[k], v) : v;
  return out;
}

function expandHome(p) { return p ? p.replace(/^~(?=$|[\\/])/, os.homedir()) : p; }

function load(root) {
  const own = readJson(path.join(root, '.claude', 'dev-flow.json')) || {};
  const legacy = readJson(path.join(root, '.claude', 'feature-flow.json'));
  let cfg = merge(DEFAULTS, legacy ? { launch: legacy } : {});
  cfg = merge(cfg, own);
  cfg._file = fs.existsSync(path.join(root, '.claude', 'dev-flow.json')) ? '.claude/dev-flow.json' : null;
  return cfg;
}

// Raíz del repo desde un directorio (sin git: el propio directorio).
function repoRoot(dir) {
  let d = path.resolve(dir || process.cwd());
  for (;;) {
    if (fs.existsSync(path.join(d, '.git'))) return d;
    const up = path.dirname(d);
    if (up === d) return path.resolve(dir || process.cwd());
    d = up;
  }
}

module.exports = { load, repoRoot, expandHome, DEFAULTS };
