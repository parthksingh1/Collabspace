// Real Y.js update payloads, captured offline.
//
// k6 runs on a Goja JS runtime with no npm module loading, so it cannot import
// Y.js and produce updates at runtime. Instead these are genuine binary updates
// produced by an actual Y.Doc: each one is a single-character insert into a
// Y.Text that already contains ~45 characters, which is what a keystroke in the
// document editor looks like on the wire (24 bytes).
//
// Regenerate with: node benchmarks/lib/regenerate-fixtures.cjs
//
// Caveat, stated plainly: the load generator replays these bytes, it does not
// run a CRDT. Every VU therefore sends structurally valid updates that carry the
// same client IDs. That is fine for measuring gateway fanout, throughput and
// latency -- which is all these scripts measure -- but it is NOT a test of
// convergence. Convergence is tested with real Y.Doc instances in
// tests/integration/crdt-convergence.test.ts.

export const YJS_UPDATES = [
  [1,1,171,195,181,248,1,45,196,171,195,181,248,1,20,171,195,181,248,1,21,1,97,0],
  [1,1,145,244,219,233,9,45,196,145,244,219,233,9,36,145,244,219,233,9,37,1,98,0],
  [1,1,137,146,246,249,3,45,196,137,146,246,249,3,29,137,146,246,249,3,30,1,99,0],
  [1,1,161,156,128,216,5,45,196,161,156,128,216,5,16,161,156,128,216,5,17,1,100,0],
  [1,1,169,251,245,149,11,45,196,169,251,245,149,11,36,169,251,245,149,11,37,1,101,0],
  [1,1,137,234,141,144,15,45,196,137,234,141,144,15,11,137,234,141,144,15,12,1,102,0],
  [1,1,164,185,209,231,12,45,196,164,185,209,231,12,26,164,185,209,231,12,27,1,103,0],
  [1,1,226,149,245,162,11,45,196,226,149,245,162,11,15,226,149,245,162,11,16,1,104,0],
  [1,1,140,143,253,137,8,45,196,140,143,253,137,8,35,140,143,253,137,8,36,1,105,0],
  [1,1,135,191,208,137,9,45,196,135,191,208,137,9,0,135,191,208,137,9,1,1,106,0],
  [1,1,163,163,250,232,12,45,196,163,163,250,232,12,8,163,163,250,232,12,9,1,107,0],
  [1,1,145,142,162,219,4,45,196,145,142,162,219,4,23,145,142,162,219,4,24,1,108,0],
];

export function randomUpdate() {
  return YJS_UPDATES[Math.floor(Math.random() * YJS_UPDATES.length)];
}
