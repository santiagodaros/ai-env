#!/usr/bin/env node
// Stop: antes de que Claude dé el turno por terminado, verifica la infraestructura como código que cambió.
//   Terraform   terraform fmt -check, y terraform validate si la carpeta ya tiene `terraform init` hecho
//   Bicep       bicep build (o az bicep build) para compilar y reportar errores
//   PowerShell  errores de sintaxis con el parser de PowerShell, y PSScriptAnalyzer (severidad Error) si está instalado
// Solo corre las herramientas que existen en la máquina: la que falta se saltea sin fallar.
// exit 2 = Claude no puede terminar y recibe el error. Bloquea como máximo una vez por turno.
// Para apagarlo: AI_ENV_HOOKS_SKIP=iac-verify, o {"iacVerify": false} en .claude/cloud-ops.json del proyecto.
const { spawnSync } = require('child_process');
const fs = require('fs'), path = require('path');
const { run, log, projectDir } = require('./lib.cjs');
const WIN = process.platform === 'win32';

// Los ejecutables de Windows que son .cmd (az, y a veces terraform vía gestores) necesitan shell.
const sh = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: 'utf8', shell: WIN, timeout: 90000, ...opts });
const has = (cmd, args = ['--version']) => { const r = sh(cmd, args, { timeout: 20000 }); return !r.error && r.status === 0; };
const tail = (r, n = 30) => `${r.stdout || ''}${r.stderr || ''}`.trim().split('\n').slice(-n).join('\n');
const q = (p) => (WIN ? `"${p}"` : p); // con shell en Windows, las rutas con espacios van entre comillas

run('iac-verify', (input) => {
  if (input.stop_hook_active) return; // ya bloqueó una vez en este turno: no entrar en bucle
  const cwd = projectDir(input);
  try { if (JSON.parse(fs.readFileSync(path.join(cwd, '.claude', 'cloud-ops.json'), 'utf8')).iacVerify === false) return; } catch { /* sin config: activo */ }

  const st = spawnSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd, encoding: 'utf8' });
  if (st.status !== 0) return;
  const changed = st.stdout.split('\n').filter((l) => l.trim() && !l.startsWith(' D') && !l.startsWith('D '))
    .map((l) => l.slice(3).split(' -> ').pop().trim().replace(/^"|"$/g, ''))
    .filter((f) => fs.existsSync(path.join(cwd, f)));
  const tf = changed.filter((f) => /\.(tf|tfvars)$/i.test(f));
  const bicep = changed.filter((f) => /\.bicep$/i.test(f));
  const ps = changed.filter((f) => /\.(ps1|psm1|psd1)$/i.test(f));
  if (!tf.length && !bicep.length && !ps.length) return;

  const failures = [];
  if (tf.length && has('terraform', ['version'])) {
    const dirs = [...new Set(tf.map((f) => path.dirname(f)))];
    for (const d of dirs) {
      const abs = path.join(cwd, d);
      const fmt = sh('terraform', [`-chdir=${q(abs)}`, 'fmt', '-check', '-no-color']);
      if (fmt.status !== 0) failures.push(`terraform fmt -check en ${d}: archivos sin formatear o con errores de sintaxis.\n${tail(fmt, 15)}\nCorregí con: terraform -chdir=${d} fmt`);
      if (fs.existsSync(path.join(abs, '.terraform'))) {
        const val = sh('terraform', [`-chdir=${q(abs)}`, 'validate', '-no-color']);
        if (val.status !== 0) failures.push(`terraform validate en ${d} falló:\n${tail(val)}`);
      }
    }
  }
  if (bicep.length) {
    const tool = has('bicep') ? ['bicep', (f) => ['build', q(f), '--stdout']] : has('az', ['bicep', 'version']) ? ['az', (f) => ['bicep', 'build', '--file', q(f), '--stdout']] : null;
    if (tool) for (const f of bicep) {
      const r = sh(tool[0], tool[1](path.join(cwd, f)), { cwd });
      if (r.status !== 0) failures.push(`bicep build de ${f} falló:\n${(r.stderr || r.stdout || '').trim().split('\n').slice(-20).join('\n')}`);
    }
  }
  if (ps.length) {
    const shell = ['pwsh', 'powershell'].find((c) => { const r = spawnSync(c, ['-NoProfile', '-NonInteractive', '-Command', 'exit 0'], { encoding: 'utf8', timeout: 20000 }); return !r.error && r.status === 0; });
    if (shell) {
      // El script viaja codificado (UTF-16LE en base64) para no depender de las reglas de comillas de cada sistema.
      const script = [
        "$ErrorActionPreference = 'Continue'; $bad = @()",
        '$files = $env:AIENV_PS_FILES -split [char]10 | Where-Object { $_ }',
        'foreach ($f in $files) { $t = $null; $e = $null; [void][System.Management.Automation.Language.Parser]::ParseFile($f, [ref]$t, [ref]$e); foreach ($x in $e) { $bad += ("{0}:{1}: sintaxis: {2}" -f $f, $x.Extent.StartLineNumber, $x.Message) } }',
        'if (Get-Module -ListAvailable -Name PSScriptAnalyzer) { foreach ($f in $files) { try { Invoke-ScriptAnalyzer -Path $f -Severity Error | ForEach-Object { $bad += ("{0}:{1}: {2}: {3}" -f $_.ScriptPath, $_.Line, $_.RuleName, $_.Message) } } catch { } } }',
        '$bad | Select-Object -Unique | ForEach-Object { Write-Output $_ }; if ($bad.Count -gt 0) { exit 1 } else { exit 0 }',
      ].join('; ');
      const r = spawnSync(shell, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
        { cwd, encoding: 'utf8', timeout: 120000, env: { ...process.env, AIENV_PS_FILES: ps.map((f) => path.join(cwd, f)).join('\n') } });
      if (r.status === 1) failures.push(`PowerShell: errores en ${ps.length} archivo(s):\n${(r.stdout || '').trim().split('\n').slice(0, 30).join('\n')}`);
    }
  }

  if (failures.length) {
    log('iac-verify', 'block', 'verify-failed');
    process.stderr.write(`No des el trabajo por terminado: la verificación de infraestructura falló.\n\n${failures.join('\n\n')}\n`);
    process.exit(2);
  }
});
