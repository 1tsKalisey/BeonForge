import { afterEach, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, realpathSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import http from 'node:http';
import { syncBuiltinESMExports } from 'node:module';
import './fixtures/network-guard.mjs';
import {
  openSqlitePersistence,
  type ArtifactStore,
  type DurableStore,
} from '@beonforge/persistence';
import type { ArtifactReference } from '@beonforge/contracts';
import {
  registerLocalCandidate,
  readLocalCandidates,
  recordCandidateEvaluation,
  RegistryError,
  prepareSyntheticInference,
  runSyntheticInference,
  probeOllama,
  type LocalCandidateV1,
  type LocalRegistryPolicy,
  type CandidateEvaluationV1,
  type SyntheticInferenceGrant,
  type OllamaProbeOptions,
} from '@beonforge/ollama';

const sample = JSON.parse(
  readFileSync(
    new URL('../examples/gemma3-hf-1b-evaluation.json', import.meta.url),
    'utf8',
  ),
) as { candidate: LocalCandidateV1; evaluation: CandidateEvaluationV1 };
const candidate = sample.candidate;
function policy(...allowed: LocalCandidateV1[]): LocalRegistryPolicy {
  return {
    canRead: true,
    canRegister: true,
    canEvaluate: true,
    allowedCandidates: allowed.length ? allowed : [candidate],
  };
}
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
function ref(bytes: Uint8Array): ArtifactReference {
  return {
    sha256: createHash('sha256').update(bytes).digest('hex'),
    byteLength: bytes.byteLength,
  };
}
class MemoryCas implements ArtifactStore {
  readonly data = new Map<string, Uint8Array>();
  puts = 0;
  reads = 0;
  putArtifact(bytes: Uint8Array): Promise<ArtifactReference> {
    this.puts++;
    const r = ref(bytes);
    this.data.set(r.sha256, Uint8Array.from(bytes));
    return Promise.resolve(r);
  }
  readArtifact(r: ArtifactReference): Promise<Uint8Array> {
    this.reads++;
    const bytes = this.data.get(r.sha256);
    if (!bytes)
      return Promise.reject(new Error('private storage path not exposed'));
    return Promise.resolve(Uint8Array.from(bytes));
  }
}
async function errorOf(promise: Promise<unknown>, code: string): Promise<void> {
  let caught: unknown;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(RegistryError);
  expect(caught).toMatchObject({ code, message: code });
}
const temporary = realpathSync(tmpdir());
const allocated: { root: string; stores: DurableStore[] }[] = [];
function durable() {
  const root = mkdtempSync(join(temporary, 'beonforge-registry-'));
  const item = { root, stores: [] as DurableStore[] };
  allocated.push(item);
  const db = join(root, 'registry.db'),
    artifacts = join(root, 'artifacts');
  const open = async () => {
    const store = await openSqlitePersistence(db, artifacts);
    item.stores.push(store);
    return store;
  };
  return { root, db, artifacts, open };
}
afterEach(async () => {
  for (const item of allocated.splice(0)) {
    for (const store of item.stores) await store.close();
    expect(dirname(realpathSync(item.root))).toBe(temporary);
    expect(item.root.startsWith(join(temporary, 'beonforge-registry-'))).toBe(
      true,
    );
    rmSync(item.root, { recursive: true, force: true });
  }
});

it('compiled API registers explicitly, queries, and survives closing/reopening a real worker CAS', async () => {
  expect(import.meta.resolve('@beonforge/ollama')).toMatch(/dist\/index.js$/);
  const f = durable();
  const first = await f.open();
  const p = policy();
  const root = await registerLocalCandidate(null, candidate, p, first);
  const initial = await readLocalCandidates(root, p, first);
  expect(initial).toMatchObject([
    {
      candidate,
      registration: 'registered',
      availability: 'not_observed',
      evaluation: 'not_evaluated',
      inferenceAuthorization: 'separate-grant-required',
    },
  ]);
  const evaluated = await recordCandidateEvaluation(
    root,
    candidate.candidateId,
    sample.evaluation,
    p,
    first,
  );
  await first.close();
  const second = await f.open();
  const views = await readLocalCandidates(evaluated, p, second);
  expect(views).toMatchObject([
    {
      availability: 'declared_available',
      evaluation: 'declared_synthetic_confirmed',
      observationTrust: 'operator-declared-not-reproduced',
      liveModelValidation: 'not_performed',
      programming: 'not_evaluated',
      toolsAndPrivateContext: 'not_authorized',
    },
  ]);
  expect(views[0]?.evidence?.inference?.elapsedMs).toBe(74310);
  expect(views[0]?.automaticChecks).toEqual([
    'cas-sha256',
    'schema-v1',
    'internal-consistency',
  ]);
  expect((await readLocalCandidates(root, p, second))[0]?.evidence).toBeNull();
});
it('demo: second process recovers declared gemma evidence from its explicit root ref, without network', async () => {
  const f = durable();
  const store = await f.open();
  const p = policy();
  const root = await registerLocalCandidate(null, candidate, p, store);
  const evaluated = await recordCandidateEvaluation(
    root,
    candidate.candidateId,
    sample.evaluation,
    p,
    store,
  );
  const expected = await readLocalCandidates(evaluated, p, store);
  await store.close();
  const child = spawn(
    process.execPath,
    [
      '--import',
      './test/fixtures/network-guard.mjs',
      './test/fixtures/registry-reader.mjs',
      f.db,
      f.artifacts,
      JSON.stringify(evaluated),
      JSON.stringify(p),
    ],
    {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, BEONFORGE_TEST_PORTS: '' },
    },
  );
  let out = '',
    err = '';
  child.stdout.on('data', (bytes: Buffer) => {
    out += bytes.toString();
  });
  child.stderr.on('data', (bytes: Buffer) => {
    err += bytes.toString();
  });
  const [code] = (await once(child, 'close')) as [number | null];
  expect(code).toBe(0);
  expect(
    err.replaceAll(/\(node:\d+\) ExperimentalWarning:[\s\S]*?\n/g, ''),
  ).not.toContain('RegistryError');
  expect(JSON.parse(out)).toEqual(expected);
});
it('compatible duplicate registration and evaluation are idempotent; snapshots sorted deterministically', async () => {
  const store = new MemoryCas();
  const second = { ...candidate, candidateId: 'alpha', model: 'other:1b' };
  const p = policy(candidate, second);
  const root = await registerLocalCandidate(null, candidate, p, store);
  const puts = store.puts;
  expect(
    await registerLocalCandidate(root, clone(candidate), p, store),
  ).toEqual(root);
  expect(store.puts).toBe(puts);
  const both = await registerLocalCandidate(root, second, p, store);
  expect(
    (await readLocalCandidates(both, p, store)).map(
      (v) => v.candidate.candidateId,
    ),
  ).toEqual(['alpha', candidate.candidateId]);
  const a = await registerLocalCandidate(null, second, p, store);
  const b = await registerLocalCandidate(a, candidate, p, store);
  expect(b).toEqual(both);
  const evaluated = await recordCandidateEvaluation(
    both,
    candidate.candidateId,
    sample.evaluation,
    p,
    store,
  );
  const before = store.puts;
  expect(
    await recordCandidateEvaluation(
      evaluated,
      candidate.candidateId,
      clone(sample.evaluation),
      p,
      store,
    ),
  ).toEqual(evaluated);
  expect(store.puts).toBe(before);
});
it.each(['candidateId', 'model', 'modelDigest', 'endpoint'])(
  'duplicate incompatible %s never overwrites or publishes',
  async (key) => {
    const store = new MemoryCas();
    const changed = {
      ...candidate,
      [key]:
        key === 'candidateId'
          ? 'other-id'
          : key === 'model'
            ? 'other:1b'
            : key === 'endpoint'
              ? 'http://[::1]:11434'
              : 'f'.repeat(64),
    };
    const p = policy(candidate, changed);
    const root = await registerLocalCandidate(null, candidate, p, store);
    const puts = store.puts;
    await errorOf(
      registerLocalCandidate(root, changed, p, store),
      'registry_conflict',
    );
    expect(store.puts).toBe(puts);
    expect((await readLocalCandidates(root, p, store))[0]?.candidate).toEqual(
      candidate,
    );
  },
);
it.each([
  { schemaVersion: 2 },
  { provider: 'cloud' },
  { endpoint: 'https://127.0.0.1:11434' },
  { endpoint: 'http://localhost:11434' },
  { endpoint: 'http://example.invalid:11434' },
  { model: 'x:cloud' },
  { model: '../private' },
  { modelDigest: 'not-sha256' },
  { modelDigest: 'f'.repeat(64) + '\n' },
  { classification: 'private' },
  { candidateId: '../x' },
  { prompt: 'private data' },
])('rejects invalid candidate %# before CAS publication', async (fields) => {
  const store = new MemoryCas();
  const invalid = { ...candidate, ...fields };
  await errorOf(
    registerLocalCandidate(null, invalid as LocalCandidateV1, policy(), store),
    'registry_invalid',
  );
  expect(store.puts).toBe(0);
  expect(store.reads).toBe(0);
});
it('policy allowlist binds endpoint, model and digest independently, even when a root is known', async () => {
  const store = new MemoryCas();
  const root = await registerLocalCandidate(null, candidate, policy(), store);
  for (const key of ['endpoint', 'model', 'modelDigest'] as const) {
    const wrong = {
      ...candidate,
      [key]:
        key === 'endpoint'
          ? 'http://[::1]:11434'
          : key === 'model'
            ? 'other:1b'
            : 'e'.repeat(64),
    };
    await errorOf(
      readLocalCandidates(root, policy(wrong), store),
      'registry_denied',
    );
  }
});
it.each(['canRead', 'canRegister', 'canEvaluate'])(
  'missing, false or inherited %s never grants a registry operation',
  async (flag) => {
    const store = new MemoryCas();
    const root = await registerLocalCandidate(null, candidate, policy(), store);
    const before = store.puts;
    for (const mode of ['missing', 'false', 'inherited']) {
      const fields = { ...policy() } as Record<string, unknown>;
      if (mode === 'false') fields[flag] = false;
      else delete fields[flag];
      const p =
        mode === 'inherited'
          ? Object.assign(Object.create({ [flag]: true }) as object, fields)
          : fields;
      const operation =
        flag === 'canEvaluate'
          ? recordCandidateEvaluation(
              root,
              candidate.candidateId,
              sample.evaluation,
              p as unknown as LocalRegistryPolicy,
              store,
            )
          : flag === 'canRegister'
            ? registerLocalCandidate(
                root,
                candidate,
                p as unknown as LocalRegistryPolicy,
                store,
              )
            : readLocalCandidates(
                root,
                p as unknown as LocalRegistryPolicy,
                store,
              );
      await errorOf(operation, 'registry_denied');
    }
    expect(store.puts).toBe(before);
  },
);
it('prototype pollution, null, Proxy and getters cannot authorize; diagnostics are static', async () => {
  const store = new MemoryCas();
  const getter = vi.fn(() => true);
  const p = Object.defineProperty({ ...policy() }, 'canRegister', {
    get: getter,
  });
  for (const value of [null, new Proxy(policy(), {}), p])
    await errorOf(
      registerLocalCandidate(
        null,
        candidate,
        value as LocalRegistryPolicy,
        store,
      ),
      'registry_invalid',
    );
  const previous = Object.getOwnPropertyDescriptor(
    Object.prototype,
    'canRegister',
  );
  try {
    Object.defineProperty(Object.prototype, 'canRegister', {
      value: true,
      configurable: true,
    });
    const fields = { ...policy() };
    delete fields.canRegister;
    await errorOf(
      registerLocalCandidate(null, candidate, fields, store),
      'registry_denied',
    );
  } finally {
    if (previous)
      Object.defineProperty(Object.prototype, 'canRegister', previous);
    else Reflect.deleteProperty(Object.prototype, 'canRegister');
  }
  expect(getter).not.toHaveBeenCalled();
  expect(store.puts).toBe(0);
});
it('read, register, evaluate and inference permissions remain independent', async () => {
  const store = new MemoryCas();
  const root = await registerLocalCandidate(null, candidate, policy(), store);
  const readOnly = { canRead: true, allowedCandidates: [candidate] };
  expect(await readLocalCandidates(root, readOnly, store)).toHaveLength(1);
  await errorOf(
    registerLocalCandidate(root, candidate, readOnly, store),
    'registry_denied',
  );
  await errorOf(
    recordCandidateEvaluation(
      root,
      candidate.candidateId,
      sample.evaluation,
      readOnly,
      store,
    ),
    'registry_denied',
  );
  const evaluated = await recordCandidateEvaluation(
    root,
    candidate.candidateId,
    sample.evaluation,
    policy(),
    store,
  );
  const [view] = await readLocalCandidates(evaluated, policy(), store);
  const preview = prepareSyntheticInference({
    endpoint: candidate.endpoint,
    model: candidate.model,
  });
  for (const value of [
    root,
    evaluated,
    view,
    policy(),
    candidate,
    sample.evaluation,
  ]) {
    await expect(
      runSyntheticInference(
        preview,
        value as unknown as SyntheticInferenceGrant,
      ),
    ).rejects.toMatchObject({
      code: 'inference_denied',
      requestDispatched: false,
    });
    await expect(
      probeOllama(value as unknown as OllamaProbeOptions),
    ).rejects.toMatchObject({ code: 'probe_denied' });
  }
});
it.each(['canRead', 'canRegister', 'allowedCandidates'])(
  'revocation during CAS put suppresses returned reference, without cleanup or retries: %s',
  async (key) => {
    const cas = new MemoryCas();
    const p = { ...policy() } as Record<string, unknown>;
    const store: ArtifactStore = {
      readArtifact: (r) => cas.readArtifact(r),
      async putArtifact(bytes) {
        const ref = await cas.putArtifact(bytes);
        p[key] = key === 'allowedCandidates' ? [] : false;
        return ref;
      },
    };
    await errorOf(
      registerLocalCandidate(
        null,
        candidate,
        p as unknown as LocalRegistryPolicy,
        store,
      ),
      'registry_denied',
    );
    expect(cas.puts).toBe(1);
  },
);
it('revocation during CAS read and evaluation put is detected', async () => {
  const cas = new MemoryCas();
  const root = await registerLocalCandidate(null, candidate, policy(), cas);
  const p = { ...policy() };
  const reading: ArtifactStore = {
    putArtifact: (b) => cas.putArtifact(b),
    async readArtifact(r) {
      const b = await cas.readArtifact(r);
      p.canRead = false;
      return b;
    },
  };
  await errorOf(readLocalCandidates(root, p, reading), 'registry_denied');
  const evaluating = { ...policy() };
  const writing: ArtifactStore = {
    readArtifact: (r) => cas.readArtifact(r),
    async putArtifact(b) {
      const r = await cas.putArtifact(b);
      evaluating.canEvaluate = false;
      return r;
    },
  };
  await errorOf(
    recordCandidateEvaluation(
      root,
      candidate.candidateId,
      sample.evaluation,
      evaluating,
      writing,
    ),
    'registry_denied',
  );
});
it('incomplete evidence stays incomplete and can be completed monotonically without rewriting history', async () => {
  const cas = new MemoryCas(),
    p = policy();
  const root = await registerLocalCandidate(null, candidate, p, cas);
  const partial = { ...sample.evaluation, inference: null };
  const observed = await recordCandidateEvaluation(
    root,
    candidate.candidateId,
    partial,
    p,
    cas,
  );
  expect((await readLocalCandidates(observed, p, cas))[0]).toMatchObject({
    availability: 'declared_available',
    evaluation: 'incomplete',
  });
  const full = await recordCandidateEvaluation(
    observed,
    candidate.candidateId,
    sample.evaluation,
    p,
    cas,
  );
  expect((await readLocalCandidates(full, p, cas))[0]?.evaluation).toBe(
    'declared_synthetic_confirmed',
  );
  expect((await readLocalCandidates(observed, p, cas))[0]?.evaluation).toBe(
    'incomplete',
  );
  const empty = await recordCandidateEvaluation(
    root,
    candidate.candidateId,
    { ...sample.evaluation, availability: null, inference: null },
    p,
    cas,
  );
  expect((await readLocalCandidates(empty, p, cas))[0]).toMatchObject({
    availability: 'not_observed',
    evaluation: 'incomplete',
  });
});
it('an observed unavailable service does not erase registration or invent evaluation capabilities', async () => {
  const cas = new MemoryCas(),
    p = policy();
  const root = await registerLocalCandidate(null, candidate, p, cas);
  const evidence = {
    ...sample.evaluation,
    availability: {
      state: 'unavailable' as const,
      versionStatus: null,
      tagsStatus: 503,
    },
    inference: null,
  };
  const recorded = await recordCandidateEvaluation(
    root,
    candidate.candidateId,
    evidence,
    p,
    cas,
  );
  expect((await readLocalCandidates(recorded, p, cas))[0]).toMatchObject({
    registration: 'registered',
    availability: 'declared_unavailable',
    evaluation: 'incomplete',
    programming: 'not_evaluated',
  });
});
it.each([
  'answer',
  'outcome',
  'exitCode',
  'stderrEmpty',
  'payloadSha256',
  'observedPostCount',
  'retries',
  'correlation',
  'elapsedMs',
])(
  'rejects contradictory inference evidence %s without storing it',
  async (key) => {
    const cas = new MemoryCas();
    const root = await registerLocalCandidate(null, candidate, policy(), cas);
    const before = cas.puts;
    const changed = {
      ...sample.evaluation,
      inference: {
        ...sample.evaluation.inference,
        [key]:
          key === 'payloadSha256'
            ? 'a'.repeat(64)
            : key === 'outcome'
              ? 'unknown'
              : key === 'correlation'
                ? 'request-id-verified'
                : key === 'stderrEmpty'
                  ? false
                  : key === 'elapsedMs'
                    ? 120001
                    : 9,
      },
    };
    await errorOf(
      recordCandidateEvaluation(
        root,
        candidate.candidateId,
        changed as CandidateEvaluationV1,
        policy(),
        cas,
      ),
      'registry_invalid_evidence',
    );
    expect(cas.puts).toBe(before);
  },
);
it.each(['subject', 'provenance', 'availability', 'privateData'])(
  'rejects incompatible/overclaimed or private evidence %s',
  async (key) => {
    const cas = new MemoryCas();
    const root = await registerLocalCandidate(null, candidate, policy(), cas);
    const changed = {
      ...sample.evaluation,
      [key]:
        key === 'subject'
          ? { ...candidate, modelDigest: 'b'.repeat(64) }
          : key === 'provenance'
            ? {
                ...sample.evaluation.provenance,
                kind: 'automatically-live-verified',
              }
            : key === 'availability'
              ? { state: 'available', versionStatus: 503, tagsStatus: 200 }
              : 'private prompt',
    };
    await errorOf(
      recordCandidateEvaluation(
        root,
        candidate.candidateId,
        changed,
        policy(),
        cas,
      ),
      'registry_invalid_evidence',
    );
  },
);
it('contradictory availability and inference, incompatible replacement and unknown candidate are rejected', async () => {
  const cas = new MemoryCas(),
    p = policy();
  const root = await registerLocalCandidate(null, candidate, p, cas);
  await errorOf(
    recordCandidateEvaluation(
      root,
      candidate.candidateId,
      {
        ...sample.evaluation,
        availability: {
          state: 'unavailable',
          versionStatus: 503,
          tagsStatus: 503,
        },
      },
      p,
      cas,
    ),
    'registry_invalid_evidence',
  );
  const evaluated = await recordCandidateEvaluation(
    root,
    candidate.candidateId,
    sample.evaluation,
    p,
    cas,
  );
  await errorOf(
    recordCandidateEvaluation(
      evaluated,
      candidate.candidateId,
      {
        ...sample.evaluation,
        provenance: {
          ...sample.evaluation.provenance,
          evidenceCommit: '0000000',
        },
      },
      p,
      cas,
    ),
    'registry_conflict',
  );
  await errorOf(
    recordCandidateEvaluation(root, 'missing', sample.evaluation, p, cas),
    'registry_unknown_candidate',
  );
});
it('corrupt/missing/noncanonical or consistently manipulated CAS data is checked without granting authority', async () => {
  const cas = new MemoryCas(),
    p = policy();
  const root = await registerLocalCandidate(null, candidate, p, cas);
  const bytes = cas.data.get(root.sha256);
  if (!bytes) throw new Error('fixture');
  cas.data.set(root.sha256, Buffer.from('{}'));
  await errorOf(readLocalCandidates(root, p, cas), 'registry_integrity');
  cas.data.set(root.sha256, bytes);
  const raw = JSON.parse(Buffer.from(bytes).toString()) as {
    schemaVersion: number;
    kind: string;
    entries: { candidate: LocalCandidateV1; evidence: null }[];
  };
  for (const body of [
    JSON.stringify(raw, null, 2),
    JSON.stringify({ ...raw, canInfer: true }),
    JSON.stringify({ ...raw, schemaVersion: 2 }),
  ]) {
    const altered = await cas.putArtifact(Buffer.from(body));
    await errorOf(readLocalCandidates(altered, p, cas), 'registry_integrity');
  }
  const badSubject = { ...candidate, modelDigest: 'c'.repeat(64) };
  const altered = await cas.putArtifact(
    Buffer.from(
      JSON.stringify({
        ...raw,
        entries: [{ candidate: badSubject, evidence: null }],
      }),
    ),
  );
  await errorOf(readLocalCandidates(altered, p, cas), 'registry_denied');
  await errorOf(
    readLocalCandidates({ sha256: '0'.repeat(64), byteLength: 10 }, p, cas),
    'registry_store_failure',
  );
});
it('CAS publication acknowledgement and limits are independently verified', async () => {
  const cas = new MemoryCas();
  const wrong: ArtifactStore = {
    putArtifact: () =>
      Promise.resolve({ sha256: '0'.repeat(64), byteLength: 1 }),
    readArtifact: (r) => cas.readArtifact(r),
  };
  await errorOf(
    registerLocalCandidate(null, candidate, policy(), wrong),
    'registry_integrity',
  );
  await errorOf(
    readLocalCandidates(
      { sha256: '0'.repeat(64), byteLength: 65537 },
      policy(),
      cas,
    ),
    'registry_limit',
  );
  expect(cas.reads).toBe(0);
  const identities = Array.from({ length: 16 }, (_, i) => ({
    ...candidate,
    candidateId: `id-${i}`,
    model: `m${i}:1b`,
  }));
  const p = policy(...identities);
  let root: ArtifactReference | null = null;
  for (const identity of identities)
    root = await registerLocalCandidate(root, identity, p, cas);
  if (!root) throw new Error('fixture');
  expect(await readLocalCandidates(root, p, cas)).toHaveLength(16);
  const extra = { ...candidate, candidateId: 'id-extra', model: 'extra:1b' };
  // A full registry cannot be extended under a scoped max16 identity policy.
  await errorOf(registerLocalCandidate(root, extra, p, cas), 'registry_denied');
});
it('registry operations never consult a provider, infer or download, including gemma fixture import', async () => {
  const network = vi.spyOn(http, 'request').mockImplementation(() => {
    throw new Error('unexpected network');
  });
  syncBuiltinESMExports();
  try {
    const cas = new MemoryCas();
    const root = await registerLocalCandidate(null, candidate, policy(), cas);
    const evaluated = await recordCandidateEvaluation(
      root,
      candidate.candidateId,
      sample.evaluation,
      policy(),
      cas,
    );
    const [view] = await readLocalCandidates(evaluated, policy(), cas);
    expect(view?.evidence).toEqual(sample.evaluation);
    expect(view?.evidence?.inference?.correlation).toBe(
      'server-log-window-only',
    );
    expect(network).not.toHaveBeenCalled();
  } finally {
    network.mockRestore();
    syncBuiltinESMExports();
  }
});
