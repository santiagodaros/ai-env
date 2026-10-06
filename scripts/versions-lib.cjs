// Utilidades de versionado: una versión semver por plugin y un tag <plugin>--v<versión> por publicación.
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const root = path.join(__dirname, '..');
const git = (args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' });
const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;
const cmp = (a, b) => { const x = a.match(SEMVER).slice(1).map(Number), y = b.match(SEMVER).slice(1).map(Number); return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]; };
const plugins = () => fs.readdirSync(path.join(root, 'plugins')).filter((p) => fs.existsSync(path.join(root, 'plugins', p, '.claude-plugin', 'plugin.json'))).sort();
const manifestPath = (p) => path.join(root, 'plugins', p, '.claude-plugin', 'plugin.json');
const manifest = (p) => JSON.parse(fs.readFileSync(manifestPath(p), 'utf8'));
const tagOf = (p, v) => `${p}--v${v}`;
const tagExists = (t) => git(['rev-parse', '-q', '--verify', `refs/tags/${t}`]).status === 0;
// Versiones ya publicadas de un plugin, según los tags.
const published = (p) => git(['tag', '--list', `${p}--v*`]).stdout.split('\n').map((t) => t.replace(`${p}--v`, '').trim()).filter((v) => SEMVER.test(v)).sort(cmp);
// ¿El contenido del plugin (incluido lo que todavía no se commiteó) difiere de lo publicado en ese tag?
const changedSince = (p, t) => git(['diff', '--quiet', t, '--', `plugins/${p}`]).status !== 0 || git(['ls-files', '--others', '--exclude-standard', '--', `plugins/${p}`]).stdout.trim() !== '';
module.exports = { root, git, SEMVER, cmp, plugins, manifestPath, manifest, tagOf, tagExists, published, changedSince };
