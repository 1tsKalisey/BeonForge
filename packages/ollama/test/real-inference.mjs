// Outside automatic tests. Never invoke without express operator consent.
import process from 'node:process';
import assert from 'node:assert/strict';
import {
  prepareSyntheticInference,
  runSyntheticInference,
} from '../dist/index.js';

const [consent, localOnly, endpoint, model, payloadSha256, ...extra] =
  process.argv.slice(2);
assert.equal(consent, '--authorize-real-inference');
assert.equal(localOnly, '--local-only-confirmed');
assert.equal(extra.length, 0);
assert.equal(typeof endpoint, 'string');
assert.equal(typeof model, 'string');
assert.equal(typeof payloadSha256, 'string');
const preview = prepareSyntheticInference({ endpoint, model });
// Consent binds the exact preview, not a freshly invented payload/hash.
assert.equal(payloadSha256, preview.payloadSha256);
const result = await runSyntheticInference(preview, {
  canInfer: true,
  allowLocalProbe: true,
  endpoint,
  model,
  payloadSha256,
});
assert.equal(result.answer, 4);
process.stdout.write(`${JSON.stringify(result)}\n`);
