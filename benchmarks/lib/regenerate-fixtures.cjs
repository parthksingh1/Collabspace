const Y = require('yjs');
const out = [];
for (let i = 0; i < 12; i++) {
  const doc = new Y.Doc();
  const t = doc.getText('default');
  t.insert(0, 'The quick brown fox jumps over the lazy dog. ');
  let upd = null;
  doc.on('update', (u) => { upd = u; });
  t.insert(Math.floor(Math.random() * 40), 'abcdefghijklmnopqrstuvwxyz'[i % 26]);
  out.push(Array.from(upd));
}
console.log(JSON.stringify(out));
// Usage: node benchmarks/lib/regenerate-fixtures.cjs > /tmp/fixtures.json
// then re-run the emit step described in benchmarks/lib/yjs-fixtures.js.
