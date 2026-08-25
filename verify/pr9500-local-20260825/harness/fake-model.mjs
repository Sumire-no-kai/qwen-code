// Standalone fake OpenAI-compatible server for PR 9500 verification.
// Classifies by the LAST user message marker; records every request body.
import { createServer } from 'node:http';
import { appendFileSync, writeFileSync } from 'node:fs';

const LEDGER = process.env.LEDGER;
const PORT = Number(process.env.PORT || 0);
writeFileSync(LEDGER, '');

let seq = 0;

function lastUserText(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role === 'user') {
      if (typeof m.content === 'string') return m.content;
      if (Array.isArray(m.content))
        return m.content.map((p) => p?.text ?? '').join('\n');
      return '';
    }
  }
  return '';
}

function decide(body) {
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const last = messages[messages.length - 1];
  if (last?.role === 'tool') {
    return { text: 'TOOL-RESULT-ACK' };
  }
  const text = lastUserText(messages);
  if (text.includes('PROBE1')) {
    return {
      toolCalls: [
        { id: 'call_probe1', type: 'function', function: { name: 'skill', arguments: JSON.stringify({ skill: 'demo-skill' }) } },
      ],
    };
  }
  if (text.includes('FILLER2')) {
    return {
      toolCalls: [
        { id: 'call_filler2', type: 'function', function: { name: 'read_file', arguments: JSON.stringify({ file_path: process.env.FILLER_FILE2 }) } },
      ],
    };
  }
  if (text.includes('FILLER')) {
    return {
      toolCalls: [
        { id: 'call_filler', type: 'function', function: { name: 'read_file', arguments: JSON.stringify({ file_path: process.env.FILLER_FILE }) } },
      ],
    };
  }
  if (text.includes('PROBE2')) {
    return {
      toolCalls: [
        { id: 'call_probe2', type: 'function', function: { name: 'skill', arguments: JSON.stringify({ skill: 'demo-skill' }) } },
      ],
    };
  }
  return { text: 'OK-NOOP' };
}

function sseChunk(obj) {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

const server = createServer(async (req, res) => {
  if (req.method !== 'POST' || !req.url?.includes('/chat/completions')) {
    res.writeHead(404).end('nf');
    return;
  }
  let raw = '';
  for await (const c of req) raw += c;
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    res.writeHead(400).end('bad');
    return;
  }
  const idx = seq++;
  appendFileSync(
    LEDGER,
    JSON.stringify({ idx, ts: Date.now(), stream: body.stream === true, body }) + '\n',
  );

  if (body.stream !== true) {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        id: `nc-${idx}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: body.model ?? 'fake-model',
        choices: [{ index: 0, message: { role: 'assistant', content: '{"selected_memories":[]}' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 100, completion_tokens: 5, total_tokens: 105 },
      }),
    );
    return;
  }

  const plan = decide(body);
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  });
  const id = `chatcmpl-${idx}`;
  const base = { id, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model: body.model ?? 'fake-model' };
  res.write(sseChunk({ ...base, choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }] }));
  if (plan.toolCalls) {
    plan.toolCalls.forEach((tc, i) => {
      res.write(
        sseChunk({
          ...base,
          choices: [{ index: 0, delta: { tool_calls: [{ index: i, id: tc.id, type: 'function', function: { name: tc.function.name, arguments: tc.function.arguments } }] }, finish_reason: null }],
        }),
      );
    });
    res.write(sseChunk({ ...base, choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 1000, completion_tokens: 20, total_tokens: 1020 } }));
  } else {
    for (const piece of String(plan.text).match(/.{1,8}/g) ?? []) {
      res.write(sseChunk({ ...base, choices: [{ index: 0, delta: { content: piece }, finish_reason: null }] }));
    }
    res.write(sseChunk({ ...base, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 1000, completion_tokens: 10, total_tokens: 1010 } }));
  }
  res.write('data: [DONE]\n\n');
  res.end();
});

server.listen(PORT, '127.0.0.1', () => {
  const addr = server.address();
  console.log(`FAKE_MODEL_READY http://127.0.0.1:${addr.port}/v1`);
});
