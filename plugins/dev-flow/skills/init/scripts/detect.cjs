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
  const code = files.filter((f) => !DOC_ONLY.test(path.basename(f)) && !f.startsWith('.github/') && f !== '.gitignore' && f !== '.gitattributes');
  return {
    dir, languages: lang, frameworks, packageManager: pm, scripts, suggestedType: suggested,
    hasClaudeMd: has('CLAUDE.md'), hasState: has('docs/STATE.md'), projectPlugins,
    hasArchitecture: files.some((f) => f.endsWith('architecture.json')), hasCI: has('.github/workflows'),
    missingChecks: ['typecheck', 'lint', 'test'].filter((s) => !scripts.includes(s)),
    testPlaceholder: !!(pkg.scripts && /no test specified|^\s*(exit 0|true|:|echo\b[^&|]*)\s*$/i.test(pkg.scripts.test || '')),
    remote: remoteUrl ? (/github\.com[:/]/i.test(remoteUrl) ? 'github' : 'otro') : null,
    blank: code.length === 0,
  };
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const dir = path.resolve(argv.includes('--dir') ? argv[argv.indexOf('--dir') + 1] : process.cwd());
  console.log(JSON.stringify(detect(dir), null, 2));
}
module.exports = { detect };
