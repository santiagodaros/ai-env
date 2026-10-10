#!/usr/bin/env node
// WorktreeCreate / WorktreeRemove: worktrees efímeros fuera del repo y limpieza segura (también en Windows).
// Uso como hook:  node worktree.cjs create   |   node worktree.cjs remove
// Uso manual:     node worktree.cjs gc [--apply] [--all] [--include-empty] [--dir <repo>]   (worktrees de tickets ya mergeados)
//                 node worktree.cjs remove-path <ruta>                (cierra procesos y borra un worktree)
//
// Dónde se crean: worktrees.root de .claude/dev-flow.json (o de ~/.claude/ai-env/worktrees.json), en <root>/<repo>/<nombre>.
// Sin configuración: igual que Claude Code, <repo>/.claude/worktrees/<nombre>.
// Rama: nombres de ticket "feat-12-algo" / "fix-…" / "docs-…" → feat/12-algo, fix/…, docs/…; "#123" o "pr-123" → el PR;
// el resto, worktree-<nombre> (como Claude Code).
// Es idempotente: si el worktree ya existe para ese nombre, devuelve la misma ruta (un mismo hook registrado en el
// plugin y en settings no crea dos). Al borrar, cierra SOLO los procesos cuya línea de comando o directorio está dentro
// del worktree (nunca "todos los node": eso mataría a Claude Code), reintenta ante EPERM y poda.
// Este hook no se apaga con AI_ENV_HOOKS: si no imprime una ruta, Claude Code no puede crear el worktree.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const config = require('../lib/config.cjs');

