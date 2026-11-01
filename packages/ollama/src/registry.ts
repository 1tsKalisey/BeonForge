import { createHash } from 'node:crypto';
import {
  parseArtifactReference,
  type ArtifactReference,
} from '@beonforge/contracts';
import type { ArtifactStore } from '@beonforge/persistence';
import { own } from './http.js';
import { prepareSyntheticInference } from './inference.js';

export type RegistryErrorCode =
  | 'registry_invalid'
  | 'registry_invalid_evidence'
  | 'registry_denied'
  | 'registry_conflict'
  | 'registry_unknown_candidate'
  | 'registry_limit'
  | 'registry_integrity'
  | 'registry_store_failure';
export class RegistryError extends Error {
  constructor(readonly code: RegistryErrorCode) {
    super(code);
    this.name = 'RegistryError';
  }
}

export interface LocalCandidateV1 {
  readonly schemaVersion: 1;
  readonly candidateId: string;
  readonly provider: 'ollama';
  readonly endpoint: string;
  readonly model: string;
  /** Declared digest, not a live pin or proof of installed weights. */
  readonly modelDigest: string;
  readonly classification: 'synthetic-public-v1';
}
export interface LocalRegistryPolicy {
  readonly canRead: boolean;
  readonly canRegister?: boolean;
  readonly canEvaluate?: boolean;
  readonly allowedCandidates: readonly LocalCandidateV1[];
}
export interface CandidateEvaluationV1 {
  readonly schemaVersion: 1;
  readonly subject: LocalCandidateV1;
  readonly provenance: {
    readonly kind: 'operator-declared';
    readonly implementationCommit: string;
    readonly evidenceCommit: string;
    readonly fixture: 'B05-02-synthetic-public-v1';
  };
  /** Both observations belong to the same declared attempt/window. */
  readonly availability: {
    readonly state: 'available' | 'unavailable';
    readonly versionStatus: number | null;
    readonly tagsStatus: number | null;
  } | null;
  readonly inference: {
    readonly payloadSha256: string;
    readonly outcome: 'confirmed';
    readonly answer: 4;
    readonly exitCode: 0;
    readonly stderrEmpty: true;
    readonly elapsedMs: number;
    readonly timeoutMs: number;
    readonly httpStatus: 200;
    readonly observedPostCount: 1;
    readonly retries: 0;
    readonly correlation: 'server-log-window-only';
  } | null;
}
interface Entry {
  readonly candidate: LocalCandidateV1;
  readonly evidence: CandidateEvaluationV1 | null;
}
interface Manifest {
  readonly schemaVersion: 1;
  readonly kind: 'ollama-candidate-registry';
  readonly entries: readonly Entry[];
}
export interface LocalCandidateView extends Entry {
  readonly registration: 'registered';
  readonly availability:
    'not_observed' | 'declared_available' | 'declared_unavailable';
  readonly evaluation:
    'not_evaluated' | 'incomplete' | 'declared_synthetic_confirmed';
  readonly automaticChecks: readonly [
    'cas-sha256',
    'schema-v1',
    'internal-consistency',
  ];
  readonly observationTrust: 'operator-declared-not-reproduced';
  readonly liveModelValidation: 'not_performed';
  readonly inferenceAuthorization: 'separate-grant-required';
  readonly programming: 'not_evaluated';
  readonly toolsAndPrivateContext: 'not_authorized';
}
const MAX_ENTRIES = 16;
const MAX_BYTES = 65536;
function fail(code: RegistryErrorCode): never {
  throw new RegistryError(code);
}
function data(value: unknown, key: string): unknown {
  try {
    return own(value, key);
  } catch {
    return fail('registry_invalid');
  }
}
function record(value: unknown, keys: readonly string[]): void {
  data(value, keys[0] ?? '');
  const actual = Reflect.ownKeys(value as object);
  if (
    actual.length !== keys.length ||
    actual.some((k) => typeof k !== 'string' || !keys.includes(k))
  )
    fail('registry_invalid');
  for (const key of keys) data(value, key);
}
function array(value: unknown, max: number): readonly unknown[] {
  data(value, 'length');
  if (!Array.isArray(value) || value.length > max)
    return fail('registry_limit');
  const result: unknown[] = [];
  for (let i = 0; i < value.length; i++) {
    if (!Object.hasOwn(value, String(i))) return fail('registry_invalid');
    result.push(data(value, String(i)));
  }
  return result;
}
function digest(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length !== 64 ||
    !/^[a-f0-9]{64}$/.test(value)
  )
    return fail('registry_invalid');
  return value;
}
function identity(value: unknown): LocalCandidateV1 {
  record(value, [
    'schemaVersion',
    'candidateId',
    'provider',
    'endpoint',
    'model',
    'modelDigest',
    'classification',
  ]);
  const candidateId = data(value, 'candidateId'),
    endpoint = data(value, 'endpoint'),
    model = data(value, 'model');
  if (
    data(value, 'schemaVersion') !== 1 ||
    data(value, 'provider') !== 'ollama' ||
    data(value, 'classification') !== 'synthetic-public-v1' ||
    typeof candidateId !== 'string' ||
    candidateId.length > 64 ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(candidateId) ||
    candidateId.trim() !== candidateId
  )
    return fail('registry_invalid');
  let prepared;
  try {
    prepared = prepareSyntheticInference({
      endpoint: endpoint as string,
      model: model as string,
    });
  } catch {
    return fail('registry_invalid');
  }
  return {
    schemaVersion: 1,
    candidateId,
    provider: 'ollama',
    endpoint: prepared.endpoint,
    model: prepared.model,
    modelDigest: digest(data(value, 'modelDigest')),
    classification: 'synthetic-public-v1',
  };
}
function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
function commit(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length < 7 ||
    value.length > 40 ||
    !/^[a-f0-9]+$/.test(value)
  )
    return fail('registry_invalid');
  return value;
}
function status(value: unknown): number | null {
  if (value === null) return null;
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 100 ||
    value > 599
  )
    return fail('registry_invalid');
  return value;
}
function evaluation(
  value: unknown,
  subject: LocalCandidateV1,
): CandidateEvaluationV1 {
  try {
    record(value, [
      'schemaVersion',
      'subject',
      'provenance',
      'availability',
      'inference',
    ]);
    if (
      data(value, 'schemaVersion') !== 1 ||
      !same(identity(data(value, 'subject')), subject)
    )
      return fail('registry_invalid_evidence');
    const source = data(value, 'provenance');
    record(source, [
      'kind',
      'implementationCommit',
      'evidenceCommit',
      'fixture',
    ]);
    if (
      data(source, 'kind') !== 'operator-declared' ||
      data(source, 'fixture') !== 'B05-02-synthetic-public-v1'
    )
      return fail('registry_invalid_evidence');
    const provenance = {
      kind: 'operator-declared' as const,
      implementationCommit: commit(data(source, 'implementationCommit')),
      evidenceCommit: commit(data(source, 'evidenceCommit')),
      fixture: 'B05-02-synthetic-public-v1' as const,
    };
    let availability: CandidateEvaluationV1['availability'] = null;
    const a = data(value, 'availability');
    if (a !== null) {
      record(a, ['state', 'versionStatus', 'tagsStatus']);
      const state = data(a, 'state'),
        versionStatus = status(data(a, 'versionStatus')),
        tagsStatus = status(data(a, 'tagsStatus'));
      if (state !== 'available' && state !== 'unavailable')
        return fail('registry_invalid_evidence');
      if (
        (state === 'available') !==
        (versionStatus === 200 && tagsStatus === 200)
      )
        return fail('registry_invalid_evidence');
      availability = { state, versionStatus, tagsStatus };
    }
    let inference: CandidateEvaluationV1['inference'] = null;
    const i = data(value, 'inference');
    if (i !== null) {
      record(i, [
        'payloadSha256',
        'outcome',
        'answer',
        'exitCode',
        'stderrEmpty',
        'elapsedMs',
        'timeoutMs',
        'httpStatus',
        'observedPostCount',
        'retries',
        'correlation',
      ]);
      const payloadSha256 = digest(data(i, 'payloadSha256')),
        elapsedMs = data(i, 'elapsedMs'),
        timeoutMs = data(i, 'timeoutMs');
      const preview = prepareSyntheticInference({
        endpoint: subject.endpoint,
        model: subject.model,
      });
      if (
        payloadSha256 !== preview.payloadSha256 ||
        data(i, 'outcome') !== 'confirmed' ||
        data(i, 'answer') !== 4 ||
        data(i, 'exitCode') !== 0 ||
        data(i, 'stderrEmpty') !== true ||
        data(i, 'httpStatus') !== 200 ||
        data(i, 'observedPostCount') !== 1 ||
        data(i, 'retries') !== 0 ||
        data(i, 'correlation') !== 'server-log-window-only' ||
        typeof elapsedMs !== 'number' ||
        !Number.isFinite(elapsedMs) ||
        elapsedMs < 0 ||
        typeof timeoutMs !== 'number' ||
        !Number.isSafeInteger(timeoutMs) ||
        timeoutMs < 1 ||
        timeoutMs > 120000 ||
        elapsedMs > timeoutMs ||
        availability?.state === 'unavailable'
      )
        return fail('registry_invalid_evidence');
      inference = {
        payloadSha256,
        outcome: 'confirmed',
        answer: 4,
        exitCode: 0,
        stderrEmpty: true,
        elapsedMs,
        timeoutMs,
        httpStatus: 200,
        observedPostCount: 1,
        retries: 0,
        correlation: 'server-log-window-only',
      };
    }
    return { schemaVersion: 1, subject, provenance, availability, inference };
  } catch {
    return fail('registry_invalid_evidence');
  }
}
function reference(value: unknown): ArtifactReference {
  try {
    record(value, ['sha256', 'byteLength']);
    const ref = parseArtifactReference({
      sha256: data(value, 'sha256'),
      byteLength: data(value, 'byteLength'),
    });
    if (ref.byteLength > MAX_BYTES) return fail('registry_limit');
    return ref;
  } catch (error) {
    if (error instanceof RegistryError) throw error;
    return fail('registry_integrity');
  }
}
function readPermission(
  policy: LocalRegistryPolicy,
): readonly LocalCandidateV1[] {
  if (data(policy, 'canRead') !== true) return fail('registry_denied');
  return array(data(policy, 'allowedCandidates'), MAX_ENTRIES).map(identity);
}
function authorize(
  policy: LocalRegistryPolicy,
  candidate: LocalCandidateV1,
  flag?: 'canRegister' | 'canEvaluate',
): void {
  const allowed = readPermission(policy);
  if (flag && data(policy, flag) !== true) return fail('registry_denied');
  if (!allowed.some((item) => same(item, candidate)))
    return fail('registry_denied');
}
function all(policy: LocalRegistryPolicy, entries: readonly Entry[]): void {
  readPermission(policy);
  for (const entry of entries) authorize(policy, entry.candidate);
}
function encode(manifest: Manifest): Buffer {
  return Buffer.from(JSON.stringify(manifest), 'utf8');
}
function checksum(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
async function verified(
  ref: ArtifactReference,
  store: ArtifactStore,
): Promise<Uint8Array> {
  const bytes = await store.readArtifact(ref);
  if (bytes.byteLength !== ref.byteLength || checksum(bytes) !== ref.sha256)
    return fail('registry_integrity');
  return bytes;
}
async function load(
  ref: ArtifactReference,
  policy: LocalRegistryPolicy,
  store: ArtifactStore,
): Promise<Manifest> {
  readPermission(policy);
  const r = reference(ref);
  const bytes = await verified(r, store);
  readPermission(policy);
  let parsed: unknown;
  try {
    parsed = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(bytes),
    ) as unknown;
  } catch {
    return fail('registry_integrity');
  }
  try {
    record(parsed, ['schemaVersion', 'kind', 'entries']);
    if (
      data(parsed, 'schemaVersion') !== 1 ||
      data(parsed, 'kind') !== 'ollama-candidate-registry'
    )
      return fail('registry_integrity');
    const entries = array(data(parsed, 'entries'), MAX_ENTRIES).map((item) => {
      record(item, ['candidate', 'evidence']);
      const candidate = identity(data(item, 'candidate')),
        raw = data(item, 'evidence');
      return {
        candidate,
        evidence: raw === null ? null : evaluation(raw, candidate),
      };
    });
    const manifest: Manifest = {
      schemaVersion: 1,
      kind: 'ollama-candidate-registry',
      entries,
    };
    for (let i = 0; i < entries.length; i++) {
      const current = entries[i];
      if (!current) return fail('registry_integrity');
      if (
        i > 0 &&
        (entries[i - 1]?.candidate.candidateId ?? '') >=
          current.candidate.candidateId
      )
        return fail('registry_integrity');
      if (
        entries
          .slice(0, i)
          .some(
            (e) =>
              e.candidate.endpoint === current.candidate.endpoint &&
              e.candidate.model === current.candidate.model,
          )
      )
        return fail('registry_integrity');
    }
    if (!Buffer.from(bytes).equals(encode(manifest)))
      return fail('registry_integrity');
    all(policy, entries);
    return manifest;
  } catch (error) {
    if (error instanceof RegistryError && error.code === 'registry_denied')
      throw error;
    return fail('registry_integrity');
  }
}
async function save(
  entries: readonly Entry[],
  subject: LocalCandidateV1,
  flag: 'canRegister' | 'canEvaluate',
  policy: LocalRegistryPolicy,
  store: ArtifactStore,
): Promise<ArtifactReference> {
  const ordered = [...entries].sort((a, b) =>
    a.candidate.candidateId < b.candidate.candidateId
      ? -1
      : a.candidate.candidateId > b.candidate.candidateId
        ? 1
        : 0,
  );
  if (ordered.length > MAX_ENTRIES) return fail('registry_limit');
  const bytes = encode({
    schemaVersion: 1,
    kind: 'ollama-candidate-registry',
    entries: ordered,
  });
  if (bytes.byteLength > MAX_BYTES) return fail('registry_limit');
  all(policy, ordered);
  authorize(policy, subject, flag);
  const ref = reference(await store.putArtifact(bytes));
  all(policy, ordered);
  authorize(policy, subject, flag);
  if (ref.sha256 !== checksum(bytes) || ref.byteLength !== bytes.byteLength)
    return fail('registry_integrity');
  await verified(ref, store);
  all(policy, ordered);
  authorize(policy, subject, flag);
  return ref;
}
function sanitized(error: unknown): RegistryError {
  return error instanceof RegistryError
    ? error
    : new RegistryError('registry_store_failure');
}

