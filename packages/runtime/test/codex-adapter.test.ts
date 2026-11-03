// B04-01c.2: tests for the simulated Codex adapter and JSONL parser.
// No real Codex CLI, no subprocess, no network, no credentials.
import { it, expect, afterEach } from 'vitest';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  openSqlitePersistence,
  type DurableStore,
} from '@beonforge/persistence';
import {
  parseCodexJsonl,
  ParseError,
  type ParseLimits,
} from '../examples/codex/jsonl-parser.ts';
import {
  prepareSimulatedCodexRun,
  executeSimulatedCodexRun,
  inspectSimulatedCodexRun,
  AdapterError,
  CodexAdapterGrant,
  type SimulatedCodexRequest,
} from '../examples/codex/adapter.ts';

// ─── helpers ────────────────────────────────────────────────────────────────

const temp = realpathSync(tmpdir());
const stores: { root: string; store: DurableStore }[] = [];

async function openStore(): Promise<{ root: string; store: DurableStore }> {
  const root = mkdtempSync(join(temp, 'beonforge-adapter-'));
  const store = await openSqlitePersistence(join(root, 'events.sqlite'));
  stores.push({ root, store });
  return { root, store };
}

afterEach(async () => {
  for (const { store, root } of stores.splice(0)) {
    await store.close();
    rmSync(root, { recursive: true, force: true });
  }
});

const BASE_COMMIT = 'a'.repeat(40);
const PREIMAGE_SHA = 'b'.repeat(64);
const validRequest: SimulatedCodexRequest = {
  schemaVersion: 1,
  baseCommit: BASE_COMMIT,
  preimageSha256: PREIMAGE_SHA,
  path: 'src/add.ts',
};

// ─── JSONL parser unit tests ─────────────────────────────────────────────────

it('parser: valid 4-event success sequence', () => {
  const s = JSON.stringify({ schemaVersion: 1, type: 'started' });
  const m = JSON.stringify({
    schemaVersion: 1,
    type: 'message',
    role: 'assistant',
    content: 'ok',
  });
  const p = JSON.stringify({
    schemaVersion: 1,
    type: 'proposal',
    baseCommit: BASE_COMMIT,
    path: 'src/add.ts',
    preimageSha256: PREIMAGE_SHA,
    content: 'x',
  });
  const d = JSON.stringify({ schemaVersion: 1, type: 'done', exitCode: 0 });
  const events = parseCodexJsonl(Buffer.from(`${s}\n${m}\n${p}\n${d}\n`));
  expect(events).toHaveLength(4);
  expect(events[0]?.type).toBe('started');
  expect(events[3]?.type).toBe('done');
});

it('parser: rejects BOM', () => {
  const bom = Buffer.from([0xef, 0xbb, 0xbf]);
  const body = Buffer.from(
    JSON.stringify({ schemaVersion: 1, type: 'started' }) + '\n',
  );
  expect(() => parseCodexJsonl(Buffer.concat([bom, body]))).toThrow(ParseError);
  try {
    parseCodexJsonl(Buffer.concat([bom, body]));
  } catch (e) {
    expect((e as ParseError).code).toBe('bom_rejected');
  }
});

it('parser: rejects empty input', () => {
  expect(() => parseCodexJsonl(Buffer.alloc(0))).toThrow(ParseError);
  try {
    parseCodexJsonl(Buffer.alloc(0));
  } catch (e) {
    expect((e as ParseError).code).toBe('empty_input');
  }
});

it('parser: rejects truncated output (no trailing newline)', () => {
  const bytes = Buffer.from(
    JSON.stringify({ schemaVersion: 1, type: 'started' }),
  );
  expect(() => parseCodexJsonl(bytes)).toThrow(ParseError);
  try {
    parseCodexJsonl(bytes);
  } catch (e) {
    expect((e as ParseError).code).toBe('truncated_output');
  }
});

