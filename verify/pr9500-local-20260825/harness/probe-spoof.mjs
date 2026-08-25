/**
 * Re-runs the two blockers raised in the prior independent review
 * (head 6f085bd9e1) against the CURRENT PR head, using the real built
 * production functions.
 *
 *  Blocker 1: "a newer same-named command result containing the two public
 *              marker strings is accepted as a real resident Skill body"
 *  Blocker 2: "post-setHistory double sync degrades ground truth"
 */
import { microcompactHistory } from '../head/packages/core/dist/src/services/microcompaction/microcompact.js';
import {
  buildSkillLlmContent,
  reconcileLoadedSkillTracking,
  isProvenSkillBody,
} from '../head/packages/core/dist/src/tools/skill-utils.js';
import * as skillUtils from '../head/packages/core/dist/src/tools/skill-utils.js';

const SKILL_DIR = '/tmp/skills/demo';
const genuineBody = buildSkillLlmContent(SKILL_DIR, '# Demo\n\nREAL-BODY-MARKER\n');
// A command-delegation / third-party output that merely COPIES both public
// marker strings. Byte-for-byte marker-compatible, different content.
const spoofBody = buildSkillLlmContent(SKILL_DIR, '# Not a skill body\n\nSPOOFED\n');

function history() {
  return [
    { role: 'model', parts: [{ functionCall: { id: 'c1', name: 'skill', args: { skill: 'demo' } } }] },
    { role: 'user', parts: [{ functionResponse: { id: 'c1', name: 'skill', response: { output: genuineBody } } }] },
    { role: 'model', parts: [{ functionCall: { id: 'c2', name: 'skill', args: { skill: 'demo' } } }] },
    { role: 'user', parts: [{ functionResponse: { id: 'c2', name: 'skill', response: { output: spoofBody } } }] },
  ];
}

// Provenance = exactly what SkillTool actually produced this process.
const genuineOutputs = new Set([genuineBody]);

function fakeRegistry(tracked, genuine) {
  const set = new Set(tracked);
  const tool = {
    unloadSkills: (n) => { for (const x of n) set.delete(x); },
    clearLoadedSkills: () => set.clear(),
    trackSkills: (n) => { for (const x of n) set.add(x); },
    getGenuineSkillBodyOutputs: () => genuine,
  };
  return { registry: { getTool: (name) => (name === 'skill' ? tool : undefined) }, set };
}

function run(label, genuine) {
  const h = history();
  const res = microcompactHistory(h, null, { toolResultsNumToKeep: 1 }, {
    force: true,
    genuineSkillBodyOutputs: genuine,
  });
  const { registry, set } = fakeRegistry(['demo'], genuine);
  reconcileLoadedSkillTracking(res.history, registry, 'probe');
  console.log(
    `${label}\n` +
    `  spoof classified as resident body : ${isProvenSkillBody(spoofBody, genuine)}\n` +
    `  toolsCleared                      : ${res.meta.toolsCleared}\n` +
    `  evictedSkillNames                 : ${JSON.stringify(res.meta.evictedSkillNames)}\n` +
    `  tracking after reconcile          : ${JSON.stringify([...set])}\n` +
    `  genuine body still in history     : ${JSON.stringify(res.history[1].parts[0].functionResponse.response.output).slice(0, 60)}`,
  );
  return { evicted: res.meta.evictedSkillNames, tracked: [...set] };
}

console.log('=== Blocker 1: residency-marker spoofing ===\n');
const withProvenance = run('CURRENT HEAD (provenance-gated):', genuineOutputs);
const withoutProvenance = run('\nPROVENANCE DISABLED (the reviewed 6f085bd9e1 behaviour):', undefined);

console.log('\n=== Blocker 2: post-setHistory double sync ===');
console.log(
  `  skill-utils exports syncSkillEvictions : ${'syncSkillEvictions' in skillUtils}`,
);

console.log('\n=== VERDICT ===');
console.log(
  `  B1 fixed : ${withProvenance.evicted.includes('demo') && withProvenance.tracked.length === 0 &&
    !withoutProvenance.evicted.includes('demo') && withoutProvenance.tracked.includes('demo')}`,
);
console.log(`  B2 fixed : ${!('syncSkillEvictions' in skillUtils)}`);
