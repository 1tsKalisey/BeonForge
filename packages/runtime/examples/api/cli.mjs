// B06-01 synthetic-only local API. One explicit operator authorization flag.
import process from 'node:process';
import console from 'node:console';
import { existsSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { startApiServer } from './server.ts';

const args = process.argv.slice(2);
const options = new Map();
const values = new Set(['--data', '--port', '--web']);
while (args.length) {
  const key = args.shift();
  if (options.has(key)) throw new Error('duplicate_argument');
  if (key === '--allow-synthetic-tasks') options.set(key, true);
  else if (values.has(key)) {
    const value = args.shift();
    if (value === undefined || value.startsWith('--'))
      throw new Error('missing_value');
    options.set(key, value);
  } else throw new Error('unknown_argument');
}
if (options.get('--allow-synthetic-tasks') !== true || !options.has('--data'))
  throw new Error('explicit_synthetic_authorization_required');
const port = options.has('--port') ? Number(options.get('--port')) : 4317;
if (!Number.isInteger(port) || port < 0 || port > 65535)
  throw new Error('invalid_port');
const defaultWeb = fileURLToPath(
  new URL('../../../../apps/web/dist/web/browser', import.meta.url),
);
const webRoot =
  options.get('--web') ?? (existsSync(defaultWeb) ? defaultWeb : null);

const server = await startApiServer({
  dataDirectory: options.get('--data'),
  port,
  webRoot,
});
console.log(
  JSON.stringify({
    url: server.url,
    simulatedOnly: true,
    web: webRoot !== null,
  }),
);
const stop = () => {
  void server.close().then(() => process.exit(0));
};
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
