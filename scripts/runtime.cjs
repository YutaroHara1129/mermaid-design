const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '..');
let selected;

function runtime() {
  if (selected) return selected;
  const development = fs.existsSync(path.join(root, 'node_modules/mermaid'));
  const directory = development ? root : path.join(root, '.runtime');
  const recovery = development ? 'npm ci' : 'npm run setup';
  const dependencies = JSON.parse(
    fs.readFileSync(path.join(root, 'package.json'), 'utf8'),
  ).dependencies;
  for (const [name, expected] of Object.entries(dependencies)) {
    let installed;
    try {
      installed = JSON.parse(
        fs.readFileSync(path.join(directory, 'node_modules', name, 'package.json'), 'utf8'),
      ).version;
    } catch {
      throw Error(`Missing runtime dependency ${name}. Run ${recovery}.`);
    }
    if (installed !== expected)
      throw Error(
        `Stale runtime dependency ${name}: expected ${expected}, found ${installed}. Run ${recovery}.`,
      );
  }
  selected = createRequire(path.join(directory, 'package.json'));
  return selected;
}

module.exports = (name) => runtime()(name);
module.exports.resolve = (name) => runtime().resolve(name);
