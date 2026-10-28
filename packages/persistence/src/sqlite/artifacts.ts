import { createHash, randomUUID } from 'node:crypto';
import {
  constants,
  openSync,
  closeSync,
  writeFileSync,
  fsyncSync,
  fstatSync,
  readFileSync,
  lstatSync,
  mkdirSync,
  linkSync,
  unlinkSync,
  readdirSync,
} from 'node:fs';
import { isAbsolute, parse, join, relative, resolve, dirname } from 'node:path';
import process from 'node:process';
import {
  parseArtifactReference,
  type ArtifactReference,
} from '@beonforge/contracts';
import { PersistenceError } from '../event-store.js';

export function isCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === code
  );
}

export function entryExists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch (error) {
    if (isCode(error, 'ENOENT')) return false;
    throw error;
  }
}

/** Walk every component; reject traversal, symlinks and junctions instead of following them. */
export function directory(path: string, create = false): string {
  if (
    typeof path !== 'string' ||
    !isAbsolute(path) ||
    (process.platform === 'win32' && !/^[A-Za-z]:[\\/]/.test(path)) ||
    path.split(/[\\/]/).some((part) => part === '.' || part === '..')
  )
    throw new PersistenceError('unsafe_path');
  const absolute = resolve(path);
  const root = parse(absolute).root;
  let current = root;
  for (const part of relative(root, absolute).split(/[\\/]/).filter(Boolean)) {
    current = join(current, part);
    try {
      const stat = lstatSync(current);
      if (!stat.isDirectory() || stat.isSymbolicLink())
        throw new PersistenceError('unsafe_path');
    } catch (error) {
      if (!create || !isCode(error, 'ENOENT'))
        throw new PersistenceError('unsafe_path');
      try {
        mkdirSync(current, { mode: 0o700 });
      } catch (race) {
        if (!isCode(race, 'EEXIST')) throw race;
      }
      const created = lstatSync(current);
      if (!created.isDirectory() || created.isSymbolicLink())
        throw new PersistenceError('unsafe_path');
      syncDirectory(dirname(current));
    }
  }
  return absolute;
}

export function digest(bytes: Uint8Array): ArtifactReference {
  return {
    sha256: createHash('sha256').update(bytes).digest('hex'),
    byteLength: bytes.byteLength,
  };
}

export function syncDirectory(path: string): void {
  // Node cannot portably fsync directory handles on Windows. Never infer power-loss safety there.
  if (process.platform === 'win32') return;
  const fd = openSync(
    directory(path),
    constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
  );
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

/** Pinned private directory capability. Not a sandbox against its privileged owner. */
export class SafeDirectory {
  readonly path: string;
  private readonly identity: { dev: number; ino: number };
  constructor(path: string, create = false) {
    this.path = directory(path, create);
    this.identity = lstatSync(this.path);
    const stat = lstatSync(this.path);
    if (
      process.platform !== 'win32' &&
      ((stat.mode & 0o022) !== 0 || stat.uid !== process.getuid?.())
    )
      throw new PersistenceError('unsafe_path');
  }
  check(): void {
    directory(this.path);
    const stat = lstatSync(this.path);
    if (stat.dev !== this.identity.dev || stat.ino !== this.identity.ino)
      throw new PersistenceError('unsafe_path');
  }
  file(name: string): string {
    this.check();
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) || name.trim() !== name)
      throw new PersistenceError('unsafe_path');
    return join(this.path, name);
  }
  read(name: string): Uint8Array {
    const path = this.file(name);
    let fd: number;
    try {
      const before = lstatSync(path);
      if (!before.isFile() || before.isSymbolicLink())
        throw new PersistenceError('unsafe_path');
      fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
      try {
        const opened = fstatSync(fd);
        if (
          !opened.isFile() ||
          opened.dev !== before.dev ||
          opened.ino !== before.ino
        )
          throw new PersistenceError('unsafe_path');
        const bytes = readFileSync(fd);
        this.check();
        const after = lstatSync(path);
        if (
          after.isSymbolicLink() ||
          after.dev !== opened.dev ||
          after.ino !== opened.ino
        )
          throw new PersistenceError('unsafe_path');
        return bytes;
      } finally {
        closeSync(fd);
      }
    } catch (error) {
      if (isCode(error, 'ENOENT'))
        throw new PersistenceError('artifact_missing');
      throw error;
    }
  }
  writeExclusive(name: string, bytes: Uint8Array): void {
    const fd = openSync(
      this.file(name),
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        (constants.O_NOFOLLOW ?? 0),
      0o600,
    );
    try {
      writeFileSync(fd, bytes);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    syncDirectory(this.path);
    this.check();
  }
}

interface StagedArtifact {
  readonly name: string;
  readonly reference: ArtifactReference;
}

export class ArtifactFiles {
  readonly root: SafeDirectory;
  private readonly blobs: SafeDirectory;
  private readonly staging: SafeDirectory;
  constructor(root: string, create = true) {
    this.root = new SafeDirectory(root, create);
    this.blobs = new SafeDirectory(join(this.root.path, 'blobs'), create);
    this.staging = new SafeDirectory(join(this.root.path, 'staging'), create);
  }
  stage(bytes: Uint8Array): StagedArtifact {
    if (!(bytes instanceof Uint8Array))
      throw new PersistenceError('invalid_input');
    this.root.check();
    const reference = digest(bytes);
    const name = `${randomUUID()}.tmp`;
    this.staging.writeExclusive(name, bytes);
    return { name, reference };
  }
  publish(staged: StagedArtifact): ArtifactReference {
    this.root.check();
    const reference = parseArtifactReference(staged.reference);
    if (!/^[a-f0-9-]{36}\.tmp$/.test(staged.name))
      throw new PersistenceError('unsafe_path');
    const bytes = this.staging.read(staged.name);
    this.verify(bytes, reference);
    try {
      linkSync(
        this.staging.file(staged.name),
        this.blobs.file(reference.sha256),
      );
    } catch (error) {
      if (!isCode(error, 'EEXIST')) throw error;
    }
    this.read(reference); // EEXIST is deduplication only if the existing content is correct.
    syncDirectory(this.blobs.path);
    this.staging.check();
    unlinkSync(this.staging.file(staged.name));
    syncDirectory(this.staging.path);
    return reference;
  }
  put(bytes: Uint8Array): ArtifactReference {
    return this.publish(this.stage(bytes));
  }
  read(value: ArtifactReference): Uint8Array {
    this.root.check();
    const reference = parseArtifactReference(value);
    const bytes = this.blobs.read(reference.sha256);
    this.verify(bytes, reference);
    return bytes;
  }
  list(): readonly ArtifactReference[] {
    this.root.check();
    this.blobs.check();
    return readdirSync(this.blobs.path)
      .sort()
      .map((name) => {
        if (!/^[a-f0-9]{64}$/.test(name))
          throw new PersistenceError('integrity_failure');
        const bytes = this.blobs.read(name);
        const reference = digest(bytes);
        if (reference.sha256 !== name)
          throw new PersistenceError('integrity_failure');
        return reference;
      });
  }
  private verify(bytes: Uint8Array, reference: ArtifactReference): void {
    const actual = digest(bytes);
    if (
      actual.sha256 !== reference.sha256 ||
      actual.byteLength !== reference.byteLength
    )
      throw new PersistenceError('integrity_failure');
  }
}