const mode = process.argv[2];
const git = (cwd, a, timeout = 60000) => spawnSync('git', a, { cwd, encoding: 'utf8', timeout, windowsHide: true });
const err = (m) => process.stderr.write(`ai-env worktree: ${m}\n`);
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function mainRoot(cwd) {
  const c = git(cwd, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  if (c.status !== 0) return null;
  const common = real(c.stdout.trim());
  return path.basename(common) === '.git' ? path.dirname(common) : real(config.repoRoot(cwd));
}

function userWorktreeCfg() {
  try { return JSON.parse(fs.readFileSync(path.join(process.env.AI_ENV_HOME || os.homedir(), '.claude', 'ai-env', 'worktrees.json'), 'utf8')); } catch { return {}; }
}

function plan(root, rawName) {
  const cfg = config.load(root);
  const user = userWorktreeCfg();
  const rootCfg = (cfg._file && cfg.worktrees && cfg.worktrees.root) || user.root || null;
  let name = String(rawName || '').trim();
  let pr = null;
  const m = name.match(/^#?(\d+)$/) || name.match(/^pr-(\d+)$/);
  if (m) { pr = Number(m[1]); name = `pr-${pr}`; }
  name = name.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || `wt-${Date.now()}`;
  const base = rootCfg ? path.join(config.expandHome(rootCfg), path.basename(root)) : path.join(root, '.claude', 'worktrees');
  const t = name.match(/^(feat|fix|docs|chore)-(\d+)-(.+)$/);
  const branch = pr ? `pr-${pr}` : t ? `${cfg.branchPrefix[t[1]] || t[1] + '/'}${t[2]}-${t[3]}` : `worktree-${name}`;
  return { name, dest: path.join(base, name), branch, pr, cfg, baseMode: (cfg.worktrees && cfg.worktrees.base) || user.base || 'fresh' };
}

function registered(root) {
  const out = git(root, ['worktree', 'list', '--porcelain']).stdout;
  return out.split('\n').filter((l) => l.startsWith('worktree ')).map((l) => path.resolve(l.slice(9).trim()));
}
// En Windows una misma carpeta puede llegar como ruta corta 8.3 (RUNNER~1) o larga: se comparan resueltas.
const real = (p) => { try { return fs.realpathSync.native(p); } catch { return path.resolve(p); } };
const samePath = (a, b) => (process.platform === 'win32' ? real(a).toLowerCase() === real(b).toLowerCase() : real(a) === real(b));

function baseRef(root, mode) {
  if (mode === 'head') return 'HEAD';
  const sym = git(root, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']);
  const def = sym.status === 0 ? sym.stdout.trim() : null; // origin/main
  if (!def) return 'HEAD';
  git(root, ['fetch', '--quiet', 'origin', def.replace(/^origin\//, '')], 20000); // sin red: usa lo último conocido
  return git(root, ['rev-parse', '--verify', '--quiet', def]).status === 0 ? def : 'HEAD';
}

function copyIncluded(root, dest, includeFile) {
  const f = path.join(root, includeFile || '.worktreeinclude');
  if (!fs.existsSync(f)) return 0;
  const list = git(root, ['ls-files', '--others', '--ignored', `--exclude-from=${f}`]).stdout.split('\n').filter(Boolean);
  let n = 0;
  for (const rel of list.slice(0, 2000)) {
    const src = path.join(root, rel), dst = path.join(dest, rel);
    try { if (fs.statSync(src).isFile()) { fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(src, dst); n++; } } catch { /* archivo en uso */ }
  }
  if (list.length > 2000) err(`.worktreeinclude coincide con ${list.length} archivos: copié los primeros 2000`);
  return n;
}

function create(input) {
  const cwd = input.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const root = mainRoot(cwd);
  if (!root) throw new Error(`${cwd} no es un repo git`);
  const p = plan(root, input.name || input.worktree_name);
  if (registered(root).some((w) => samePath(w, p.dest)) && fs.existsSync(p.dest)) return p.dest; // ya existe: misma ruta
  fs.mkdirSync(path.dirname(p.dest), { recursive: true });
  // Si el worktree queda dentro del repo, que git no lo vea (un `git add -A` lo commitearía como repo embebido).
  if (real(p.dest).startsWith(real(root) + path.sep)) {
    try {
      const ex = path.join(root, '.git', 'info', 'exclude');
      const cur = fs.existsSync(ex) ? fs.readFileSync(ex, 'utf8') : '';
      if (!/^\/?\.claude\/worktrees\/?$/m.test(cur)) { fs.mkdirSync(path.dirname(ex), { recursive: true }); fs.appendFileSync(ex, `${cur && !cur.endsWith('\n') ? '\n' : ''}/.claude/worktrees/\n`); }
    } catch { /* sin permiso: seguir */ }
  }
  let r;
  for (let i = 0; i < 3; i++) {
    const exists = git(root, ['rev-parse', '--verify', '--quiet', `refs/heads/${p.branch}`]).status === 0;
    if (p.pr && !exists) git(root, ['fetch', '--quiet', 'origin', `pull/${p.pr}/head:${p.branch}`], 60000);
    else if (!exists && !p.branch.startsWith('worktree-')) git(root, ['fetch', '--quiet', 'origin', `${p.branch}:${p.branch}`], 60000); // rama de ticket que solo está en el remoto (p. ej. para auditarla)
    const now = git(root, ['rev-parse', '--verify', '--quiet', `refs/heads/${p.branch}`]).status === 0;
    r = now ? git(root, ['worktree', 'add', p.dest, p.branch]) : git(root, ['worktree', 'add', '-b', p.branch, p.dest, baseRef(root, p.baseMode)]);
    if (r.status === 0) break;
    sleep(400 + 300 * i); // otro registro del mismo hook pudo crearlo en paralelo
    if (registered(root).some((w) => samePath(w, p.dest))) return p.dest;
  }
  if (r.status !== 0) throw new Error(`git worktree add falló: ${(r.stderr || r.stdout).trim().slice(0, 300)}`);
  const n = copyIncluded(root, p.dest, p.cfg.worktrees && p.cfg.worktrees.include);
  if (n) err(`copié ${n} archivo(s) de .worktreeinclude`);
  return p.dest;
}

// --- Cierre de procesos dentro del worktree
function ancestors() {
  const set = new Set([process.pid, process.ppid]);
  if (process.platform === 'linux') {
    let pid = process.ppid;
    for (let i = 0; i < 30 && pid > 1; i++) {
      try { const st = fs.readFileSync(`/proc/${pid}/stat`, 'utf8'); pid = Number(st.slice(st.lastIndexOf(')') + 2).split(' ')[1]); set.add(pid); } catch { break; }
    }
  }
  return set;
}

function killInside(dir, dryRun = false) {
  const target = real(dir);
  const killed = [];
  if (process.platform === 'win32') {
    // Se excluyen el propio proceso y su cadena de padres (Claude Code) con ParentProcessId.
    const ps = [
      '$ErrorActionPreference = "SilentlyContinue"',
      `$t = '${target.replace(/'/g, "''")}'`,
      '$all = Get-CimInstance Win32_Process',
      '$skip = @{}; $p = $PID; for ($i = 0; $i -lt 30 -and $p; $i++) { $skip[[int]$p] = 1; $p = ($all | Where-Object ProcessId -eq $p).ParentProcessId }',
      `$all | Where-Object { -not $skip.ContainsKey([int]$_.ProcessId) -and ( ($_.CommandLine -and $_.CommandLine.IndexOf($t, [StringComparison]::OrdinalIgnoreCase) -ge 0) -or ($_.ExecutablePath -and $_.ExecutablePath.StartsWith($t, [StringComparison]::OrdinalIgnoreCase)) ) } | ForEach-Object { ${dryRun ? '' : 'Stop-Process -Id $_.ProcessId -Force; '}"$($_.ProcessId) $($_.Name)" }`,
    ].join('; ');
    const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf8', timeout: 30000, windowsHide: true });
    killed.push(...(r.stdout || '').split(/\r?\n/).filter(Boolean));
  } else {
    const skip = ancestors();
    const pids = new Set();
    if (process.platform === 'linux') {
      for (const d of fs.readdirSync('/proc').filter((x) => /^\d+$/.test(x))) {
        const pid = Number(d); if (skip.has(pid)) continue;
        try {
          const cwd = fs.readlinkSync(`/proc/${d}/cwd`);
          const cmd = fs.readFileSync(`/proc/${d}/cmdline`, 'utf8').replace(/\0/g, ' ');
          if (cwd === target || cwd.startsWith(target + path.sep) || cmd.includes(target)) pids.add(pid);
        } catch { /* proceso ajeno o terminado */ }
      }
    } else {
      const r = spawnSync('ps', ['-axo', 'pid=,command='], { encoding: 'utf8' });
      for (const l of (r.stdout || '').split('\n')) { const m = l.trim().match(/^(\d+)\s+(.*)$/); if (m && (m[2].includes(target) || m[2].includes(path.resolve(dir))) && !skip.has(Number(m[1]))) pids.add(Number(m[1])); }
      // macOS: directorio de trabajo de cada proceso con lsof (p<pid> / n<ruta>).
      const lo = spawnSync('lsof', ['-a', '-d', 'cwd', '-Fpn'], { encoding: 'utf8', timeout: 20000 });
      let pid = null;
      for (const l of (lo.stdout || '').split('\n')) {
        if (l.startsWith('p')) pid = Number(l.slice(1));
        else if (l.startsWith('n') && pid && !skip.has(pid)) { const cwd = l.slice(1); if (cwd === target || cwd.startsWith(target + path.sep)) pids.add(pid); }
      }
    }
    if (dryRun) return [...pids].map(String);
    for (const pid of pids) { try { process.kill(pid, 'SIGTERM'); killed.push(String(pid)); } catch { /* ya terminó */ } }
    if (pids.size) { sleep(800); for (const pid of pids) { try { process.kill(pid, 'SIGKILL'); } catch { /* terminó */ } } }
  }
  return killed;
}

function removePath(dir) {
  const target = path.resolve(dir);
  if (!fs.existsSync(target)) return { removed: true, killed: [] };
  const root = mainRoot(target) || config.repoRoot(path.dirname(target));
  const killed = killInside(target);
  for (let i = 0; i < 5; i++) {
    const r = git(root, ['worktree', 'remove', '--force', target]);
    if (r.status === 0 || !fs.existsSync(target)) break;
    sleep(1000 + 500 * i); // EPERM / EBUSY en Windows: un indexador o antivirus suelta el archivo en un momento
  }
  if (fs.existsSync(target)) { try { fs.rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 }); } catch (e) { err(`no pude borrar ${target}: ${e.code || e.message}`); } }
  git(root, ['worktree', 'prune']);
  return { removed: !fs.existsSync(target), killed };
}

function removeHook(input) {
  let dir = input.worktree_path || input.worktreePath || input.path || null;
  if (!dir && input.name) {
    const cwd = input.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const root = mainRoot(cwd);
    if (root) dir = plan(root, input.name).dest;
  }
  if (!dir) throw new Error('la entrada no trae la ruta ni el nombre del worktree');
  const r = removePath(dir);
  if (r.killed.length) err(`cerré ${r.killed.length} proceso(s) que tenían abierto el worktree`);
  if (!r.removed) throw new Error(`${dir} sigue existiendo (¿un editor o terminal abierto ahí?)`);
}

function gc(argv) {
  const get = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
  const root = mainRoot(get('--dir') || process.cwd());
  if (!root) throw new Error('no es un repo git');
  const apply = argv.includes('--apply');
  const sym = git(root, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']);
  const def = sym.status === 0 ? sym.stdout.trim() : (git(root, ['rev-parse', '--verify', '--quiet', 'main']).status === 0 ? 'main' : 'master');
  if (def.startsWith('origin/')) git(root, ['fetch', '--quiet', 'origin', def.slice(7)], 20000);
  const blocks = git(root, ['worktree', 'list', '--porcelain']).stdout.split('\n\n').filter(Boolean);
  const pl = plan(root, 'x');
  const managedDirs = [path.join(root, '.claude', 'worktrees'), path.dirname(pl.dest)];
  const rows = [];
  for (const b of blocks.slice(1)) {
    const wt = (b.match(/^worktree (.+)$/m) || [])[1];
    const br = ((b.match(/^branch refs\/heads\/(.+)$/m) || [])[1]) || null;
    if (!wt) continue;
    if (/^prunable/m.test(b) || !fs.existsSync(wt)) { rows.push({ wt, br, action: 'podar', why: 'la carpeta ya no existe' }); continue; }
    const dirty = git(wt, ['status', '--porcelain']).stdout.trim();
    if (dirty) { rows.push({ wt, br, action: 'dejar', why: 'tiene cambios sin commitear' }); continue; }
    if (!br) { rows.push({ wt, br, action: 'dejar', why: 'HEAD separado' }); continue; }
    const managed = managedDirs.some((d) => real(wt).toLowerCase().startsWith(real(d).toLowerCase() + path.sep));
    if (!managed && !argv.includes('--all')) { rows.push({ wt, br, action: 'dejar', why: 'no es un worktree administrado por dev-flow (--all para incluirlo)' }); continue; }
    const merged = git(root, ['merge-base', '--is-ancestor', br, def]).status === 0;
    const ahead = Number(git(root, ['rev-list', '--count', `${def}..${br}`]).stdout.trim() || '0');
    // "Sin commits propios" = la rama nunca se movió desde que se creó (su reflog tiene una sola entrada).
    // Una rama ya mergeada con fast-forward también apunta a la base, pero su reflog muestra los commits.
    const moved = git(root, ['reflog', 'show', '--format=%H', `refs/heads/${br}`]).stdout.trim().split('\n').filter(Boolean).length > 1;
    const tipIsBase = !moved && git(root, ['rev-parse', br]).stdout.trim() === git(root, ['merge-base', br, def]).stdout.trim();
    const idleAgent = /[\\/]agent-[a-z0-9]+$/i.test(wt) && !killInside(wt, true).length;
    if (merged && tipIsBase && idleAgent) rows.push({ wt, br, action: 'borrar', why: 'worktree de subagente terminado, sin cambios' });
    else if (merged && tipIsBase && !argv.includes('--include-empty')) rows.push({ wt, br, action: 'dejar', why: 'sin commits propios todavía (¿un worker trabajando?); --include-empty para borrarlo' });
    else if (merged) rows.push({ wt, br, action: 'borrar', why: `${br} ya está en ${def}` });
    else rows.push({ wt, br, action: 'dejar', why: `${ahead} commit(s) sin mergear` });
  }
  for (const r of rows) {
    console.log(`${r.action.padEnd(7)} ${r.wt}${r.br ? ` (${r.br})` : ''}: ${r.why}`);
    if (!apply) continue;
    if (r.action === 'podar') git(root, ['worktree', 'prune']);
    if (r.action === 'borrar') { const x = removePath(r.wt); if (x.removed && /^(feat|fix|worktree)[/-]/.test(r.br)) git(root, ['branch', '-d', r.br]); console.log(`        ${x.removed ? 'borrado' : 'NO se pudo borrar'}${x.killed.length ? `; cerré ${x.killed.length} proceso(s)` : ''}`); }
  }
  if (!rows.length) console.log('No hay worktrees aparte del principal.');
  else if (!apply) console.log('\nDry-run: agregá --apply para borrar los marcados "borrar" (y sus ramas locales ya mergeadas).');
}

if (require.main === module) {
  if (mode === 'gc') { try { gc(process.argv.slice(3)); } catch (e) { console.error(e.message); process.exit(1); } }
  else if (mode === 'remove-path') { const r = removePath(process.argv[3] || ''); console.log(r.removed ? `Borrado${r.killed.length ? `; cerré ${r.killed.length} proceso(s)` : ''}.` : 'No se pudo borrar.'); process.exit(r.removed ? 0 : 1); }
  else if (mode === 'create' || mode === 'remove') {
    let raw = '';
    process.stdin.on('data', (c) => (raw += c));
    process.stdin.on('end', () => {
      try {
        const input = JSON.parse(raw || '{}');
        if (mode === 'create') process.stdout.write(create(input));
        else removeHook(input);
        process.exit(0);
      } catch (e) { err(e.message); process.exit(1); }
    });
  } else { console.error('Uso: node worktree.cjs create|remove (hook) | gc [--apply] | remove-path <ruta>'); process.exit(2); }
}
module.exports = { plan, create, removePath, killInside };
