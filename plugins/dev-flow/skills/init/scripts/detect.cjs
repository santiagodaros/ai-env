#!/usr/bin/env node
// Detecta el stack de un repo y propone el tipo de arquitectura. Solo lee. Uso: node detect.cjs [--dir <repo>]
// Como módulo: require('./detect.cjs').detect(dir) — lo usa init.cjs detect.
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const SKIP = ['node_modules', '.git', 'dist', 'build', '.venv', '__pycache__', '.dev-flow', 'worktrees'];
const DOC_ONLY = /^(readme|license|licence|changelog|contributing|code_of_conduct|security)(\.[a-z]+)?$|\.(md|txt|rst|adoc)$/i;

function detect(dir) {
  const has = (f) => fs.existsSync(path.join(dir, f));
  const read = (f) => { try { return fs.readFileSync(path.join(dir, f), 'utf8'); } catch { return ''; } };
  const walk = (d, depth = 0, acc = []) => {
    if (depth > 3) return acc;
    let entries = [];
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return acc; }
    for (const e of entries) {
      if (SKIP.includes(e.name) || (depth === 0 && e.name === '.claude')) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p, depth + 1, acc); else acc.push(path.relative(dir, p).replace(/\\/g, '/'));
    }
    return acc;
  };
  const files = walk(dir);
  let pkg = {}; try { pkg = JSON.parse(read('package.json')); } catch { /* sin package.json */ }
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  const py = read('requirements.txt') + read('pyproject.toml');
  const lang = [];
  if (has('package.json') || files.some((f) => /\.(ts|tsx|js|jsx)$/.test(f))) lang.push(files.some((f) => /\.tsx?$/.test(f)) ? 'ts' : 'js');
  if (has('requirements.txt') || has('pyproject.toml') || files.some((f) => f.endsWith('.py'))) lang.push('py');
  if (files.some((f) => /\.(ps1|psm1)$/.test(f))) lang.push('ps1');
  if (files.some((f) => /\.(tf|bicep)$/.test(f))) lang.push('iac');
  if (files.some((f) => /\.(cs|csproj)$/.test(f))) lang.push('cs');
  if (files.some((f) => f.endsWith('.go'))) lang.push('go');
  const frameworks = ['react', 'next', 'vue', 'vite', 'express', 'fastify', 'koa', '@nestjs/core', 'tailwindcss'].filter((k) => deps[k]).concat(['fastapi', 'flask', 'django'].filter((k) => new RegExp(`^${k}\\b`, 'im').test(py)));
  const web = ['react', 'next', 'vue', 'vite'].some((k) => deps[k]);
  const api = ['express', 'fastify', 'koa', '@nestjs/core'].some((k) => deps[k]) || /fastapi|flask|django/i.test(py);
  const suggested = web && api ? 'web+api (dos apps: un architecture.json en cada una)' : web ? 'web' : api ? 'api' : pkg.bin ? 'cli' : (lang.includes('ps1') || lang.includes('py')) ? 'automation' : 'sin determinar';
  const scripts = ['typecheck', 'lint', 'test', 'build', 'dev', 'start'].filter((s) => pkg.scripts && pkg.scripts[s]);
  const pm = has('pnpm-lock.yaml') ? 'pnpm' : has('yarn.lock') ? 'yarn' : has('package-lock.json') ? 'npm' : has('package.json') ? 'npm (sin lockfile)' : null;
  const projectPlugins = (() => { try { return Object.entries(JSON.parse(read('.claude/settings.json')).enabledPlugins || {}).filter(([, v]) => v).map(([k]) => k); } catch { return []; } })();
  const remote = spawnSync('git', ['remote', 'get-url', 'origin'], { cwd: dir, encoding: 'utf8' });
  const remoteUrl = remote.status === 0 ? remote.stdout.trim() : '';
  // Perfil sugerido (shared/profiles.json): UI → frontend; IaC → cloud; API sin UI → app; si no, core. UI + IaC → full.
  const csproj = files.filter((f) => f.endsWith('.csproj')).map(read).join('\n');
  const signals = {
    frontend: ['react', 'next', 'vite', 'vue'].filter((k) => deps[k]),
    cloud: files.filter((f) => /\.(tf|bicep)$/.test(f) || /(^|\/)azure-pipelines[^/]*\.ya?ml$/.test(f)).slice(0, 3),
    app: [...(api ? frameworks.filter((k) => ['express', 'fastify', 'koa', '@nestjs/core', 'fastapi', 'flask', 'django'].includes(k)) : []),
      ...(/Microsoft\.NET\.Sdk\.Web|Microsoft\.AspNetCore/.test(csproj) ? ['ASP.NET'] : []), ...(has('host.json') ? ['Azure Functions'] : []),
      ...(files.some((f) => /(^|\/)(controllers?|routes|endpoints)\//i.test(f)) ? ['controladores o rutas'] : [])],
  };
  const [suggestedProfile, profileReason] = signals.frontend.length && signals.cloud.length ? ['full', `UI (${signals.frontend.join(', ')}) e infraestructura (${signals.cloud.join(', ')}) en el mismo repo`]
    : signals.frontend.length ? ['frontend', `dependencias de UI: ${signals.frontend.join(', ')}`]
      : signals.cloud.length ? ['cloud', `infraestructura como código: ${signals.cloud.join(', ')}`]
        : signals.app.length ? ['app', `API o backend sin UI: ${signals.app.join(', ')}`]
          : ['core', 'sin señales de UI, infraestructura ni API'];
  // Brownfield: lo que el arnés necesita para verificar sin colgarse.
  const needsBuild = lang.includes('ts') || ['vite', 'next', 'webpack', 'rollup', 'esbuild', 'parcel', 'tsup', '@angular/core'].some((k) => deps[k]);
  const testScript = (pkg.scripts && pkg.scripts.test) || '';
  const testWatch = /--watch(?!=false|All=false)(All)?\b/.test(testScript) ? 'usa --watch'
    : /\breact-scripts test\b/.test(testScript) && !/--watchAll=false/.test(testScript) ? 'react-scripts test entra en watch sin CI'
      : /\bng test\b/.test(testScript) && !/--watch=false|--no-watch/.test(testScript) ? 'ng test (Karma) entra en watch sin --watch=false'
        : /\bvitest\b/.test(testScript) && !/\bvitest\s+run\b|--run\b/.test(testScript) ? 'vitest sin `run` entra en watch fuera de CI'
          : /\b(nodemon|ptw)\b|node\s+--watch/.test(testScript) ? 'corre con un vigilante de archivos' : null;
  // Finales de línea ya commiteados con CRLF (no se renormaliza solo: es decisión de la persona).
  const eol = spawnSync('git', ['ls-files', '--eol'], { cwd: dir, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  const crlf = eol.status === 0 ? eol.stdout.split('\n').filter((l) => /^i\/(crlf|mixed)\b/.test(l)).map((l) => l.split('\t').pop()) : [];
  // Indentación más frecuente por extensión (solo si es clara: ≥ 5 archivos y ≥ 70 % de acuerdo).
  const indent = {};
  {
    const by = {};
    for (const f of files.filter((x) => /\.(js|jsx|ts|tsx|mjs|cjs|json|py|cs|ps1|psm1|tf|bicep|ya?ml|css|scss|html|vue|go|java|sh)$/i.test(x)).slice(0, 400)) {
      const ext = path.extname(f).slice(1).toLowerCase();
      const lines = read(f).split('\n').filter((l) => /^[ \t]+\S/.test(l)).slice(0, 200);
      if (!lines.length) continue;
      const tabs = lines.filter((l) => l[0] === '\t').length;
      const spaces = lines.filter((l) => l[0] === ' ').map((l) => l.match(/^ +/)[0].length);
      let style;
      if (tabs > spaces.length) style = 'tab';
      else { const min = Math.min(...spaces); style = min === 2 || min === 4 ? `space${min}` : null; }
      if (style) (by[ext] = by[ext] || []).push(style);
    }
    for (const [ext, v] of Object.entries(by)) {
      if (v.length < 5) continue;
      const top = Object.entries(v.reduce((m, x) => ((m[x] = (m[x] || 0) + 1), m), {})).sort((a, b) => b[1] - a[1])[0];
      if (top[1] / v.length >= 0.7) indent[ext] = top[0] === 'tab' ? { style: 'tab' } : { style: 'space', size: Number(top[0].slice(5)) };
    }
  }
  // Otros gestores de git hooks: si existen, el pre-commit de ai-env no se instala.
  const gitCfg = (k) => { const r = spawnSync('git', ['config', '--get', k], { cwd: dir, encoding: 'utf8' }); return r.status === 0 ? r.stdout.trim() : ''; };
  const hookManagers = [...(gitCfg('core.hooksPath') ? ['core.hooksPath'] : []), ...(has('.husky') ? ['husky'] : []), ...(has('.pre-commit-config.yaml') ? ['pre-commit'] : []), ...(has('lefthook.yml') || has('.lefthook.yml') ? ['lefthook'] : [])];
  const head = spawnSync('git', ['rev-parse', '--verify', '-q', 'HEAD'], { cwd: dir, encoding: 'utf8' }).status === 0;
  const code = files.filter((f) => !DOC_ONLY.test(path.basename(f)) && !f.startsWith('.github/') && f !== '.gitignore' && f !== '.gitattributes');
  return {
    dir, languages: lang, frameworks, packageManager: pm, scripts, suggestedType: suggested,
    hasClaudeMd: has('CLAUDE.md'), hasState: has('docs/STATE.md'), projectPlugins,
    hasArchitecture: files.some((f) => f.endsWith('architecture.json')), hasCI: has('.github/workflows'),
    missingChecks: ['typecheck', 'lint', 'test'].filter((s) => !scripts.includes(s)),
    testPlaceholder: !!(pkg.scripts && /no test specified|^\s*(exit 0|true|:|echo\b[^&|]*)\s*$/i.test(pkg.scripts.test || '')),
    remote: remoteUrl ? (/github\.com[:/]/i.test(remoteUrl) ? 'github' : 'otro') : null,
    blank: code.length === 0,
    suggestedProfile, profileReason,
    needsBuild, testWatch, crlfFiles: crlf, indent, hookManagers, hasCommits: head,
  };
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const dir = path.resolve(argv.includes('--dir') ? argv[argv.indexOf('--dir') + 1] : process.cwd());
  console.log(JSON.stringify(detect(dir), null, 2));
}
module.exports = { detect };
