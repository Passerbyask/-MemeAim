const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const out = path.join(root, 'dist');
fs.mkdirSync(out, { recursive: true });
for (const file of ['index.html', 'styles.css', 'app.js', 'core.mjs', 'weapon.js', 'meme-effects.mjs', 'gamepad.mjs']) {
  fs.copyFileSync(path.join(root, file), path.join(out, file));
}
fs.cpSync(path.join(root, 'effects'), path.join(out, 'effects'), { recursive: true });
const vendor = path.join(out, 'vendor');
fs.mkdirSync(vendor, { recursive: true });
for (const file of ['three.module.js', 'three.core.js']) {
  fs.copyFileSync(path.join(root, 'node_modules/three/build', file), path.join(vendor, file));
}
fs.copyFileSync(path.join(root, 'node_modules/three/LICENSE'), path.join(vendor, 'THREE-LICENSE.txt'));

// Reuse upstream assets without duplicating audio files in the source tree.
const sounds = path.resolve(root, '../sounds');
const outputSounds = path.join(out, 'sounds');
fs.mkdirSync(outputSounds, { recursive: true });
const manifest = { hit: [], miss: [] };
for (const group of Object.keys(manifest)) {
  const source = path.join(sounds, group);
  const destination = path.join(outputSounds, group);
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isFile() || !/\.(mp3|wav|ogg)$/i.test(entry.name)) continue;
    fs.copyFileSync(path.join(source, entry.name), path.join(destination, entry.name));
    manifest[group].push({ name: path.parse(entry.name).name, url: `sounds/${group}/${entry.name}` });
  }
}
for (const file of ['w.mp3', 'l.mp3']) {
  if (fs.existsSync(path.join(sounds, file))) fs.copyFileSync(path.join(sounds, file), path.join(outputSounds, file));
}
fs.writeFileSync(path.join(outputSounds, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Built dist/ with ${manifest.hit.length} hit sounds and ${manifest.miss.length} miss sounds.`);
