import { microcompactHistory } from '../head/packages/core/dist/src/services/microcompaction/microcompact.js';
import { buildSkillLlmContent } from '../head/packages/core/dist/src/tools/skill-utils.js';

function makeHistory(n) {
  const h = [];
  const genuine = new Set();
  for (let i = 0; i < n; i++) {
    if (i % 40 === 0) {
      const body = buildSkillLlmContent('/tmp/x', `body-${i} ` + 'z'.repeat(1500));
      genuine.add(body);
      h.push({ role: 'model', parts: [{ functionCall: { id: `c${i}`, name: 'skill', args: { skill: `skill-${i % 12}` } } }] });
      h.push({ role: 'user', parts: [{ functionResponse: { id: `c${i}`, name: 'skill', response: { output: body } } }] });
    } else {
      h.push({ role: 'model', parts: [{ functionCall: { id: `r${i}`, name: 'read_file', args: { file_path: `/tmp/f${i}` } } }] });
      h.push({ role: 'user', parts: [{ functionResponse: { id: `r${i}`, name: 'read_file', response: { output: 'x'.repeat(2000) } } }] });
    }
  }
  return { h, genuine };
}

for (const n of [500, 2000]) {
  const { h, genuine } = makeHistory(n);
  const opts = { force: true, genuineSkillBodyOutputs: genuine };
  for (let i = 0; i < 2; i++) microcompactHistory(h, null, { toolResultsNumToKeep: 5 }, opts);
  const iters = 10;
  const t0 = process.hrtime.bigint();
  let last;
  for (let i = 0; i < iters; i++) last = microcompactHistory(h, null, { toolResultsNumToKeep: 5 }, opts);
  const t1 = process.hrtime.bigint();
  console.log(
    `entries=${h.length}  ~${(JSON.stringify(h).length / 1024 / 1024).toFixed(1)}MB  ` +
      `microcompactHistory = ${(Number(t1 - t0) / iters / 1e6).toFixed(1)} ms/pass  ` +
      `cleared=${last.meta.toolsCleared} evictedSkillNames=${last.meta.evictedSkillNames.length}`,
  );
}