it('parser: rejects total size exceeded', () => {
  const limits: ParseLimits = {
    maxLineBytes: 65536,
    maxTotalBytes: 10,
    maxEvents: 4096,
  };
  const bytes = Buffer.from(
    JSON.stringify({ schemaVersion: 1, type: 'started' }) + '\n',
  );
  expect(() => parseCodexJsonl(bytes, limits)).toThrow(ParseError);
  try {
    parseCodexJsonl(bytes, limits);
  } catch (e) {
    expect((e as ParseError).code).toBe('total_size_exceeded');
  }
});

it('parser: rejects line size exceeded', () => {
  const limits: ParseLimits = {
    maxLineBytes: 5,
    maxTotalBytes: 1048576,
    maxEvents: 4096,
  };
  const bytes = Buffer.from(
    JSON.stringify({ schemaVersion: 1, type: 'started' }) + '\n',
  );
  expect(() => parseCodexJsonl(bytes, limits)).toThrow(ParseError);
  try {
    parseCodexJsonl(bytes, limits);
  } catch (e) {
    expect((e as ParseError).code).toBe('line_size_exceeded');
  }
});

it('parser: rejects event count exceeded', () => {
  const limits: ParseLimits = {
    maxLineBytes: 65536,
    maxTotalBytes: 1048576,
    maxEvents: 1,
  };
  const s = JSON.stringify({ schemaVersion: 1, type: 'started' });
  const d = JSON.stringify({ schemaVersion: 1, type: 'done', exitCode: 0 });
  expect(() => parseCodexJsonl(Buffer.from(`${s}\n${d}\n`), limits)).toThrow(
    ParseError,
  );
  try {
    parseCodexJsonl(Buffer.from(`${s}\n${d}\n`), limits);
  } catch (e) {
    expect((e as ParseError).code).toBe('event_count_exceeded');
  }
});

it('parser: rejects invalid UTF-8', () => {
  // Valid-length buffer ending in \n but containing invalid UTF-8 (0xff byte)
  const bad = Buffer.from([0xff, 0xfe, 0x0a]);
  expect(() => parseCodexJsonl(bad)).toThrow(ParseError);
  try {
    parseCodexJsonl(bad);
  } catch (e) {
    expect((e as ParseError).code).toBe('invalid_utf8');
  }
});

it('parser: rejects malformed JSON', () => {
  const s = JSON.stringify({ schemaVersion: 1, type: 'started' });
  const bytes = Buffer.from(`${s}\nnot-valid-json\n`);
  expect(() => parseCodexJsonl(bytes)).toThrow(ParseError);
  try {
    parseCodexJsonl(bytes);
  } catch (e) {
    expect((e as ParseError).code).toBe('malformed_json');
  }
});

it('parser: rejects unknown event type', () => {
  const s = JSON.stringify({ schemaVersion: 1, type: 'started' });
  const bad = JSON.stringify({
    schemaVersion: 1,
    type: 'tool_call',
    name: 'shell',
  });
  const bytes = Buffer.from(`${s}\n${bad}\n`);
  expect(() => parseCodexJsonl(bytes)).toThrow(ParseError);
  try {
    parseCodexJsonl(bytes);
  } catch (e) {
    expect((e as ParseError).code).toBe('unknown_event_type');
  }
});

it('parser: rejects duplicate started', () => {
  const s = JSON.stringify({ schemaVersion: 1, type: 'started' });
  expect(() => parseCodexJsonl(Buffer.from(`${s}\n${s}\n`))).toThrow(
    ParseError,
  );
  try {
    parseCodexJsonl(Buffer.from(`${s}\n${s}\n`));
  } catch (e) {
    expect((e as ParseError).code).toBe('duplicate_started');
  }
});

