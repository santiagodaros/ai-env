#!/usr/bin/env node
// Regenera plugins/* desde las fuentes. kits/hub-ai-kit es la fuente de verdad de skills/agentes del kit.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const kit = path.join(root, 'kits', 'hub-ai-kit');
const cp = (from, to) => { fs.rmSync(to, { recursive: true, force: true }); fs.mkdirSync(path.dirname(to), { recursive: true }); fs.cpSync(from, to, { recursive: true }); };
const manifest = (dir, name, description) => {
  fs.mkdirSync(path.join(dir, '.claude-plugin'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.claude-plugin', 'plugin.json'),
    JSON.stringify({ name, description, license: 'MIT', author: { name: 'ai-env contributors' } }, null, 2) + '\n');
};
// cloud-ops: skills personales de trabajo en Azure y entregables
const co = path.join(root, 'plugins', 'cloud-ops');
fs.rmSync(co, { recursive: true, force: true });
for (const s of fs.readdirSync(path.join(kit, 'personal', 'skills'))) cp(path.join(kit, 'personal', 'skills', s), path.join(co, 'skills', s));
manifest(co, 'cloud-ops', 'Skills para trabajo en Azure: verificación de afirmaciones contra Microsoft Learn, inventario con Resource Graph (KQL), entregables a cliente, revisión y registro de estado.');
// app-review: revisión de arquitectura/PR + subagentes
const ar = path.join(root, 'plugins', 'app-review');
fs.rmSync(ar, { recursive: true, force: true });
for (const s of fs.readdirSync(path.join(kit, 'repo', '.claude', 'skills'))) cp(path.join(kit, 'repo', '.claude', 'skills', s), path.join(ar, 'skills', s));
for (const a of fs.readdirSync(path.join(kit, 'repo', '.claude', 'agents'))) cp(path.join(kit, 'repo', '.claude', 'agents', a), path.join(ar, 'agents', a));
manifest(ar, 'app-review', 'Revisión de arquitectura (seguridad, identidad, costo), preparación de PR, entrevista de spec y subagentes reviewer/explorer.');
console.log('plugins regenerados');
