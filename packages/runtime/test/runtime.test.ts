import { mkdtempSync, realpathSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { setTimeout as delay } from 'node:timers/promises';
import ts from 'typescript';
import { afterEach, describe, expect, it } from 'vitest';
import {
  openSqlitePersistence,
  type DurableStore,
} from '@beonforge/persistence';
import {
  executeWorkflow,
  parseWorkflow,
  type BlockHandler,
  type HandlerReport,
  type Workflow,
} from '@beonforge/runtime';

const temporary = realpathSync(tmpdir());
const allocated: { root: string; stores: DurableStore[] }[] = [];
function fixture() {
  const root = mkdtempSync(join(temporary, 'beonforge-runtime-'));
  const path = join(root, 'events.sqlite');
  const stores: DurableStore[] = [];
  allocated.push({ root, stores });
  return {
    root,
    path,
    async open() {
      const store = await openSqlitePersistence(path);
      stores.push(store);
      return store;
    },
  };
}
afterEach(async () => {
  for (const files of allocated.splice(0)) {
    for (const store of files.stores) await store.close();
    expect(dirname(realpathSync(files.root))).toBe(temporary);
    rmSync(files.root, { recursive: true, force: true });
  }
});
function node(
  blockId: string,
  dependsOn: string[] = [],
  effects: 'none' | 'external' = 'none',
) {
  return {
    manifest: {
      schemaVersion: 1 as const,
      blockId,
      handler: 'fixture.copy',
      handlerVersion: 1,
      inputs: [],
      effects,
    },
    dependsOn,
  };
}
function workflow(...nodes: ReturnType<typeof node>[]): Workflow {
  return { schemaVersion: 1, nodes };
}
const seed: BlockHandler = {
  name: 'fixture.copy',
  version: 1,
  effects: 'none',
  execute({ inputs }) {
    return Promise.resolve<HandlerReport>({
      status: 'succeeded',
      outputs: [
        inputs.length ? Buffer.concat(inputs) : Buffer.from('confirmed'),
      ],
    });
  },
};
function sql(path: string, statement: string) {
  const db = new DatabaseSync(path);
  try {
    db.exec(statement);
  } finally {
    db.close();
  }
}

describe('compiled workflow boundary', () => {
  it('resolves public types from dist', () => {
    const config = ts.getParsedCommandLineOfConfigFile(
      ts.sys.resolvePath('tsconfig.test.json'),
      {},
      {
        ...ts.sys,
        onUnRecoverableConfigFileDiagnostic() {
          throw new Error('Consumer config');
        },
      },
    );
    if (!config) throw new Error('Consumer config');
    const resolution = ts.resolveModuleName(
      '@beonforge/runtime',
      ts.sys.resolvePath('test/runtime.test.ts'),
      config.options,
      ts.sys,
    );
    expect(resolution.resolvedModule?.resolvedFileName).toBe(
      ts.sys.resolvePath('dist/index.d.ts').replaceAll('\\', '/'),
    );
  });
  it('canonicalizes nodes/dependencies and detaches inputs', () => {
    const input = {
      schemaVersion: 1,
      nodes: [node('z', ['b', 'a']), node('b'), node('a')],
    };
    const parsed = parseWorkflow(input);
    input.nodes[0]?.dependsOn.reverse();
    expect(parsed.nodes.map((item) => item.manifest.blockId)).toEqual([
      'a',
      'b',
      'z',
    ]);
    expect(parsed.nodes[2]?.dependsOn).toEqual(['a', 'b']);
  });
  it.each([
    null,
    {},
    { schemaVersion: 2, nodes: [node('a')] },
    workflow(),
    workflow(node('a'), node('a')),
    workflow(node('a', ['missing'])),
    workflow(node('a', ['a'])),
    workflow(node('a', ['b']), node('b', ['a'])),
    workflow(node('a'), node('b', ['a', 'a'])),
    workflow(node('kernel.plan')),
    workflow(...Array.from({ length: 65 }, (_, i) => node(`n${i}`))),
    { ...workflow(node('a')), extra: true },
    { schemaVersion: 1, nodes: Array(2) },
    { schemaVersion: 1, nodes: [{ ...node('a'), extra: true }] },
  ])('rejects an invalid/versioned/cyclic graph %#', (input) => {
    expect(() => parseWorkflow(input)).toThrow('invalid_workflow');
  });
});

describe('serial runtime on real SQLite/CAS/checkpoints', () => {
  it('P3-1 leaves cancellation durability unknown before history is read', async () => {
    const files = fixture();
    const store = await files.open();
    const controller = new AbortController();
    controller.abort();
    const result = await executeWorkflow(
      store,
      'run',
      workflow(node('a')),
      [seed],
      { signal: controller.signal },
    );
    expect(result).toMatchObject({
      status: 'cancelled',
      cancellationPersisted: null,
    });
    expect(await store.readEvents()).toEqual([]);
  });

  it('P3-1 distinguishes a non-persisted boundary stop from terminal cancellation', async () => {
    const files = fixture();
    let store = await files.open();
    const controller = new AbortController();
    const checkpoint = store.createCheckpoint.bind(store);
    store.createCheckpoint = async (id) => {
      const confirmed = await checkpoint(id);
      if (
        confirmed.attempts.some(
          (attempt) =>
            attempt.blockId === 'a' && attempt.status === 'succeeded',
        )
      )
        controller.abort();
      return confirmed;
    };
    const input = workflow(node('a'), node('b', ['a']));
    const stopped = await executeWorkflow(store, 'run', input, [seed], {
      signal: controller.signal,
    });
    expect(stopped).toMatchObject({
      status: 'cancelled',
      stoppedBlock: 'b',
      cancellationPersisted: false,
    });
    expect(
      (await store.readEvents()).some(
        (record) =>
          record.event.type === 'block.finished' &&
          record.event.result.status === 'cancelled',
      ),
    ).toBe(false);
    await store.close();
    store = await files.open();
    expect((await executeWorkflow(store, 'run', input, [seed])).status).toBe(
      'succeeded',
    );
  });

  it('P3-1 confirms terminal cancellation after start, persists it across reopen and never resumes it', async () => {
    const files = fixture();
    let store = await files.open();
    const controller = new AbortController();
    let calls = 0;
    const append = store.append.bind(store);
    store.append = async (event, key) => {
      const confirmed = await append(event, key);
      if (event.type === 'block.started' && event.manifest.blockId === 'a')
        controller.abort();
      return confirmed;
    };
    const handler: BlockHandler = {
      ...seed,
      execute(context) {
        calls++;
        return seed.execute(context);
      },
    };
    const input = workflow(node('a'));
    expect(
      await executeWorkflow(store, 'run', input, [handler], {
        signal: controller.signal,
      }),
    ).toMatchObject({ status: 'cancelled', cancellationPersisted: true });
    expect(
      (await store.getAttempt({ runId: 'run', blockId: 'a', attemptId: '1' }))
        ?.status,
    ).toBe('cancelled');
    await store.close();
    store = await files.open();
    expect(
      await executeWorkflow(store, 'run', input, [handler], {
        retryFailed: ['a'],
      }),
    ).toMatchObject({ status: 'cancelled', cancellationPersisted: true });
    expect(calls).toBe(0);
  });

  it('P3-1 does not claim cancellation confirmation when its finish fails in SQLite', async () => {
    const files = fixture();
    let store = await files.open();
    const controller = new AbortController();
    const append = store.append.bind(store);
    store.append = async (event, key) => {
      const confirmed = await append(event, key);
      if (event.type === 'block.started' && event.manifest.blockId === 'a')
        controller.abort();
      return confirmed;
    };
    sql(
      files.path,
      "CREATE TRIGGER fail_cancel BEFORE INSERT ON events WHEN json_extract(NEW.payload,'$.result.status')='cancelled' BEGIN SELECT RAISE(ABORT,'fixture'); END;",
    );
    const input = workflow(node('a'));
    await expect(
      executeWorkflow(store, 'run', input, [seed], {
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: 'storage_failure' });
    sql(files.path, 'DROP TRIGGER fail_cancel;');
    await store.close();
    store = await files.open();
    expect(await executeWorkflow(store, 'run', input, [seed])).toMatchObject({
      status: 'blocked',
      reason: 'pending',
      cancellationPersisted: null,
    });
  });

  it('P3-1 preserves uncertainty when interruption happens after dispatch', async () => {
    const files = fixture();
    const store = await files.open();
    const controller = new AbortController();
    const handler: BlockHandler = {
      ...seed,
      execute() {
        controller.abort();
        return Promise.reject(new Error('Interrupted fixture'));
      },
    };
    const result = await executeWorkflow(
      store,
      'run',
      workflow(node('a')),
      [handler],
      { signal: controller.signal },
    );
    expect(result).toMatchObject({
      status: 'blocked',
      reason: 'uncertain',
      cancellationPersisted: null,
    });
  });

  it('executes a DAG in stable dependency order and reuses successful results after reopen', async () => {
    const files = fixture();
    let store = await files.open();
    const calls: string[] = [];
    const handler: BlockHandler = {
      ...seed,
      async execute(context) {
        calls.push(Buffer.concat(context.inputs).toString());
        return seed.execute(context);
      },
    };
    const input = workflow(node('z', ['a', 'b']), node('b', ['a']), node('a'));
    const first = await executeWorkflow(store, 'run', input, [handler]);
    expect(first).toMatchObject({
      status: 'succeeded',
      completed: ['a', 'b', 'z'],
      checkpointSequence: 8,
    });
    expect(calls).toEqual(['', 'confirmed', 'confirmedconfirmed']);
    const events = await store.readEvents();
    expect(events).toHaveLength(8);
    const projection = await store.getAttempt({
      runId: 'run',
      blockId: 'z',
      attemptId: '1',
    });
    expect(projection?.manifest.inputs).toHaveLength(2);
    const evidence = projection?.result?.evidence[0];
    if (!evidence) throw new Error('Expected evidence');
    expect(Buffer.from(await store.readArtifact(evidence)).toString()).toBe(
      'confirmedconfirmed',
    );
    await store.close();
    store = await files.open();
    const resumed = await executeWorkflow(store, 'run', input, [handler]);
    expect(resumed).toMatchObject({
      status: 'succeeded',
      recoveredFrom: 8,
      tailEvents: 0,
    });
    expect(calls).toHaveLength(3);
    expect(await store.readEvents()).toEqual(events);
    await executeWorkflow(store, 'other-run', workflow(node('a')), [seed]);
    expect((await executeWorkflow(store, 'run', input, [handler])).status).toBe(
      'succeeded',
    );
    expect(calls).toHaveLength(3);
  });

  it('binds dependencies, handler versions and inputs to an immutable plan before any effect', async () => {
    const files = fixture();
    const store = await files.open();
    await executeWorkflow(store, 'run', workflow(node('a'), node('b', ['a'])), [
      seed,
    ]);
    const before = await store.readEvents();
    await expect(
      executeWorkflow(store, 'run', workflow(node('a'), node('b')), [seed]),
    ).rejects.toMatchObject({ code: 'workflow_mismatch' });
    expect(await store.readEvents()).toEqual(before);
  });

  it('rejects invalid DAGs, missing handlers, effect lies and denied external effects without writes', async () => {
    const files = fixture();
    const store = await files.open();
    let calls = 0;
    const external: BlockHandler = {
      ...seed,
      effects: 'external',
      async execute(context) {
        calls++;
        return seed.execute(context);
      },
    };
    await expect(
      executeWorkflow(store, 'run', workflow(node('a', ['a'])), [seed]),
    ).rejects.toMatchObject({ code: 'invalid_workflow' });
    await expect(
      executeWorkflow(store, 'run', workflow(node('a')), []),
    ).rejects.toMatchObject({ code: 'handler_mismatch' });
    await expect(
      executeWorkflow(store, 'run', workflow(node('a')), [external]),
    ).rejects.toMatchObject({ code: 'handler_mismatch' });
    await expect(
      executeWorkflow(store, 'run', workflow(node('a', [], 'external')), [
        external,
      ]),
    ).rejects.toMatchObject({ code: 'permission_denied' });
    expect(calls).toBe(0);
    expect(await store.readEvents()).toEqual([]);
    expect(
      (
        await executeWorkflow(
          store,
          'run',
          workflow(node('a', [], 'external')),
          [external],
          { external: ['a'] },
        )
      ).status,
    ).toBe('succeeded');
    expect(calls).toBe(1);
  });

  it('requires explicit retry for a confirmed failure and preserves distinct attempts', async () => {
    const files = fixture();
    const store = await files.open();
    let calls = 0;
    const handler: BlockHandler = {
      ...seed,
      async execute(context) {
        calls++;
        if (calls === 1)
          return {
            status: 'failed',
            outputs: [],
            error: { code: 'execution_failed', message: 'Known no effect' },
          };
        return seed.execute(context);
      },
    };
    const input = workflow(node('a'), node('b', ['a']));
    expect((await executeWorkflow(store, 'run', input, [handler])).status).toBe(
      'failed',
    );
    expect((await executeWorkflow(store, 'run', input, [handler])).status).toBe(
      'failed',
    );
    expect(calls).toBe(1);
    expect(
      (
        await executeWorkflow(store, 'run', input, [handler], {
          retryFailed: ['a'],
        })
      ).status,
    ).toBe('succeeded');
    expect(calls).toBe(3);
    expect(
      (await store.getAttempt({ runId: 'run', blockId: 'a', attemptId: '1' }))
        ?.status,
    ).toBe('failed');
    expect(
      (await store.getAttempt({ runId: 'run', blockId: 'a', attemptId: '2' }))
        ?.status,
    ).toBe('succeeded');
  });

  it('does not turn one explicit retry selection into an automatic retry loop', async () => {
    const files = fixture();
    const store = await files.open();
    let calls = 0;
    const handler: BlockHandler = {
      ...seed,
      execute() {
        calls++;
        return Promise.resolve<HandlerReport>({
          status: 'failed',
          outputs: [],
          error: { code: 'execution_failed', message: 'Known failure' },
        });
      },
    };
    const input = workflow(node('a'));
    await executeWorkflow(store, 'run', input, [handler]);
    await executeWorkflow(store, 'run', input, [handler], {
      retryFailed: ['a'],
    });
    expect(calls).toBe(2);
  });

  it('cancels before dispatch without starting work and keeps a confirmed cancelled attempt terminal', async () => {
    const files = fixture();
    const store = await files.open();
    const controller = new AbortController();
    controller.abort();
    expect(
      (
        await executeWorkflow(store, 'run', workflow(node('a')), [seed], {
          signal: controller.signal,
        })
      ).status,
    ).toBe('cancelled');
    expect(await store.readEvents()).toEqual([]);
    let calls = 0;
    const handler: BlockHandler = {
      ...seed,
      execute() {
        calls++;
        return Promise.resolve<HandlerReport>({
          status: 'cancelled',
          outputs: [],
        });
      },
    };
    await executeWorkflow(store, 'run', workflow(node('a')), [handler]);
    expect(
      (
        await executeWorkflow(store, 'run', workflow(node('a')), [handler], {
          retryFailed: ['a'],
        })
      ).status,
    ).toBe('cancelled');
    expect(calls).toBe(1);
  });

  it('records cooperative cancellation after dispatch as uncertain and never retries it', async () => {
    const files = fixture();
    const store = await files.open();
    const controller = new AbortController();
    let calls = 0;
    const handler: BlockHandler = {
      ...seed,
      async execute({ signal }) {
        calls++;
        controller.abort();
        await delay(1, undefined, { signal });
        return { status: 'succeeded', outputs: [] };
      },
    };
    const input = workflow(node('a'));
    expect(
      await executeWorkflow(store, 'run', input, [handler], {
        signal: controller.signal,
      }),
    ).toMatchObject({ status: 'blocked', reason: 'uncertain' });
    await delay(0);
    expect(
      (
        await executeWorkflow(store, 'run', input, [handler], {
          retryFailed: ['a'],
        })
      ).reason,
    ).toBe('uncertain');
    expect(calls).toBe(1);
  });

  it('keeps the store locked after timeout until an uncooperative handler settles and ignores late output', async () => {
    const files = fixture();
    const store = await files.open();
    let release: (result: HandlerReport) => void = () => {};
    let calls = 0;
    const handler: BlockHandler = {
      ...seed,
      execute() {
        calls++;
        return new Promise<HandlerReport>((resolve) => {
          release = resolve;
        });
      },
    };
    const input = workflow(node('a'));
    expect(
      (await executeWorkflow(store, 'run', input, [handler], { timeoutMs: 20 }))
        .reason,
    ).toBe('uncertain');
    const before = await store.readEvents();
    const blobsBefore = readdirSync(`${files.path}.artifacts/blobs`).sort();
    await expect(
      executeWorkflow(store, 'another', input, [seed]),
    ).rejects.toMatchObject({ code: 'run_busy' });
    release({ status: 'succeeded', outputs: [Buffer.from('late')] });
    await delay(0);
    expect((await executeWorkflow(store, 'run', input, [handler])).reason).toBe(
      'uncertain',
    );
    expect(await store.readEvents()).toEqual(before);
    expect(readdirSync(`${files.path}.artifacts/blobs`).sort()).toEqual(
      blobsBefore,
    );
    expect(calls).toBe(1);
  });

  it.each([
    null,
    { status: 'invented', outputs: [] },
    { status: 'succeeded', outputs: ['not bytes'] },
  ])('fails closed on malformed handler result %#', async (value) => {
    const files = fixture();
    const store = await files.open();
    const handler: BlockHandler = {
      ...seed,
      execute() {
        return Promise.resolve(value as unknown as HandlerReport);
      },
    };
    expect(
      (await executeWorkflow(store, 'run', workflow(node('a')), [handler]))
        .reason,
    ).toBe('uncertain');
  });

  it('does not persist raw exception text', async () => {
    const files = fixture();
    const store = await files.open();
    const handler: BlockHandler = {
      ...seed,
      execute() {
        throw new Error('private-fixture-content');
      },
    };
    expect(
      (await executeWorkflow(store, 'run', workflow(node('a')), [handler]))
        .reason,
    ).toBe('uncertain');
    expect(JSON.stringify(await store.readEvents())).not.toContain(
      'private-fixture-content',
    );
  });

  it('blocks a confirmed start whose finish failed in real SQLite, without reexecuting its handler', async () => {
    const files = fixture();
    let store = await files.open();
    let calls = 0;
    const handler: BlockHandler = {
      ...seed,
      async execute(context) {
        calls++;
        return seed.execute(context);
      },
    };
    sql(
      files.path,
      "CREATE TRIGGER fail_finish BEFORE INSERT ON events WHEN json_extract(NEW.payload,'$.result.blockId')='a' BEGIN SELECT RAISE(ABORT,'fixture'); END;",
    );
    await expect(
      executeWorkflow(store, 'run', workflow(node('a')), [handler]),
    ).rejects.toMatchObject({ code: 'storage_failure' });
    sql(files.path, 'DROP TRIGGER fail_finish;');
    await store.close();
    store = await files.open();
    expect(
      (
        await executeWorkflow(store, 'run', workflow(node('a')), [handler], {
          retryFailed: ['a'],
        })
      ).reason,
    ).toBe('pending');
    expect(calls).toBe(1);
  });

  it('recovers the committed tail and repairs a missing checkpoint after SQL checkpoint failure', async () => {
    const files = fixture();
    let store = await files.open();
    let calls = 0;
    const handler: BlockHandler = {
      ...seed,
      async execute(context) {
        calls++;
        return seed.execute(context);
      },
    };
    sql(
      files.path,
      "CREATE TRIGGER fail_cp BEFORE INSERT ON workflow_checkpoints WHEN NEW.sequence>2 BEGIN SELECT RAISE(ABORT,'fixture'); END;",
    );
    await expect(
      executeWorkflow(store, 'run', workflow(node('a')), [handler]),
    ).rejects.toMatchObject({ code: 'storage_failure' });
    sql(files.path, 'DROP TRIGGER fail_cp;');
    await store.close();
    store = await files.open();
    expect(
      await executeWorkflow(store, 'run', workflow(node('a')), [handler]),
    ).toMatchObject({
      status: 'succeeded',
      recoveredFrom: 2,
      tailEvents: 2,
      checkpointSequence: 4,
    });
    expect(calls).toBe(1);
  });

  it.each([0, -1, NaN, Infinity])(
    'rejects invalid timeout %s before writes',
    async (timeoutMs) => {
      const files = fixture();
      const store = await files.open();
      await expect(
        executeWorkflow(store, 'run', workflow(node('a')), [seed], {
          timeoutMs,
        }),
      ).rejects.toMatchObject({ code: 'invalid_options' });
      expect(await store.readEvents()).toEqual([]);
    },
  );

  it('does not adopt a run created outside the workflow metadata protocol', async () => {
    const files = fixture();
    const store = await files.open();
    await store.append(
      {
        schemaVersion: 1,
        type: 'block.started',
        eventId: 'foreign',
        occurredAt: 0,
        runId: 'run',
        attemptId: '1',
        manifest: node('a').manifest,
      },
      'foreign',
    );
    await expect(
      executeWorkflow(store, 'run', workflow(node('a')), [seed]),
    ).rejects.toMatchObject({ code: 'invalid_history' });
    expect(await store.readEvents()).toHaveLength(1);
  });
});