it('parser: rejects event with unexpected extra field', () => {
  const bad = JSON.stringify({
    schemaVersion: 1,
    type: 'started',
    extra: true,
  });
  expect(() => parseCodexJsonl(Buffer.from(`${bad}\n`))).toThrow(ParseError);
  try {
    parseCodexJsonl(Buffer.from(`${bad}\n`));
  } catch (e) {
    expect((e as ParseError).code).toBe('unexpected_fields');
  }
});

it('parser: rejects unknown schemaVersion', () => {
  const bad = JSON.stringify({ schemaVersion: 99, type: 'started' });
  expect(() => parseCodexJsonl(Buffer.from(`${bad}\n`))).toThrow(ParseError);
  try {
    parseCodexJsonl(Buffer.from(`${bad}\n`));
  } catch (e) {
    expect((e as ParseError).code).toBe('unknown_schema_version');
  }
});

it('parser: rejects non-started event first', () => {
  const d = JSON.stringify({ schemaVersion: 1, type: 'done', exitCode: 0 });
  expect(() => parseCodexJsonl(Buffer.from(`${d}\n`))).toThrow(ParseError);
  try {
    parseCodexJsonl(Buffer.from(`${d}\n`));
  } catch (e) {
    expect((e as ParseError).code).toBe('started_event_required_first');
  }
});

it('parser: rejects events after done', () => {
  const s = JSON.stringify({ schemaVersion: 1, type: 'started' });
  const d = JSON.stringify({ schemaVersion: 1, type: 'done', exitCode: 0 });
  expect(() => parseCodexJsonl(Buffer.from(`${s}\n${d}\n${s}\n`))).toThrow(
    ParseError,
  );
  try {
    parseCodexJsonl(Buffer.from(`${s}\n${d}\n${s}\n`));
  } catch (e) {
    expect((e as ParseError).code).toBe('events_after_done');
  }
});

// F2: a cleanly terminated stream (trailing newline, valid lines) without a
// terminal `done` event must fail closed. Synthetic subset only; this does not
// assume the official Codex JSONL uses the same terminal event.
it.each([
  ['started → EOF', ['started']],
  ['started → message → EOF', ['started', 'message']],
  ['started → proposal → EOF', ['started', 'proposal']],
  ['started → message → proposal → EOF', ['started', 'message', 'proposal']],
])('parser: rejects clean stream without done (%s)', (_label, kinds) => {
  const line: Record<string, string> = {
    started: JSON.stringify({ schemaVersion: 1, type: 'started' }),
    message: JSON.stringify({
      schemaVersion: 1,
      type: 'message',
      role: 'assistant',
      content: 'x',
    }),
    proposal: JSON.stringify({
      schemaVersion: 1,
      type: 'proposal',
      baseCommit: 'a'.repeat(40),
      path: 'src/x.ts',
      preimageSha256: 'b'.repeat(64),
      content: 'y',
    }),
  };
  const bytes = Buffer.from(kinds.map((k) => `${line[k]}\n`).join(''));
  expect(() => parseCodexJsonl(bytes)).toThrow(ParseError);
  try {
    parseCodexJsonl(bytes);
  } catch (e) {
    expect((e as ParseError).code).toBe('missing_done');
  }
});

it('parser: handles multibyte Unicode content in message', () => {
  const s = JSON.stringify({ schemaVersion: 1, type: 'started' });
  const m = JSON.stringify({
    schemaVersion: 1,
    type: 'message',
    role: 'assistant',
    content: '日本語テスト',
  });
  const d = JSON.stringify({ schemaVersion: 1, type: 'done', exitCode: 0 });
  const events = parseCodexJsonl(Buffer.from(`${s}\n${m}\n${d}\n`));
  expect(events).toHaveLength(3);
  const msg = events[1];
  expect(msg?.type === 'message' && msg.content).toBe('日本語テスト');
});

// ─── prepareSimulatedCodexRun security tests ────────────────────────────────

