import process from 'node:process';
import { readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import {
  openSqlitePersistence,
  PersistenceError,
} from '@beonforge/persistence';
import {
  executeWorkflow,
  type BlockHandler,
  type HandlerReport,
} from './runner.js';
import { identifier, WorkflowError } from './workflow.js';

const handlers: readonly BlockHandler[] = [
  {
    name: 'fixture.seed',
    version: 1,
    effects: 'none',
    execute() {
      return Promise.resolve<HandlerReport>({
        status: 'succeeded',
        outputs: [Buffer.from('BeonForge\n')],
      });
    },
  },
  {
    name: 'fixture.concat',
    version: 1,
    effects: 'none',
    execute({ inputs }) {
      return Promise.resolve<HandlerReport>({
        status: 'succeeded',
        outputs: [Buffer.concat(inputs)],
      });
    },
  },
  {
    name: 'fixture.fail',
    version: 1,
    effects: 'none',
    execute() {
      return Promise.resolve<HandlerReport>({
        status: 'failed',
        outputs: [],
        error: { code: 'execution_failed', message: 'Known fixture failure' },
      });
    },
  },
  {
    name: 'fixture.wait',
    version: 1,
    effects: 'none',
    async execute({ inputs, signal }) {
      await delay(1000, undefined, { signal });
      return { status: 'succeeded', outputs: [Buffer.concat(inputs)] };
    },
  },
];

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  if (command !== 'run' && command !== 'inspect')
    throw new WorkflowError('invalid_options');
  const allowed =
    command === 'run'
      ? [
          '--db',
          '--run',
          '--workflow',
          '--external',
          '--retry-failed',
          '--timeout-ms',
        ]
      : ['--db', '--run'];
  const options = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i];
    const value = args[i + 1];
    if (
      !flag ||
      !value ||
      value.startsWith('--') ||
      !allowed.includes(flag) ||
      options.has(flag)
    )
      throw new WorkflowError('invalid_options');
    options.set(flag, value);
  }
  const path = options.get('--db');
  const runId = identifier(options.get('--run'));
  if (!path || !isAbsolute(path)) throw new WorkflowError('invalid_options');
  const timeoutText = options.get('--timeout-ms') ?? '30000';
  const timeoutMs = Number(timeoutText);
  if (
    !/^[1-9][0-9]*$/.test(timeoutText) ||
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs > 2147483647
  )
    throw new WorkflowError('invalid_options');
  let workflow: unknown;
  if (command === 'run') {
    const file = options.get('--workflow');
    if (!file || !isAbsolute(file)) throw new WorkflowError('invalid_options');
    try {
      workflow = JSON.parse(await readFile(file, 'utf8'));
    } catch {
      throw new WorkflowError('invalid_workflow');
    }
  }
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.once('SIGINT', cancel);
  process.once('SIGTERM', cancel);
  const store = await openSqlitePersistence(path);
  try {
    if (command === 'inspect') {
      const events = (await store.readEvents()).filter(
        (record) =>
          (record.event.type === 'block.started'
            ? record.event.runId
            : record.event.result.runId) === runId,
      );
      for (const record of events) {
        const event = record.event;
        process.stdout.write(
          JSON.stringify({
            sequence: record.sequence,
            type: event.type,
            blockId:
              event.type === 'block.started'
                ? event.manifest.blockId
                : event.result.blockId,
            attemptId:
              event.type === 'block.started'
                ? event.attemptId
                : event.result.attemptId,
            status:
              event.type === 'block.started' ? 'pending' : event.result.status,
          }) + '\n',
        );
      }
    } else {
      const report = await executeWorkflow(store, runId, workflow, handlers, {
        external: options.get('--external')?.split(',') ?? [],
        retryFailed: options.get('--retry-failed')?.split(',') ?? [],
        timeoutMs,
        signal: controller.signal,
      });
      process.stdout.write(JSON.stringify(report) + '\n');
      process.exitCode =
        report.status === 'succeeded'
          ? 0
          : report.status === 'blocked'
            ? 2
            : report.status === 'cancelled'
              ? 130
              : 1;
    }
  } finally {
    process.removeListener('SIGINT', cancel);
    process.removeListener('SIGTERM', cancel);
    await store.close();
  }
}

void main().catch((error: unknown) => {
  const code =
    error instanceof WorkflowError || error instanceof PersistenceError
      ? error.code
      : 'runtime_failure';
  process.stderr.write(JSON.stringify({ error: code }) + '\n');
  process.exitCode = 1;
});
