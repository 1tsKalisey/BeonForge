import process from 'node:process';
import { lstat } from 'node:fs/promises';
import { join } from 'node:path';
import {
  openSqlitePersistence,
  PersistenceError,
} from '@beonforge/persistence';
import {
  canonical,
  contains,
  inspectProject,
  registerProject,
  ProjectError,
  type ProjectPolicy,
} from './index.js';

async function main(): Promise<void> {
  const [subject, command, ...args] = process.argv.slice(2);
  if (subject === 'project' && command === 'worktree') {
    await (await import('./worktree-cli.js')).runWorktreeCli(args);
    return;
  }
  if (
    subject !== 'project' ||
    (command !== 'register' && command !== 'inspect')
  )
    throw new ProjectError('invalid_project');
  const flags = new Map<string, string[]>();
  const allowed = [
    '--storage',
    '--git-root',
    '--common-root',
    ...(command === 'register'
      ? ['--root']
      : ['--allow-root', '--ref', '--bytes']),
  ];
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    const value = args[i + 1];
    if (!key || !value || value.startsWith('--') || !allowed.includes(key))
      throw new ProjectError('invalid_project');
    flags.set(key, [...(flags.get(key) ?? []), value]);
  }
  const one = (key: string): string => {
    const values = flags.get(key);
    if (values?.length !== 1 || !values[0])
      throw new ProjectError('invalid_project');
    return values[0];
  };
  const storage = await canonical(one('--storage'));
  const storageStat = await lstat(storage);
  if (
    !storageStat.isDirectory() ||
    (process.platform !== 'win32' &&
      ((storageStat.mode & 0o077) !== 0 ||
        storageStat.uid !== process.getuid?.()))
  )
    throw new ProjectError('unsafe_path');
  const root = command === 'register' ? one('--root') : undefined;
  const policy: ProjectPolicy = {
    roots: root ? [root] : (flags.get('--allow-root') ?? []),
    gitDirectories: flags.get('--git-root') ?? [],
    commonDirectories: flags.get('--common-root') ?? [],
  };
  if (!policy.roots.length) throw new ProjectError('permission_denied');
  for (const value of [
    ...policy.roots,
    ...policy.gitDirectories,
    ...policy.commonDirectories,
  ]) {
    const other = await canonical(value);
    if (contains(other, storage) || contains(storage, other))
      throw new ProjectError('unsafe_path');
  }
  const reference =
    command === 'inspect'
      ? { sha256: one('--ref'), byteLength: Number(one('--bytes')) }
      : undefined;
  if (
    reference &&
    (!/^[a-f0-9]{64}$/.test(reference.sha256) ||
      !/^(0|[1-9][0-9]*)$/.test(one('--bytes')) ||
      !Number.isSafeInteger(reference.byteLength))
  )
    throw new ProjectError('invalid_descriptor');
  const database = join(storage, 'projects.sqlite');
  if (command === 'inspect') {
    const stat = await lstat(database).catch(() => {
      throw new ProjectError('invalid_descriptor');
    });
    if (!stat.isFile() || !stat.size)
      throw new ProjectError('invalid_descriptor');
  }
  const store = await openSqlitePersistence(database);
  try {
    const result = root
      ? await registerProject(root, policy, store)
      : reference
        ? await inspectProject(reference, policy, store)
        : null;
    process.stdout.write(JSON.stringify(result) + '\n');
  } finally {
    await store.close();
  }
}
void main().catch((error: unknown) => {
  process.stderr.write(
    JSON.stringify({
      error:
        error instanceof ProjectError || error instanceof PersistenceError
          ? error.code
          : 'project_failure',
    }) + '\n',
  );
  process.exitCode = 1;
});
