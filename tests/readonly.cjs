// dev-flow 2.8: el explorer es de solo lectura de verdad. Claude Code manda agent_type en PreToolUse cuando la
// herramienta la pide un subagente (verificado con 2.1.302: "agent_type":"<plugin>:<nombre>"); session-guard y
// lead-guard lo usan para que la regla no dependa de que el modelo la respete.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

module.exports = function readonly({ check }) {
  const H = path.join(__dirname, '..', 'plugins', 'dev-flow', 'hooks');
  const { readonlyBash, isReadonly } = require(path.join(H, 'readonly.cjs'));
  const tmp = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'aienv-ro-')));
  spawnSync('git', ['init', '-q'], { cwd: tmp });
  const env = { ...process.env, AI_ENV_HOME: path.join(tmp, 'home'), CLAUDE_PROJECT_DIR: tmp };
  delete env.FEATURE_FLOW_CHILD;
  const hook = (name, input) => spawnSync(process.execPath, [path.join(H, name)], { input: JSON.stringify({ cwd: tmp, hook_event_name: 'PreToolUse', ...input, agent_type: input.agent_type || undefined }), encoding: 'utf8', env });
  const bash = (command, agent_type = 'dev-flow:explorer') => hook('session-guard.cjs', { tool_name: 'Bash', agent_type, tool_input: { command } });
  const write = (file_path, agent_type = 'dev-flow:explorer', tool_name = 'Write') => hook('lead-guard.cjs', { tool_name, agent_type, tool_input: { file_path, content: 'x' } });

  check('readonly: reconoce el explorer del plugin y el copiado a .claude/agents, no a otros', isReadonly({ agent_type: 'dev-flow:explorer' }) && isReadonly({ agent_type: 'explorer' }) && !isReadonly({ agent_type: 'dev-flow:implementer' }) && !isReadonly({}));
  const reads = ['git log --oneline -20', 'git show HEAD:src/a.ts', 'git grep -n "useQuery" -- src', 'ls -la src', 'cat package.json | head -40', 'rg -n "fetch\\(" src 2>/dev/null', 'find src -name "*.ts" | wc -l', 'sed -n 1,80p src/a.ts', 'GIT_PAGER=cat git diff main...HEAD --stat', 'Get-ChildItem -Recurse src | Select-Object -First 20', 'cd src && grep -rn TODO .', 'git -C "/tmp/repo con espacios" log --oneline', 'git --no-pager show HEAD --stat'];
  const bad = reads.filter((c) => readonlyBash(c));
  check('readonly: deja los comandos de lectura habituales (git log/show/grep/diff, ls, cat, rg, find, sed -n, PowerShell)', bad.length === 0, JSON.stringify(bad.map((c) => [c, readonlyBash(c)])));
  const writes = ['echo x > src/a.ts', 'git commit -am x', 'git checkout -- .', 'rm -rf src', 'npm install lodash', 'node -e "require(\'fs\').writeFileSync(\'a\',\'\')"', 'find . -name "*.log" -delete', "sed -i 's/a/b/' src/a.ts", 'cat a | tee b', 'ls $(touch x)', 'git diff --output=x.patch', 'python3 script.py', 'Set-Content a.txt x', 'curl https://example.com', 'git -C /tmp/x commit -m y', 'git -c core.pager=cat push', 'git -c core.pager="sh -c id" log', "GIT_PAGER='sh -c id' git log", 'LD_PRELOAD=x.so ls'];
  const passed = writes.filter((c) => !readonlyBash(c));
  check('readonly: frena lo que escribe, instala o ejecuta código (redirecciones, rm, git commit, npm, node, find -delete, sed -i, tee, $( ))', passed.length === 0, JSON.stringify(passed));

  let r = bash('npm install lodash');
  check('session-guard: el explorer no puede correr npm install (exit 2, con la regla y qué usar)', r.status === 2 && /solo lectura/.test(r.stderr) && /git log/.test(r.stderr), r.stderr);
  check('session-guard: el explorer sí puede leer con git log', bash('git log --oneline -5').status === 0);
  check('session-guard: otro subagente o la sesión principal no se ven afectados', bash('npm install lodash', 'dev-flow:implementer').status === 0 && bash('npm install lodash', null).status === 0 && hook('session-guard.cjs', { tool_name: 'Bash', tool_input: { command: 'npm install lodash' } }).status === 0);

  check('lead-guard: el explorer escribe su archivo de hallazgos en el expediente', write('.dev-flow/tickets/12/explore-auth.md').status === 0 && write(path.join(tmp, '.dev-flow', 'tickets', '12', 'explore-datos.md')).status === 0);
  r = write('src/app.ts');
  check('lead-guard: el explorer no escribe código, aunque el modo Tech Lead esté apagado', r.status === 2 && /solo lectura/.test(r.stderr) && /src\/app\.ts/.test(r.stderr), r.stderr);
  check('lead-guard: el explorer no edita (ni siquiera su archivo) ni sale del expediente con ../', write('.dev-flow/tickets/12/explore-auth.md', 'dev-flow:explorer', 'Edit').status === 2 && write('.dev-flow/tickets/12/../../../src/a.md').status === 2 && write('.dev-flow/tickets/12/x.ts').status === 2);
  check('lead-guard: sin agent_type y sin modo Tech Lead, Write sigue permitido', write('src/app.ts', null).status === 0);

  fs.rmSync(tmp, { recursive: true, force: true });
};
