// Enable proxy before Node starts; prove global agent use before/after env
// removal, then verify that the probe's private agent still connects directly.
import process from 'node:process';
import { get } from 'node:http';
import assert from 'node:assert/strict';
import { URL } from 'node:url';
import { probeOllama } from '../../dist/index.js';

const [endpoint] = process.argv.slice(2);
async function viaGlobal(path) {
  await new Promise((resolve, reject) => {
    get(new URL(path, endpoint), (res) => {
      assert.equal(res.statusCode, 200);
      res.resume();
      res.on('end', resolve);
      res.on('error', reject);
    }).on('error', reject);
  });
}
await viaGlobal('/proxy-before');
for (const key of [
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'ALL_PROXY',
  'http_proxy',
  'https_proxy',
  'all_proxy',
])
  delete process.env[key];
await viaGlobal('/proxy-after');
process.stdout.write(
  `${JSON.stringify(await probeOllama({ endpoint, allowLocalProbe: true }))}\n`,
);
