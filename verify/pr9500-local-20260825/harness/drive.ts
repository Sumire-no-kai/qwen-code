/**
 * PR 9500 verification driver.
 *
 * Runs the real qwen TUI (node-pty + xterm.js screenshots) against a fake
 * OpenAI-compatible provider, walks a skill through an eviction, then
 * re-invokes it. The judge is the wire ledger: what tool-result content the
 * CLI actually sends back to the model for the second Skill invocation.
 *
 * Usage: tsx drive.ts <arm-label> <bundleDir> <fixtureDir> <outDir> <mode>
 *   mode = "auto"   -> idle-threshold microcompaction fires by itself
 *   mode = "manual" -> user types /compress-fast
 */
import { TerminalCapture } from '../head/integration-tests/terminal-capture/terminal-capture.js';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const [arm, bundleDir, fixtureDir, outDir, mode] = process.argv.slice(2);
const NODE = process.execPath;
const HARNESS = new URL('.', import.meta.url).pathname;

mkdirSync(outDir, { recursive: true });
const ledger = join(outDir, 'wire-ledger.jsonl');

function startFakeModel(): Promise<{ baseUrl: string; kill: () => void }> {
  return new Promise((resolve, reject) => {
    const p = spawn(NODE, [join(HARNESS, 'fake-model.mjs')], {
      env: {
        ...process.env,
        LEDGER: ledger,
        PORT: '0',
        FILLER_FILE: join(fixtureDir, 'data', 'filler.txt'),
        FILLER_FILE2: join(fixtureDir, 'data', 'filler2.txt'),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let buf = '';
    p.stdout.on('data', (d) => {
      buf += d.toString();
      const m = buf.match(/FAKE_MODEL_READY (\S+)/);
      if (m) resolve({ baseUrl: m[1], kill: () => p.kill('SIGKILL') });
    });
    p.stderr.on('data', (d) => process.stderr.write(`[fake] ${d}`));
    setTimeout(() => reject(new Error('fake model did not start')), 10000);
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const fake = await startFakeModel();
  const home = join(fixtureDir, 'home');
  const env: NodeJS.ProcessEnv = {
    PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
    HOME: home,
    QWEN_HOME: join(home, '.qwen'),
    QWEN_RUNTIME_DIR: join(home, '.qwen'),
    QWEN_SANDBOX: 'false',
    QWEN_CODE_NO_RELAUNCH: 'true',
    QWEN_CODE_SUPPRESS_YOLO_WARNING: '1',
    NO_PROXY: '127.0.0.1,localhost',
    no_proxy: '127.0.0.1,localhost',
    OPENAI_API_KEY: 'fake-key',
    OPENAI_BASE_URL: fake.baseUrl,
    OPENAI_MODEL: 'fake-model',
    QWEN_MODEL: 'fake-model',
    QWEN_MC_KEEP_RECENT: '1',
    TERM: 'xterm-256color',
    FORCE_COLOR: '1',
    NODE_NO_WARNINGS: '1',
    LANG: 'en_US.UTF-8',
  };

  const t = await TerminalCapture.create({
    cols: 110,
    rows: 34,
    cwd: fixtureDir,
    env,
    theme: 'dracula',
    chrome: true,
    title: `qwen-code — ${arm}`,
    outputDir: outDir,
  });

  await t.spawn(NODE, [
    join(bundleDir, 'cli.js'),
    '--yolo',
    '--auth-type',
    'openai',
    '--model',
    'fake-model',
    '--openai-base-url',
    fake.baseUrl,
    '--openai-api-key',
    'fake-key',
  ]);

  await t.waitFor('Type your message', { timeout: 60000 });
  await t.idle(1200, 20000);

  // Turn 1 — load the skill for the first time.
  await t.type('PROBE1 load the demo skill\n');
  await t.idle(2500, 90000);
  await t.capture('01-skill-loaded.png');

  if (mode !== 'control') {
    // Turn 2 — one more compactable tool result so the skill body is no
    // longer inside the keepRecent window.
    await t.type('FILLER read the filler file\n');
    await t.idle(2500, 90000);
    await t.capture('02-filler.png');
  }

  if (mode === 'manual' || mode === 'context') {
    await t.type('/compress-fast\n');
    await t.idle(2500, 90000);
    await t.capture('03-compressed.png');
  }

  if (mode === 'context') {
    await t.type('/context detail\n');
    await t.idle(2500, 90000);
    await t.capture('03b-context.png');
    writeFileSync(join(outDir, 'context-screen.txt'), await t.getScreenText());
    writeFileSync(join(outDir, 'context-full.txt'), t.getOutput());
  }

  // Turn 3 — re-invoke the same skill after its body was evicted.
  await t.type('PROBE2 load the demo skill again\n');
  await t.idle(2500, 90000);
  await t.capture('04-reinvoke.png');

  if (mode === 'hooks') {
    // Second read_file AFTER the skill reload: the PostToolUse hook the
    // skill registers must fire exactly once more, not once per load cycle.
    await t.type('FILLER2 read the filler file again\n');
    await t.idle(3000, 90000);
    await t.capture('05-post-reload-tool.png');
  }
  const screen = await t.getScreenText();
  writeFileSync(join(outDir, 'final-screen.txt'), screen);
  writeFileSync(join(outDir, 'raw-output.ans'), t.getRawOutput());

  await t.close();
  fake.kill();
  await sleep(300);

  // ---- Judge: read the wire ledger ----
  const lines = existsSync(ledger)
    ? readFileSync(ledger, 'utf8').split('\n').filter(Boolean)
    : [];
  const records = lines.map((l) => JSON.parse(l));
  const findToolContent = (callId: string): string | null => {
    for (const r of records) {
      for (const m of r.body.messages ?? []) {
        if (m.role === 'tool' && m.tool_call_id === callId) {
          return typeof m.content === 'string'
            ? m.content
            : JSON.stringify(m.content);
        }
      }
    }
    return null;
  };
  const lastRecord = records[records.length - 1];
  const probe1 = findToolContent('call_probe1');
  const probe2 = findToolContent('call_probe2');
  const probe1Final = (() => {
    // Content of call_probe1 as seen in the LAST request (post-eviction).
    for (const m of lastRecord?.body?.messages ?? []) {
      if (m.role === 'tool' && m.tool_call_id === 'call_probe1') {
        return typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
      }
    }
    return null;
  })();

  const verdict = {
    arm,
    mode,
    requests: records.length,
    probe1_first_seen: probe1?.slice(0, 120) ?? null,
    probe1_in_last_request: probe1Final?.slice(0, 120) ?? null,
    probe1_body_evicted:
      probe1Final !== null && !probe1Final.includes('MARKER-DEMO-SKILL-BODY-7F3A'),
    probe2_content: probe2,
    probe2_returned_full_body: !!probe2?.includes('MARKER-DEMO-SKILL-BODY-7F3A'),
    probe2_returned_already_loaded: !!probe2?.includes('is already loaded in context'),
  };
  if (mode === 'hooks') {
    const hookLog = join(fixtureDir, 'hook-fires.log');
    const fires = existsSync(hookLog)
      ? readFileSync(hookLog, 'utf8').split('\n').filter(Boolean).length
      : 0;
    (verdict as Record<string, unknown>)['hook_fires_total'] = fires;
    (verdict as Record<string, unknown>)['hook_fires_expected'] = 2;
  }
  writeFileSync(join(outDir, 'verdict.json'), JSON.stringify(verdict, null, 2));
  console.log(JSON.stringify(verdict, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