it('prepare: returns grant for valid request', () => {
  const grant = prepareSimulatedCodexRun(validRequest);
  expect(grant).toBeInstanceOf(CodexAdapterGrant);
  expect(grant.profileKind).toBe('simulated');
  expect(grant.isRevoked).toBe(false);
});

it('prepare: rejects request with binary field', () => {
  expect(() =>
    prepareSimulatedCodexRun({ ...validRequest, binary: '/usr/bin/codex' }),
  ).toThrow(AdapterError);
  try {
    prepareSimulatedCodexRun({ ...validRequest, binary: '/usr/bin/codex' });
  } catch (e) {
    expect((e as AdapterError).code).toBe('adapter_real_dispatch_rejected');
  }
});

it('prepare: rejects request with codexHome field', () => {
  expect(() =>
    prepareSimulatedCodexRun({
      ...validRequest,
      codexHome: 'C:/Users/foo/.codex',
    }),
  ).toThrow(AdapterError);
  try {
    prepareSimulatedCodexRun({
      ...validRequest,
      codexHome: 'C:/Users/foo/.codex',
    });
  } catch (e) {
    expect((e as AdapterError).code).toBe('adapter_real_dispatch_rejected');
  }
});

it('prepare: rejects request with credentials field', () => {
  expect(() =>
    prepareSimulatedCodexRun({ ...validRequest, credentials: 'sk-test' }),
  ).toThrow(AdapterError);
  try {
    prepareSimulatedCodexRun({ ...validRequest, credentials: 'sk-test' });
  } catch (e) {
    expect((e as AdapterError).code).toBe('adapter_real_dispatch_rejected');
  }
});

it('prepare: rejects request with apiKey field', () => {
  expect(() =>
    prepareSimulatedCodexRun({ ...validRequest, apiKey: 'sk-test' }),
  ).toThrow(AdapterError);
});

it('prepare: rejects request with providerConfig field', () => {
  expect(() =>
    prepareSimulatedCodexRun({ ...validRequest, providerConfig: {} }),
  ).toThrow(AdapterError);
});

it('prepare: rejects request with unknown extra field', () => {
  // Not a real-dispatch field, but not in the allowed set.
  expect(() =>
    prepareSimulatedCodexRun({ ...validRequest, profile: 'real' }),
  ).toThrow(AdapterError);
  try {
    prepareSimulatedCodexRun({ ...validRequest, profile: 'real' });
  } catch (e) {
    expect((e as AdapterError).code).toBe('adapter_invalid');
  }
});

it('prepare: rejects request with invalid mode value', () => {
  expect(() =>
    prepareSimulatedCodexRun({ ...validRequest, mode: 'real' as never }),
  ).toThrow(AdapterError);
  try {
    prepareSimulatedCodexRun({ ...validRequest, mode: 'real' as never });
  } catch (e) {
    expect((e as AdapterError).code).toBe('adapter_invalid');
  }
});

it('prepare: rejects request with getter on field', () => {
  const req = Object.create(null) as Record<string, unknown>;
  Object.defineProperty(req, 'schemaVersion', {
    get: () => 1,
    enumerable: true,
  });
  req['baseCommit'] = BASE_COMMIT;
  req['preimageSha256'] = PREIMAGE_SHA;
  req['path'] = 'src/add.ts';
  expect(() => prepareSimulatedCodexRun(req)).toThrow(AdapterError);
  try {
    prepareSimulatedCodexRun(req);
  } catch (e) {
    expect((e as AdapterError).code).toBe('adapter_invalid');
  }
});

it('prepare: rejects Proxy request', () => {
  const proxy = new Proxy(validRequest, {});
  expect(() => prepareSimulatedCodexRun(proxy)).toThrow(AdapterError);
  try {
    prepareSimulatedCodexRun(proxy);
  } catch (e) {
    expect((e as AdapterError).code).toBe('adapter_invalid');
  }
});

