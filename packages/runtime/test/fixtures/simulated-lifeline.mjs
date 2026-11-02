// Trusted direct-child lifeline, not a Windows Job Object or subtree sandbox.
import process from 'node:process';
if (!process.channel) process.exit(4);
process.on('disconnect', () => process.exit(4));
process.channel.unref();
