import process from 'node:process';
import {
  prepareBugfixDemo,
  runBugfixDemo,
  inspectBugfixDemo,
  reviewBugfixDemo,
  BugfixError,
} from './demo.ts';

const args = process.argv.slice(2);
const action = args.shift();
const options = new Map();
const flags = new Set([
  '--allow-create-synthetic',
  '--allow-fixture-read',
  '--allow-fixture-execution',
  '--allow-fixed-patch',
  '--allow-fixture-review',
  '--allow-discard',
]);
const values = new Set([
  '--parent',
  '--root',
  '--patch-sha256',
  '--evidence-sha256',
  '--decision',
]);
const controller = new globalThis.AbortController();
const interrupt = () => controller.abort();
process.once('SIGINT', interrupt);
process.once('SIGTERM', interrupt);
try {
  while (args.length) {
    const key = args.shift();
    if (options.has(key) || (!flags.has(key) && !values.has(key)))
      throw new BugfixError('demo_invalid');
    const value = flags.has(key) ? true : args.shift();
    if (
      value === undefined ||
      (typeof value === 'string' && value.startsWith('--'))
    )
      throw new BugfixError('demo_invalid');
    options.set(key, value);
  }
  const required = (key) => {
    const value = options.get(key);
    if (typeof value !== 'string') throw new BugfixError('demo_invalid');
    return value;
  };
  let result;
  if (action === 'prepare') {
    if (options.get('--allow-create-synthetic') !== true || options.size !== 2)
      throw new BugfixError('demo_denied');
    result = await prepareBugfixDemo(required('--parent'));
  } else {
    const root = required('--root');
    const policy = {
      root,
      canRead: options.get('--allow-fixture-read') === true,
      canRun: options.get('--allow-fixture-execution') === true,
      canPatch: options.get('--allow-fixed-patch') === true,
      patchSha256: options.get('--patch-sha256'),
      canReview: options.get('--allow-fixture-review') === true,
      canDiscard: options.get('--allow-discard') === true,
    };
    if (action === 'run')
      result = await runBugfixDemo(root, policy, controller.signal);
    else if (action === 'inspect')
      result = await inspectBugfixDemo(root, policy);
    else if (action === 'review')
      result = await reviewBugfixDemo(
        root,
        required('--decision'),
        required('--evidence-sha256'),
        policy,
        controller.signal,
      );
    else throw new BugfixError('demo_invalid');
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exitCode = result.report
    ? result.report.status === 'succeeded'
      ? 0
      : result.report.status === 'blocked'
        ? 2
        : result.report.status === 'cancelled'
          ? 130
          : 1
    : 0;
} catch (error) {
  process.stdout.write(
    `${JSON.stringify({ code: error instanceof BugfixError ? error.code : 'demo_invalid' })}\n`,
  );
  process.exitCode =
    error instanceof BugfixError &&
    error.code === 'demo_interrupted' &&
    controller.signal.aborted
      ? 130
      : 1;
} finally {
  process.removeListener('SIGINT', interrupt);
  process.removeListener('SIGTERM', interrupt);
}