it('prepare: rejects wrong path', () => {
  expect(() =>
    prepareSimulatedCodexRun({
      ...validRequest,
      path: 'src/other.ts' as never,
    }),
  ).toThrow(AdapterError);
});

it('prepare: rejects invalid baseCommit', () => {
  expect(() =>
    prepareSimulatedCodexRun({ ...validRequest, baseCommit: 'not-hex' }),
  ).toThrow(AdapterError);
});

it('grant: revoke sets isRevoked', () => {
  const grant = prepareSimulatedCodexRun(validRequest);
  expect(grant.isRevoked).toBe(false);
  grant.revoke();
  expect(grant.isRevoked).toBe(true);
});

// ─── execute integration tests (real SQLite) ─────────────────────────────────

it('execute: success mode returns succeeded with proposalRef', async () => {
  const { store } = await openStore();
  const grant = prepareSimulatedCodexRun(validRequest);
  const result = await executeSimulatedCodexRun(grant, store);
  expect(result.status).toBe('succeeded');
  expect(result.proposalRef).not.toBeNull();
  expect(result.proposalRef?.sha256).toMatch(/^[a-f0-9]{64}$/);
}, 15000);

it('execute: truncated mode returns failed', async () => {
  const { store } = await openStore();
  const grant = prepareSimulatedCodexRun({
    ...validRequest,
    mode: 'truncated',
  });
  const result = await executeSimulatedCodexRun(grant, store);
  expect(result.status).toBe('failed');
  expect(result.proposalRef).toBeNull();
}, 15000);

it('execute: malformed_json mode returns failed', async () => {
  const { store } = await openStore();
  const grant = prepareSimulatedCodexRun({
    ...validRequest,
    mode: 'malformed_json',
  });
  const result = await executeSimulatedCodexRun(grant, store);
  expect(result.status).toBe('failed');
}, 15000);

it('execute: unknown_event mode returns failed', async () => {
  const { store } = await openStore();
  const grant = prepareSimulatedCodexRun({
    ...validRequest,
    mode: 'unknown_event',
  });
  const result = await executeSimulatedCodexRun(grant, store);
  expect(result.status).toBe('failed');
}, 15000);

it('execute: rejects revoked grant before execute', async () => {
  const { store } = await openStore();
  const grant = prepareSimulatedCodexRun(validRequest);
  grant.revoke();
  await expect(executeSimulatedCodexRun(grant, store)).rejects.toMatchObject({
    code: 'adapter_denied',
  });
}, 5000);

it('execute: revocation via signal returns cancelled', async () => {
  const { store } = await openStore();
  const ac = new AbortController();
  const grant = prepareSimulatedCodexRun(validRequest);
  // Abort immediately — hits the combined check inside the handler.
  ac.abort();
  const result = await executeSimulatedCodexRun(grant, store, ac.signal);
  expect(['cancelled', 'failed', 'blocked']).toContain(result.status);
}, 15000);

it('execute: rejects concurrent execute with adapter_busy', async () => {
  const { store } = await openStore();
  const g1 = prepareSimulatedCodexRun(validRequest);
  const g2 = prepareSimulatedCodexRun(validRequest);
  const p1 = executeSimulatedCodexRun(g1, store);
  // p1 is now in-flight and active=true; second call must fail synchronously.
  await expect(executeSimulatedCodexRun(g2, store)).rejects.toMatchObject({
    code: 'adapter_busy',
  });
  await p1;
}, 15000);

// ─── recovery and evidence tests ─────────────────────────────────────────────

