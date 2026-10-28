import process from 'node:process';

// Portable signal boundaries around the real compiled CLI, never fabricated RunReports.
// Calls delegate to the original process APIs; no persistence or timer result is mocked.
if (process.env.BEONFORGE_INTERRUPT_STAGE === 'after-report') {
  const write = process.stdout.write.bind(process.stdout);
  let interrupted = false;
  process.stdout.write = (...args) => {
    if (
      !interrupted &&
      typeof args[0] === 'string' &&
      args[0].startsWith('{"runId":')
    ) {
      interrupted = true;
      process.emit('SIGINT');
    }
    return write(...args);
  };
} else if (process.env.BEONFORGE_INTERRUPT_STAGE === 'before-runtime') {
  const once = process.once.bind(process);
  process.once = (...args) => {
    const result = once(...args);
    if (args[0] === 'SIGTERM' && process.listenerCount('SIGINT') > 0)
      process.emit('SIGINT');
    return result;
  };
}
