// Piezas del pre-commit nativo de ai-env: qué se copia fuera del plugin, a dónde, y el shim de .git/hooks.
// Lo usan /dev-flow:init (paso git-hook) y /dev-flow:setup (refresca la copia si ya está instalada).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const MARK = 'ai-env: pre-commit';
const P = path.join(__dirname, '..');
const FILES = [
  ['pre-commit.cjs', path.join(P, 'skills', 'init', 'templates', 'git-hooks', 'pre-commit.cjs')],
  ['secscan.cjs', path.join(P, 'skills', 'security-diff', 'scripts', 'secscan.cjs')],
  ['arch-check.cjs', path.join(P, 'lib', 'arch', 'arch-check.cjs')],
  ['archlib.cjs', path.join(P, 'lib', 'arch', 'archlib.cjs')],
];
const dir = () => path.join(process.env.AI_ENV_HOME || os.homedir(), '.claude', 'ai-env', 'git-hooks');
// sh lo corre en Linux, macOS y Git for Windows. Sin node en el PATH no frena el commit.
const shim = (d = dir()) => `#!/bin/sh\n# ${MARK} (red de seguridad; git commit --no-verify lo saltea). Lo instaló /dev-flow:init.\ncommand -v node >/dev/null 2>&1 || exit 0\nexec node "${path.join(d, 'pre-commit.cjs').replace(/\\/g, '/')}" "$@"\n`;
const stale = (d = dir()) => FILES.filter(([rel, src]) => { try { return fs.readFileSync(path.join(d, rel), 'utf8') !== fs.readFileSync(src, 'utf8'); } catch { return true; } });

module.exports = { MARK, FILES, dir, shim, stale };