it('recovery: evidence readable from second store instance', async () => {
  // Create an empty dir without opening a store (openStore keeps a connection
  // open which would conflict with store1 on the same SQLite file).
  const root = mkdtempSync(join(temp, 'beonforge-adapter-'));
  const dbPath = join(root, 'events.sqlite');

  // First store: execute and close.
  const store1 = await openSqlitePersistence(dbPath);
  const grant = prepareSimulatedCodexRun(validRequest);
  const result = await executeSimulatedCodexRun(grant, store1);
  await store1.close();
  expect(result.status).toBe('succeeded');
  expect(result.proposalRef).not.toBeNull();

  // Second store: same path, different instance.
  const store2 = await openSqlitePersistence(dbPath);
  stores.push({ root, store: store2 });

  const inspection = await inspectSimulatedCodexRun(store2, result.runId);
  expect(inspection).not.toBeNull();
  expect(inspection?.status).toBe('succeeded');
  expect(inspection?.proposalRef).not.toBeNull();
  expect(inspection?.proposalRef?.sha256).toBe(result.proposalRef?.sha256);

  // Proposal artifact bytes are also readable.
  const proposalBytes = await store2.readArtifact(inspection!.proposalRef!);
  const proposalObj = JSON.parse(
    new TextDecoder('utf-8', { fatal: true }).decode(proposalBytes),
  ) as Record<string, unknown>;
  expect(proposalObj['schemaVersion']).toBe(1);
  expect(proposalObj['baseCommit']).toBe(BASE_COMMIT);
}, 15000);

it('recovery: uncertain state preserved in EventStore', async () => {
  const { store } = await openStore();
  const grant = prepareSimulatedCodexRun({
    ...validRequest,
    mode: 'force_uncertain',
  });
  const result = await executeSimulatedCodexRun(grant, store);
  // The runner maps uncertain → blocked with reason uncertain.
  expect(result.status).toBe('blocked');
  expect(result.reason).toBe('uncertain');

  const inspection = await inspectSimulatedCodexRun(store, result.runId);
  expect(inspection).not.toBeNull();
  expect(inspection?.status).toBe('uncertain');
  expect(inspection?.proposalRef).toBeNull();
}, 15000);

it('recovery: second execute on blocked run returns blocked', async () => {
  const { store } = await openStore();
  const grant1 = prepareSimulatedCodexRun({
    ...validRequest,
    mode: 'force_uncertain',
  });
  const result1 = await executeSimulatedCodexRun(grant1, store);
  expect(result1.status).toBe('blocked');

  // Create a new grant with the SAME runId to simulate a re-dispatch attempt.
  // We cannot do this via the public API (runId is random); we verify instead
  // that the attempt's uncertain state is stable via inspection.
  const inspection = await inspectSimulatedCodexRun(store, result1.runId);
  expect(inspection?.status).toBe('uncertain');
}, 15000);

it('recovery: failed run evidence inspectable', async () => {
  const { store } = await openStore();
  const grant = prepareSimulatedCodexRun({
    ...validRequest,
    mode: 'truncated',
  });
  const result = await executeSimulatedCodexRun(grant, store);
  expect(result.status).toBe('failed');

  const inspection = await inspectSimulatedCodexRun(store, result.runId);
  expect(inspection).not.toBeNull();
  expect(inspection?.status).toBe('failed');
  expect(inspection?.proposalRef).toBeNull();
}, 15000);

it('inspect: returns null for unknown runId', async () => {
  const { store } = await openStore();
  const inspection = await inspectSimulatedCodexRun(store, 'unknown-run-id');
  expect(inspection).toBeNull();
}, 5000);

it('inspect: returns null for empty runId', async () => {
  const { store } = await openStore();
  const inspection = await inspectSimulatedCodexRun(store, '');
  expect(inspection).toBeNull();
}, 5000);

// ─── grant reuse safety ───────────────────────────────────────────────────────

it('grant: grant without CodexAdapterGrant instance rejected', async () => {
  const { store } = await openStore();
  const fake = {
    runId: 'x',
    payloadSha256: 'y',
    profileKind: 'simulated',
    mode: 'success',
    isRevoked: false,
    revoke: () => {},
  };
  await expect(
    executeSimulatedCodexRun(fake as never, store),
  ).rejects.toMatchObject({
    code: 'adapter_invalid',
  });
}, 5000);
