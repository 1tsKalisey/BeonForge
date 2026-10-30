// Not part of the automatic suite. Invoke only with express operator authorization.
import process from 'node:process';
import assert from 'node:assert/strict';
import { probeOllama } from '../dist/index.js';

const [authorization, endpoint, ...extra] = process.argv.slice(2);
assert.equal(authorization, '--authorize-real-probe');
assert.equal(extra.length, 0);
assert.equal(typeof endpoint, 'string');
const result = await probeOllama({ endpoint, allowLocalProbe: true });
assert.equal(result.schemaVersion, 1);
assert.ok(['available', 'available_no_models'].includes(result.status));
process.stdout.write(`${JSON.stringify(result)}\n`);
