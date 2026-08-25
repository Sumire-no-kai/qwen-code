import { buildCallIdToSkillName, resolveLoadedSkillNames, buildSkillLlmContent } from '../head/packages/core/dist/src/tools/skill-utils.js';

function makeHistory(n, skills = 12) {
  const h = [];
  for (let i = 0; i < n; i++) {
    if (i % 40 === 0) {
      const s = `skill-${(i / 40) % skills}`;
      h.push({ role: 'model', parts: [{ functionCall: { id: `c${i}`, name: 'skill', args: { skill: s } } }] });
      h.push({ role: 'user', parts: [{ functionResponse: { id: `c${i}`, name: 'skill', response: { output: buildSkillLlmContent('/tmp/x', 'body '.repeat(200)) } } }] });
    } else if (i % 3 === 0) {
      h.push({ role: 'model', parts: [{ functionCall: { id: `r${i}`, name: 'read_file', args: { file_path: `/tmp/f${i}` } } }] });
      h.push({ role: 'user', parts: [{ functionResponse: { id: `r${i}`, name: 'read_file', response: { output: 'x'.repeat(2000) } } }] });
    } else {
      h.push({ role: 'model', parts: [{ text: 'lorem '.repeat(100) }] });
    }
  }
  return h;
}

for (const n of [200, 1000, 4000]) {
  const h = makeHistory(n);
  const genuine = new Set(
    h.flatMap((c) => (c.parts ?? []).map((p) => p.functionResponse?.response?.output)).filter(
      (o) => typeof o === 'string' && o.startsWith('Base directory for this skill:'),
    ),
  );
  // warm
  for (let i = 0; i < 3; i++) resolveLoadedSkillNames(h, h, genuine);
  const t0 = process.hrtime.bigint();
  const iters = 50;
  for (let i = 0; i < iters; i++) resolveLoadedSkillNames(h, h, genuine);
  const t1 = process.hrtime.bigint();
  const perCall = Number(t1 - t0) / iters / 1e6;
  const chars = JSON.stringify(h).length;
  console.log(
    `entries=${h.length.toString().padStart(6)}  history≈${(chars / 1024 / 1024).toFixed(1)}MB  ` +
      `resolveLoadedSkillNames = ${perCall.toFixed(3)} ms/call  resident=${resolveLoadedSkillNames(h, h, genuine).length}`,
  );
}
