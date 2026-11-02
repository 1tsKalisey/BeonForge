// Trusted synthetic test process. Not a provider or a process sandbox.
import process from 'node:process';
import { Buffer } from 'node:buffer';
import { TextDecoder } from 'node:util';
import { setTimeout, setImmediate } from 'node:timers/promises';

const modes = new Set([
  'success',
  'fragmented',
  'invalid-json',
  'fail',
  'wait',
]);
const mode = process.argv[2];
const reject = () => {
  process.stderr.write('fixture_invalid\n');
  process.exitCode = 2;
};
if (process.argv.length !== 3 || !modes.has(mode)) {
  reject();
} else {
  let size = 0;
  const chunks = [];
  try {
    for await (const chunk of process.stdin) {
      size += chunk.length;
      if (size > 65536) throw new Error();
      chunks.push(chunk);
    }
    const text = new TextDecoder('utf-8', { fatal: true }).decode(
      Buffer.concat(chunks),
    );
    const input = JSON.parse(text);
    if (
      input === null ||
      Array.isArray(input) ||
      typeof input !== 'object' ||
      Object.keys(input).sort().join(',') !==
        'baseCommit,preimageSha256,schemaVersion' ||
      input.schemaVersion !== 1 ||
      typeof input.baseCommit !== 'string' ||
      !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(input.baseCommit) ||
      typeof input.preimageSha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(input.preimageSha256)
    )
      throw new Error();
    const output =
      JSON.stringify({ schemaVersion: 1, type: 'started' }) +
      '\n' +
      JSON.stringify({
        schemaVersion: 1,
        type: 'proposal',
        baseCommit: input.baseCommit,
        path: 'src/add.ts',
        preimageSha256: input.preimageSha256,
        content:
          'export function add(a: number, b: number): number {\n  return a + b;\n}\n',
        label: 'corrección sintética',
      }) +
      '\n';
    if (mode === 'wait') await setTimeout(60000);
    else if (mode === 'fail') {
      process.stderr.write('fixture_failure\n');
      process.exitCode = 3;
    } else if (mode === 'invalid-json') process.stdout.write('{invalid\n');
    else if (mode === 'fragmented') {
      // One-byte chunks deliberately split UTF-8 code points and JSON lines.
      for (const byte of Buffer.from(output)) {
        process.stdout.write(Buffer.from([byte]));
        await setImmediate();
      }
    } else process.stdout.write(output);
  } catch {
    reject();
  }
}