/** Immutable CAS snapshot. Null explicitly starts a new registry/branch. */
export async function registerLocalCandidate(
  registryRef: ArtifactReference | null,
  value: LocalCandidateV1,
  policy: LocalRegistryPolicy,
  store: ArtifactStore,
): Promise<ArtifactReference> {
  try {
    const candidate = identity(value);
    authorize(policy, candidate, 'canRegister');
    const root =
      registryRef === null
        ? { entries: [] }
        : await load(registryRef, policy, store);
    const existing = root.entries.find(
      (e) =>
        e.candidate.candidateId === candidate.candidateId ||
        (e.candidate.endpoint === candidate.endpoint &&
          e.candidate.model === candidate.model),
    );
    if (existing) {
      authorize(policy, candidate, 'canRegister');
      if (!same(existing.candidate, candidate))
        return fail('registry_conflict');
      return reference(registryRef);
    }
    return await save(
      [...root.entries, { candidate, evidence: null }],
      candidate,
      'canRegister',
      policy,
      store,
    );
  } catch (error) {
    throw sanitized(error);
  }
}

export async function recordCandidateEvaluation(
  registryRef: ArtifactReference,
  candidateId: string,
  value: CandidateEvaluationV1,
  policy: LocalRegistryPolicy,
  store: ArtifactStore,
): Promise<ArtifactReference> {
  try {
    readPermission(policy);
    if (data(policy, 'canEvaluate') !== true) return fail('registry_denied');
    const root = await load(registryRef, policy, store);
    const existing = root.entries.find(
      (e) => e.candidate.candidateId === candidateId,
    );
    if (!existing) return fail('registry_unknown_candidate');
    const candidate = existing.candidate;
    authorize(policy, candidate, 'canEvaluate');
    const evidence = evaluation(value, candidate);
    if (existing.evidence) {
      if (same(existing.evidence, evidence)) return reference(registryRef);
      if (
        !same(existing.evidence.provenance, evidence.provenance) ||
        (existing.evidence.availability !== null &&
          !same(existing.evidence.availability, evidence.availability)) ||
        (existing.evidence.inference !== null &&
          !same(existing.evidence.inference, evidence.inference))
      )
        return fail('registry_conflict');
    }
    return await save(
      root.entries.map((e) => (e === existing ? { candidate, evidence } : e)),
      candidate,
      'canEvaluate',
      policy,
      store,
    );
  } catch (error) {
    throw sanitized(error);
  }
}

export async function readLocalCandidates(
  registryRef: ArtifactReference,
  policy: LocalRegistryPolicy,
  store: ArtifactStore,
): Promise<readonly LocalCandidateView[]> {
  try {
    const root = await load(registryRef, policy, store);
    all(policy, root.entries);
    return root.entries.map((entry) => ({
      ...entry,
      registration: 'registered',
      availability:
        entry.evidence?.availability === null || !entry.evidence?.availability
          ? 'not_observed'
          : entry.evidence.availability.state === 'available'
            ? 'declared_available'
            : 'declared_unavailable',
      evaluation:
        entry.evidence === null
          ? 'not_evaluated'
          : entry.evidence.availability?.state === 'available' &&
              entry.evidence.inference !== null
            ? 'declared_synthetic_confirmed'
            : 'incomplete',
      automaticChecks: ['cas-sha256', 'schema-v1', 'internal-consistency'],
      observationTrust: 'operator-declared-not-reproduced',
      liveModelValidation: 'not_performed',
      inferenceAuthorization: 'separate-grant-required',
      programming: 'not_evaluated',
      toolsAndPrivateContext: 'not_authorized',
    }));
  } catch (error) {
    throw sanitized(error);
  }
}
