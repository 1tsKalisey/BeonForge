import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  CONTRACT_SCHEMA_VERSION,
  ContractValidationError,
  parseArtifactReference,
  parseBlockManifest,
  parseBlockResult,
  parseBlockExecutionEvent,
  type ArtifactReference,
  type BlockManifest,
  type BlockResult,
  type BlockExecutionError,
  type BlockExecutionEvent,
  type TaskState,
} from '@beonforge/contracts';

const artifact = {
  sha256: 'a'.repeat(64),
  byteLength: 0,
} satisfies ArtifactReference;
const manifest = {
  schemaVersion: CONTRACT_SCHEMA_VERSION,
  blockId: 'copy-1',
  handler: 'fixture.copy',
  handlerVersion: 1,
  inputs: [artifact],
  effects: 'none',
} satisfies BlockManifest;
const result = {
  schemaVersion: CONTRACT_SCHEMA_VERSION,
  runId: 'run-1',
  blockId: manifest.blockId,
  attemptId: 'attempt-1',
  status: 'succeeded',
  evidence: [artifact],
} satisfies BlockResult;
const error = {
  code: 'interrupted',
  message: 'Outcome requires reconciliation',
} satisfies BlockExecutionError;
const started = {
  schemaVersion: CONTRACT_SCHEMA_VERSION,
  eventId: 'event-1',
  occurredAt: 0,
  type: 'block.started',
  runId: result.runId,
  attemptId: result.attemptId,
  manifest,
} satisfies BlockExecutionEvent;
const finished = {
  schemaVersion: CONTRACT_SCHEMA_VERSION,
  eventId: 'event-2',
  occurredAt: 1,
  type: 'block.finished',
  result,
} satisfies BlockExecutionEvent;

