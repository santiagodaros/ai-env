// Subagentes de solo lectura (dev-flow 2.8). Claude Code manda en el evento PreToolUse `agent_type` ("<plugin>:<nombre>",
// o el nombre solo si el agente vive en .claude/agents) cuando la herramienta la pide un subagente. Con eso, la regla deja
// de depender de que el modelo la respete: el explorer lee con Bash pero no puede escribir, instalar ni ejecutar código,
// y su único Write es el archivo de hallazgos del expediente.
// Lo usan session-guard (Bash|PowerShell) y lead-guard (Edit|Write…): no suma procesos a PreToolUse.
'use strict';

const READONLY = /(^|:)explorer$/;
const isReadonly = (input) => READONLY.test(String((input && input.agent_type) || ''));

// Comandos que solo leen. git con subcomandos de lectura; find sin acciones; sed solo con -n.
const SAFE = new Set(['ls', 'cat', 'head', 'tail', 'wc', 'grep', 'egrep', 'fgrep', 'rg', 'tree', 'pwd', 'echo', 'printf', 'file', 'stat', 'du', 'sort', 'uniq', 'cut', 'tr', 'jq', 'diff', 'basename', 'dirname', 'realpath', 'which', 'true', 'cd', 'type', 'dir',
  'get-childitem', 'gci', 'get-content', 'gc', 'select-string', 'sls', 'get-item', 'gi', 'get-location', 'measure-object', 'select-object', 'where-object', 'sort-object', 'format-table', 'format-list', 'test-path', 'resolve-path', 'split-path', 'join-path', 'out-string', 'get-filehash']);
const GIT_READ = new Set(['log', 'show', 'diff', 'status', 'grep', 'ls-files', 'ls-tree', 'blame', 'rev-parse', 'describe', 'shortlog', 'cat-file', 'rev-list', 'merge-base', 'name-rev', 'whatchanged', 'reflog']);
const GIT_OPTS_WRITE = /(^|\s)(--output|-o)(=|\s)|--ext-diff|--textconv/;

// Devuelve el motivo si el comando no es de solo lectura, o '' si se permite.
function readonlyBash(cmd) {
  const c = String(cmd || '');
  if (/`|\$\(|<\(|>\(/.test(c)) return 'sustitución de comandos';
  // Redirecciones a archivo (se permiten las que van a /dev/null, $null o a otro descriptor).
  const redir = c.replace(/(\d?>>?|&>)\s*(\/dev\/null|\$null|&\d)/g, '').replace(/'[^']*'|"[^"]*"/g, '');
  if (/>/.test(redir)) return 'redirección a un archivo';
  for (const seg of c.split(/&&|\|\||[;|\n]/)) {
    // Variables delante del comando: solo GIT_PAGER=cat o PAGER=cat (GIT_PAGER='sh -c …' ejecutaría lo que sea).
    const pre = (seg.trim().match(/^(\w+=\S*\s+)+/) || [''])[0];
    if (pre && !pre.trim().split(/\s+/).every((a) => /^(GIT_PAGER|PAGER)=cat$/.test(a))) return `variable de entorno delante del comando (${pre.trim().split('=')[0]})`;
    const words = seg.trim().slice(pre.length).match(/'[^']*'|"[^"]*"|\S+/g) || [];
    if (!words.length) continue;
    const bin = words[0].replace(/^["']|["']$/g, '').split(/[\\/]/).pop().toLowerCase().replace(/\.exe$/, '');
    const rest = words.slice(1).join(' ');
    if (bin === 'git') {
      // Opciones globales antes del subcomando: -C <dir>, -c <k=v>, --git-dir/--work-tree <x>, --no-pager…
      // -c y --exec-path no: `git -c core.pager=<cmd> log` ejecuta lo que se le pase.
      if (words.some((x) => /^(-c|--config-env|--exec-path)/.test(x))) return 'git -c (puede ejecutar comandos)';
      let k = 1;
      while (k < words.length && words[k].startsWith('-')) k += /^(-C|-c|--git-dir|--work-tree|--namespace)$/.test(words[k]) ? 2 : 1;
      const sub = words[k];
      if (!GIT_READ.has(sub)) return `git ${sub || ''}`.trim();
      if (GIT_OPTS_WRITE.test(rest)) return `git ${sub} con salida a archivo o diff externo`;
      continue;
    }
    if (bin === 'find') { if (/(^|\s)-(delete|exec|execdir|ok|okdir|fprint\w*|fls)\b/.test(rest)) return 'find con una acción'; continue; }
    if (bin === 'sed') { if (!/^-n\b/.test(rest) || /(^|\s)-i|\bw\s/.test(rest)) return 'sed que no es solo -n'; continue; }
    if (bin === 'node' || bin === 'npm' || bin === 'python' || bin === 'python3') { if (/^(-v|--version)$/.test(rest.trim())) continue; return `${bin} ejecuta código`; }
    if (!SAFE.has(bin)) return bin;
  }
  return '';
}

// El único archivo que escribe el explorer: sus hallazgos en el expediente del ticket.
const readonlyWriteOk = (rel) => /^\.dev-flow\/tickets\/[^/]+\/[^/]+\.md$/.test(rel) || /^\.dev-flow\/explore\/[^/]+\.md$/.test(rel);

module.exports = { isReadonly, readonlyBash, readonlyWriteOk, READONLY };
