// Builds data/wiki-spawns.json (the copy shipped with the app) from the community wiki's wiki.json.
// The app also does this by itself while it runs (see wiki-updater.js); this is for refreshing the shipped copy by hand.
// Usage: node tools/build-spawns.js path/to/wiki.json
const fs = require('fs'), path = require('path');
const { build, looksLikeWiki } = require('../spawns-build');
const wikiFile = process.argv[2];
if (!wikiFile) { console.error('usage: node tools/build-spawns.js path/to/wiki.json'); process.exit(1); }
const W = JSON.parse(fs.readFileSync(wikiFile, 'utf8'));
if (!looksLikeWiki(W)) { console.error('that does not look like the wiki data file'); process.exit(1); }
const root = path.join(__dirname, '..');
const names = JSON.parse(fs.readFileSync(path.join(root, 'species.json'), 'utf8'));
try { Object.assign(names, JSON.parse(fs.readFileSync(path.join(root, 'species-extra.json'), 'utf8'))); } catch {}
try { Object.assign(names, JSON.parse(fs.readFileSync(path.join(process.env.APPDATA || '', 'pt-journal', 'species-custom.json'), 'utf8'))); } catch {}
const { out, missing } = build(W, names);
fs.mkdirSync(path.join(root, 'data'), { recursive: true });
fs.writeFileSync(path.join(root, 'data', 'wiki-spawns.json'), JSON.stringify(out));
console.log('places', Object.keys(out.places).length, 'rare tiers', out.rare.map(t => t[0] + ':' + t[1].length).join(' '), 'species not matched by name:', missing.length ? missing.join(', ') : 'none');