describe('execution contracts through published exports', () => {
  it('round-trips minimal manifest, results and events as JSON', () => {
    const decoded: unknown = JSON.parse(JSON.stringify(manifest));
    expect(parseBlockManifest(decoded)).toEqual(manifest);
    expect(parseBlockResult(result)).toEqual(result);
    expect(parseBlockExecutionEvent(started)).toEqual(started);
    expect(parseBlockExecutionEvent(finished)).toEqual(finished);
  });

  it('accepts empty inputs/evidence and explicitly declared external effects', () => {
    expect(
      parseBlockManifest({ ...manifest, inputs: [], effects: 'external' })
        .effects,
    ).toBe('external');
    expect(parseBlockResult({ ...result, evidence: [] }).evidence).toEqual([]);
  });

  it.each(['failed', 'uncertain'] as const)(
    'requires a typed error for %s',
    (status) => {
      const value = { ...result, status, error };
      expect(parseBlockResult(value)).toEqual(value);
      expect(() => parseBlockResult({ ...result, status })).toThrow(
        ContractValidationError,
      );
    },
  );

  it('accepts cancellation as a known attempt outcome without claiming reversal of effects', () => {
    expect(parseBlockResult({ ...result, status: 'cancelled' }).status).toBe(
      'cancelled',
    );
  });

  it.each([
    'invalid_input',
    'permission_denied',
    'execution_failed',
    'timeout',
    'interrupted',
  ])('accepts error code %s', (code) => {
    expect(
      parseBlockResult({
        ...result,
        status: 'failed',
        error: { code, message: 'Safe summary' },
      }).status,
    ).toBe('failed');
  });

  it.each([null, undefined, [], 1, 'manifest', new Date()])(
    'rejects non-record manifest %j',
    (value) => {
      expect(() => parseBlockManifest(value)).toThrow(ContractValidationError);
    },
  );

  it.each([
    '',
    ' ',
    '../block',
    'block\\file',
    'block\n',
    'é',
    'a'.repeat(129),
  ])('rejects invalid identifiers %j', (blockId) => {
    expect(() => parseBlockManifest({ ...manifest, blockId })).toThrow(
      ContractValidationError,
    );
    expect(() => parseBlockResult({ ...result, attemptId: blockId })).toThrow(
      ContractValidationError,
    );
  });

  it('accepts boundary identifier length and safe integer limits', () => {
    expect(
      parseBlockManifest({
        ...manifest,
        blockId: 'a'.repeat(128),
        handlerVersion: Number.MAX_SAFE_INTEGER,
      }).blockId,
    ).toHaveLength(128);
    expect(
      parseArtifactReference({
        ...artifact,
        byteLength: Number.MAX_SAFE_INTEGER,
      }).byteLength,
    ).toBe(Number.MAX_SAFE_INTEGER);
    expect(
      parseBlockExecutionEvent({
        ...started,
        occurredAt: Number.MAX_SAFE_INTEGER,
      }).occurredAt,
    ).toBe(Number.MAX_SAFE_INTEGER);
  });

  it.each([-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '1'])(
    'rejects non-safe or negative numeric fields %j',
    (value) => {
      expect(() =>
        parseBlockManifest({ ...manifest, handlerVersion: value }),
      ).toThrow(ContractValidationError);
      expect(() =>
        parseArtifactReference({ ...artifact, byteLength: value }),
      ).toThrow(ContractValidationError);
      expect(() =>
        parseBlockExecutionEvent({ ...started, occurredAt: value }),
      ).toThrow(ContractValidationError);
    },
  );

  it('requires a positive handler version, a handler and declared effects', () => {
    for (const value of [
      { ...manifest, handlerVersion: 0 },
      { ...manifest, handler: '' },
      { ...manifest, effects: undefined },
      { ...manifest, effects: 'network' },
      { ...manifest, approved: true },
    ])
      expect(() => parseBlockManifest(value)).toThrow(ContractValidationError);
  });

  it.each([
    'a'.repeat(63),
    'a'.repeat(65),
    'A'.repeat(64),
    'g'.repeat(64),
    'a'.repeat(64) + '\n',
    '../blob',
  ])('rejects noncanonical SHA-256 %j', (sha256) => {
    expect(() => parseArtifactReference({ ...artifact, sha256 })).toThrow(
      ContractValidationError,
    );
  });

  it('rejects paths, missing fields, malformed lists and sparse arrays', () => {
    for (const value of [
      { ...artifact, path: '../secret' },
      { sha256: artifact.sha256 },
    ])
      expect(() => parseArtifactReference(value)).toThrow(
        ContractValidationError,
      );
    for (const inputs of [null, {}, [null], new Array<unknown>(1)]) {
      expect(() => parseBlockManifest({ ...manifest, inputs })).toThrow(
        ContractValidationError,
      );
    }
    expect(() => parseBlockResult({ ...result, evidence: [null] })).toThrow(
      ContractValidationError,
    );
  });

  it('rejects invalid result statuses, inconsistent error payloads and malformed summaries', () => {
    for (const value of [
      { ...result, status: 'running' },
      { ...result, status: 'awaiting_approval' },
      { ...result, error },
      { ...result, status: 'cancelled', error },
      { ...result, status: 'failed', error: { ...error, code: 'retry_now' } },
      { ...result, status: 'uncertain', error: { ...error, message: ' ' } },
      {
        ...result,
        status: 'failed',
        error: { ...error, message: 'a'.repeat(1025) },
      },
      { ...result, status: 'failed', error: { ...error, stack: 'raw output' } },
    ])
      expect(() => parseBlockResult(value)).toThrow(ContractValidationError);
    expect(
      parseBlockResult({
        ...result,
        status: 'failed',
        error: { ...error, message: 'a'.repeat(1024) },
      }).status,
    ).toBe('failed');
  });

  it.each([0, 2, '1', null])(
    'rejects unsupported versions in every envelope and nested payload: %j',
    (schemaVersion) => {
      for (const [parse, value] of [
        [parseBlockManifest, { ...manifest, schemaVersion }],
        [parseBlockResult, { ...result, schemaVersion }],
        [parseBlockExecutionEvent, { ...started, schemaVersion }],
        [
          parseBlockExecutionEvent,
          { ...started, manifest: { ...manifest, schemaVersion } },
        ],
        [
          parseBlockExecutionEvent,
          { ...finished, result: { ...result, schemaVersion } },
        ],
      ] as const) {
        expect(() => parse(value)).toThrowError(
          expect.objectContaining({ code: 'unsupported_schema_version' }),
        );
      }
    },
  );

  it('rejects malformed events and missing versions', () => {
    for (const value of [
      { ...started, type: 'block.retry' },
      { ...started, eventId: '' },
      { ...started, result },
      { ...started, manifest: null },
      { ...finished, result: null },
      { ...finished, manifest },
    ])
      expect(() => parseBlockExecutionEvent(value)).toThrow(
        ContractValidationError,
      );
    expect(() => parseBlockManifest({ blockId: 'block' })).toThrowError(
      expect.objectContaining({
        code: 'invalid_contract',
        field: 'manifest.schemaVersion',
      }),
    );
  });

  it('returns detached records so input mutation cannot change the parsed contract', () => {
    const input = { ...artifact };
    const parsed = parseBlockManifest({ ...manifest, inputs: [input] });
    input.sha256 = 'b'.repeat(64);
    expect(parsed.inputs[0]?.sha256).toBe(artifact.sha256);
    expect(parseBlockExecutionEvent(started)).not.toBe(started);
  });

  it('never echoes raw values or unexpected keys in validation errors', () => {
    const secret = 'sensitive-test-value';
    try {
      parseBlockManifest({ ...manifest, [secret]: secret });
      throw new Error('Expected validation to fail');
    } catch (failure: unknown) {
      expect(failure).toBeInstanceOf(ContractValidationError);
      if (failure instanceof ContractValidationError) {
        expect(failure.message).toBe('invalid_contract: manifest');
        expect(failure.message).not.toContain(secret);
      }
    }
  });

  it('publishes strict discriminated records and parsers through dist', () => {
    expectTypeOf<BlockResult['status']>().toExtend<TaskState>();
    expectTypeOf<BlockManifest['inputs']>().toEqualTypeOf<
      readonly ArtifactReference[]
    >();
    expectTypeOf(parseBlockManifest).parameters.toEqualTypeOf<[unknown]>();
    expectTypeOf(
      parseBlockExecutionEvent,
    ).returns.toEqualTypeOf<BlockExecutionEvent>();
    const failed = parseBlockResult({ ...result, status: 'failed', error });
    if (failed.status === 'failed') {
      expectTypeOf(failed.error).toEqualTypeOf<BlockExecutionError>();
    }
  });
});
