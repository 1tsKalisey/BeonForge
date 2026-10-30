// Test-only preload. Block any socket not targeting a mock owned by this suite,
// before Node can resolve a hostname or connect (also applies in CLI children).
import { Socket } from 'node:net';
import process from 'node:process';

const ports = new Set((process.env.BEONFORGE_TEST_PORTS ?? '').split(','));
export function allowTestPort(port) {
  ports.add(String(port));
}
export function assertTestDestination(options) {
  if (
    !options ||
    typeof options !== 'object' ||
    !['127.0.0.1', '::1'].includes(options.host) ||
    String(options.port) === '11434' ||
    !ports.has(String(options.port))
  )
    throw new Error('test_network_denied');
}
const connect = Socket.prototype.connect;
Socket.prototype.connect = function (...args) {
  const options = Array.isArray(args[0]) ? args[0][0] : args[0];
  assertTestDestination(options);
  return connect.apply(this, args);
};
