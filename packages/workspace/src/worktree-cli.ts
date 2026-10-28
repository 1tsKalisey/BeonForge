import { lstat } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';
import { openSqlitePersistence } from '@beonforge/persistence';
import { parseArtifactReference } from '@beonforge/contracts';
import {
  canonical,
  contains,
  prepareWorktree,
  createWorktree,
  inspectWorktree,
  ProjectError,
  type WorktreePolicy,
} from './index.js';

export async function runWorktreeCli(args: string[]): Promise<void> {
  const [command, ...rest] = args;
  if (command !== 'create' && command !== 'inspect')
    throw new ProjectError('invalid_project');
  const flags = new Map<string, string[]>();
  const allowed = [
    '--storage',
    '--ref',
    '--bytes',
    '--allow-root',
    '--git-root',
    '--common-root',
    '--write-root',
    '--execution-root',
    ...(command === 'create' ? ['--commit'] : []),
  ];
  for (let i = 0; i < rest.length; i += 2) {
    const key = rest[i],
      value = rest[i + 1];
    if (!key || !value || value.startsWith('--') || !allowed.includes(key))
      throw new ProjectError('invalid_project');
    flags.set(key, [...(flags.get(key) ?? []), value]);
  }
  const one = (key: string): string => {
    const v = flags.get(key);
    if (v?.length !== 1 || !v[0]) throw new ProjectError('invalid_project');
    return v[0];
  };
  const storageRoot = await canonical(one('--storage'));
  const stat = await lstat(storageRoot);
  if (
    !stat.isDirectory() ||
    (process.platform !== 'win32' &&
      ((stat.mode & 0o077) !== 0 || stat.uid !== process.getuid?.()))
  )
    throw new ProjectError('unsafe_path');
  const policy: WorktreePolicy = {
    storageRoot,
    roots: flags.get('--allow-root') ?? [],
    gitDirectories: flags.get('--git-root') ?? [],
    commonDirectories: flags.get('--common-root') ?? [],
    metadataWriteRoots: flags.get('--write-root') ?? [],
    executionRoots: flags.get('--execution-root') ?? [],
  };
  for (const path of [
    ...policy.roots,
    ...policy.gitDirectories,
    ...policy.commonDirectories,
    ...policy.metadataWriteRoots,
    ...policy.executionRoots,
  ]) {
    const other = await canonical(path);
    if (contains(other, storageRoot) || contains(storageRoot, other))
      throw new ProjectError('unsafe_path');
  }
  const bytes = one('--bytes');
  if (!/^(0|[1-9][0-9]*)$/.test(bytes))
    throw new ProjectError('invalid_descriptor');
  const reference = parseArtifactReference({
    sha256: one('--ref'),
    byteLength: Number(bytes),
  });
  const db = join(storageRoot, 'projects.sqlite');
  if (!(await lstat(db)).isFile()) throw new ProjectError('invalid_descriptor');
  const store = await openSqlitePersistence(db);
  try {
    if (command === 'inspect') {
      const report = await inspectWorktree(reference, policy, store);
      process.stdout.write(JSON.stringify(report) + '\n');
      process.exitCode =
        report.state === 'confirmed' || report.state === 'prepared' ? 0 : 2;
    } else {
      const intent = await prepareWorktree(
        reference,
        one('--commit'),
        one('--execution-root'),
        policy,
        store,
      );
      process.stdout.write(
        JSON.stringify({ state: 'prepared', intent }) + '\n',
      );
      const report = await createWorktree(intent, policy, store);
      process.stdout.write(JSON.stringify(report) + '\n');
      process.exitCode = report.state === 'confirmed' ? 0 : 2;
    }
  } finally {
    await store.close();
  }
}
