import { it, expect } from 'vitest';
import { execFile } from 'node:child_process';
import process from 'node:process';
import { SENTINEL, TREE, PROFILE } from '../examples/codex/probes.ts';
import {
  assessPreflight,
  runCodexPreflight,
  type PreflightFacts,
} from '../examples/codex/preflight.ts';
import { openSqlitePersistence } from '@beonforge/persistence';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

function facts(): PreflightFacts {
  return {
    identityVerified: true,
    startupVerified: true,
    loopbackControl: true,
    sentinel: {
      allowedRead: true,
      allowedWrite: true,
      outsideReadDenied: true,
      outsideWriteDenied: true,
      readonlyWriteDenied: true,
      network: 'denied',
    },
    normal: {
      initial: true,
      terminated: true,
      observedBeforeExpiry: true,
      cleanupConfirmed: true,
    },
    cancelled: {
      initial: true,
      terminated: true,
      observedBeforeExpiry: true,
      cleanupConfirmed: true,
    },
  };
}
it('even successful command probes do not authorize the CLI host or a real agent', () => {
  const r = assessPreflight(facts());
  expect(r).toMatchObject({
    status: 'BLOCKED',
    commandSandbox: 'PASS',
    readyForAgent: false,
    hostBoundary: 'not_proven',
    externalNetwork: 'not_tested',
  });
  expect(r.blockers).toEqual(['cli_host_and_agent_tools_not_proven']);
});
it.each(['identityVerified', 'startupVerified', 'loopbackControl'] as const)(
  'missing %s blocks command preflight',
  (key) => {
    const f = facts();
    f[key] = false;
    expect(assessPreflight(f).commandSandbox).toBe('BLOCKED');
  },
);
it.each([
  'allowedRead',
  'allowedWrite',
  'outsideReadDenied',
  'outsideWriteDenied',
  'readonlyWriteDenied',
] as const)('failed sentinel %s blocks, not interpreted as a pass', (key) => {
  const f = facts();
  f.sentinel![key] = false;
  expect(assessPreflight(f).commandSandbox).toBe('BLOCKED');
});
it.each(['connected', 'inconclusive'] as const)(
  'network %s is not proof of denial',
  (network) => {
    const f = facts();
    f.sentinel!.network = network;
    expect(assessPreflight(f).blockers).toContain(
      'loopback_boundary_unverified',
    );
  },
);
it.each(['normal', 'cancelled'] as const)(
  'missing %s tree evidence blocks',
  (key) => {
    const f = facts();
    f[key] = null;
    expect(assessPreflight(f).commandSandbox).toBe('BLOCKED');
  },
);
it.each([
  'initial',
  'terminated',
  'observedBeforeExpiry',
  'cleanupConfirmed',
] as const)('tree %s is required, self-expiry is not confinement', (key) => {
  const f = facts();
  f.normal![key] = false;
  expect(assessPreflight(f).commandSandbox).toBe('BLOCKED');
});
it('unknown sentinel or failed positive controls cannot be called a sandbox success', () => {
  const f = facts();
  f.sentinel = null;
  expect(assessPreflight(f).commandSandbox).toBe('BLOCKED');
});
it('profile selects MXC/network off and no broad filesystem read or fallback', () => {
  expect(PROFILE).toContain('sandbox = "mxc"');
  expect(PROFILE).toContain('":root" = "deny"');
  expect(PROFILE).toContain('enabled = false');
  expect(PROFILE).not.toContain('danger-full-access');
  expect(PROFILE).not.toContain('unelevated');
});
it.each([SENTINEL, TREE])(
  'authored eval probes have valid module syntax without executing them',
  async (source) => {
    await new Promise<void>((resolve, reject) => {
      const child = execFile(
        process.execPath,
        ['--check', '--input-type=module'],
        {
          timeout: 5000,
          maxBuffer: 65536,
          env: { SystemRoot: process.env.SystemRoot },
        },
        (e) => (e ? reject(new Error('probe_syntax_invalid')) : resolve()),
      );
      child.stdin!.on('error', () => reject(new Error('probe_input_failed')));
      child.stdin!.end(source);
    });
  },
);
it('no authorization means no diagnostic effects and existing CAS preserves a blocked report after restart', async () => {
  const temp = realpathSync.native(tmpdir());
  const root = mkdtempSync(join(temp, 'beonforge-c1-store-test-'));
  const db = join(root, 'events.sqlite');
  let store = await openSqlitePersistence(db);
  try {
    await expect(
      runCodexPreflight('not-authorized', 'not-a-binary', false, store),
    ).rejects.toThrow('preflight_invalid');
    expect(await store.readEvents()).toHaveLength(0);
    const data = Buffer.from(JSON.stringify(assessPreflight(facts())));
    const ref = await store.putArtifact(data);
    await store.close();
    store = await openSqlitePersistence(db);
    expect(Buffer.from(await store.readArtifact(ref))).toEqual(data);
  } finally {
    await store.close();
    expect(dirname(realpathSync(root))).toBe(temp);
    rmSync(root, { recursive: true });
  }
});

it('a different binary is never executed and its blocked diagnostic survives reopening', async () => {
  const temp = realpathSync.native(tmpdir());
  const parent = mkdtempSync(join(temp, 'beonforge-c1-authorized-'));
  const evidence = mkdtempSync(join(temp, 'beonforge-c1-store-test-'));
  const db = join(evidence, 'report.sqlite');
  let store = await openSqlitePersistence(db);
  try {
    if (process.platform === 'win32') {
      const rejectedBinary = join(evidence, 'synthetic.exe');
      writeFileSync(rejectedBinary, 'synthetic-not-an-executable', {
        flag: 'wx',
      });
      const result = await runCodexPreflight(
        parent,
        rejectedBinary,
        true,
        store,
      );
      expect(result.report.blockers).toContain('binary_identity_unverified');
      expect(result.report.evidence).toEqual({});
      await store.close();
      store = await openSqlitePersistence(db);
      const report = JSON.parse(
        Buffer.from(await store.readArtifact(result.reference)).toString(),
      ) as { status: string; readyForAgent: boolean };
      expect(report).toMatchObject({ status: 'BLOCKED', readyForAgent: false });
    } else
      await expect(
        runCodexPreflight(parent, process.execPath, true, store),
      ).rejects.toThrow('preflight_invalid');
  } finally {
    await store.close();
    for (const root of [parent, evidence]) {
      expect(dirname(realpathSync(root))).toBe(temp);
      rmSync(root, { recursive: true });
    }
  }
});
