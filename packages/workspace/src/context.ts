import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { constants } from 'node:fs';
import { lstat, open, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  parseArtifactReference,
  type ArtifactReference,
} from '@beonforge/contracts';
import type { ArtifactStore } from '@beonforge/persistence';
import {
  canonical,
  contains,
  contextWorkspaceSnapshot,
  WORKTREE_VALIDATION_SCOPE,
  ProjectError,
  type WorktreePolicy,
} from './workspace.js';

export class ContextError extends Error {
  constructor(
    public readonly code:
      | 'context_invalid'
      | 'context_denied'
      | 'context_limit'
      | 'context_sensitive'
      | 'context_changed'
      | 'context_integrity'
      | 'context_source_invalid',
  ) {
    super(code);
    this.name = 'ContextError';
  }
}
export interface ContextReadPolicy {
  readonly canRead: boolean;
  readonly allowedIntents: readonly ArtifactReference[];
  readonly allowedPaths: readonly string[];
}
export interface ContextPolicy extends ContextReadPolicy {
  readonly canPublish: boolean;
  readonly workspace: WorktreePolicy;
}
const LIMITS = Object.freeze({
  maxFiles: 16,
  maxFileBytes: 16384,
  maxTotalBytes: 32768,
});
const MAX_MANIFEST = 32768;
type ContextFile = Readonly<{
  path: string;
  artifact: ArtifactReference;
  mediaType: 'text/plain;charset=utf-8';
}>;
/** Hashes represent exact UTF-8 working-tree bytes, with no newline conversion or redaction. */
export interface ContextManifest {
  readonly schemaVersion: 1;
  readonly kind: 'context-package';
  readonly contentSource: 'working-tree-bytes';
  readonly privacyProfile: 'conservative-text-v1';
  readonly source: Readonly<{
    intent: ArtifactReference;
    receipt: ArtifactReference;
    project: ArtifactReference;
    commit: string;
  }>;
  readonly validationScope: typeof WORKTREE_VALIDATION_SCOPE;
  readonly policySha256: string;
  readonly limits: typeof LIMITS;
  readonly files: readonly ContextFile[];
  readonly totals: Readonly<{
    fileCount: number;
    byteLength: number;
    tokenEstimate: {
      algorithm: 'utf8-byte-units-v1';
      value: number;
      approximate: true;
      provider: null;
    };
  }>;
}
export interface ContextPackage {
  readonly manifest: ContextManifest;
  readonly files: readonly Readonly<{ path: string; bytes: Uint8Array }>[];
  /** Historical CAS data grants no authority over a live checkout. */
  readonly sourceValidation: 'historical-not-revalidated';
}
export interface ContextEnvelopeManifest {
  readonly schemaVersion: 1;
  readonly kind: 'context-envelope';
  readonly package: ArtifactReference;
  readonly operatorInstructions: ArtifactReference;
}
export interface ContextEnvelope {
  readonly manifest: ContextEnvelopeManifest;
  readonly operatorInstructions: string;
  readonly context: ContextPackage;
  readonly map: readonly Readonly<{
    path: string;
    artifact: ArtifactReference;
    byteLength: number;
  }>[];
  readonly authority: 'historical-data-only';
}
/** Existing read policies remain usable for reads; publication requires explicit true. */
export interface ContextEnvelopePolicy extends ContextReadPolicy {
  readonly canPublish?: boolean;
}
function envelopePolicy(
  value: unknown,
): asserts value is ContextEnvelopePolicy {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return fail('context_invalid');
    const p = {
      canRead: ownData(value, 'canRead'),
      canPublish: ownData(value, 'canPublish'),
      allowedIntents: ownData(value, 'allowedIntents'),
      allowedPaths: ownData(value, 'allowedPaths'),
    };
    if (
      (p.canRead !== undefined && typeof p.canRead !== 'boolean') ||
      !Array.isArray(p.allowedIntents) ||
      !Array.isArray(p.allowedPaths) ||
      p.allowedPaths.some((v: unknown) => typeof v !== 'string') ||
      (p.canPublish !== undefined && typeof p.canPublish !== 'boolean')
    )
      return fail('context_invalid');
    for (const ref of p.allowedIntents) parseArtifactReference(ref);
  } catch {
    return fail('context_invalid');
  }
}
/** Inspect live own descriptors on every authorization; never invoke accessors. */
function ownData(policy: unknown, key: string): unknown {
  try {
    if (
      !policy ||
      typeof policy !== 'object' ||
      Array.isArray(policy) ||
      types.isProxy(policy)
    )
      return fail('context_invalid');
    const descriptor = Object.getOwnPropertyDescriptor(policy, key);
    if (!descriptor) return undefined;
    if (!Object.hasOwn(descriptor, 'value')) return fail('context_invalid');
    return descriptor.value as unknown;
  } catch {
    return fail('context_invalid');
  }
}
function instructions(input: string | Uint8Array): Uint8Array {
  if (input?.length > 4096) return fail('context_limit');
  if (typeof input === 'string' && !input.isWellFormed())
    return fail('context_invalid');
  if (typeof input !== 'string' && !(input instanceof Uint8Array))
    return fail('context_invalid');
  const bytes =
    typeof input === 'string' ? Buffer.from(input, 'utf8') : Buffer.from(input);
  if (bytes.length > 4096) return fail('context_limit');
  // No code-expression exemptions: instructions are explicit text, not source code.
  text(bytes, 'operator-instructions.txt');
  return bytes;
}
export async function buildContextEnvelope(
  packageRef: ArtifactReference,
  operatorInstructions: string | Uint8Array,
  readPolicy: ContextEnvelopePolicy,
  store: ArtifactStore,
): Promise<ArtifactReference> {
  try {
    envelopePolicy(readPolicy);
    if (ownData(readPolicy, 'canPublish') !== true)
      return fail('context_denied');
    const ref = reference(packageRef);
    const bytes = instructions(operatorInstructions);
    await readContextPackage(ref, readPolicy, store);
    envelopePolicy(readPolicy);
    if (ownData(readPolicy, 'canPublish') !== true)
      return fail('context_denied');
    const instructionRef = await publish(store, bytes);
    // Recheck caller grants after asynchronous publication. Orphans are safe to retain.
    await readContextPackage(ref, readPolicy, store);
    envelopePolicy(readPolicy);
    if (ownData(readPolicy, 'canPublish') !== true)
      return fail('context_denied');
    const manifest: ContextEnvelopeManifest = {
      schemaVersion: 1,
      kind: 'context-envelope',
      package: ref,
      operatorInstructions: instructionRef,
    };
    return await publish(store, Buffer.from(JSON.stringify(manifest)));
  } catch (error) {
    if (error instanceof ContextError) throw error;
    return fail('context_integrity');
  }
}
export async function readContextEnvelope(
  envelopeRef: ArtifactReference,
  readPolicy: ContextReadPolicy,
  store: ArtifactStore,
): Promise<ContextEnvelope> {
  envelopePolicy(readPolicy);
  if (ownData(readPolicy, 'canRead') !== true) return fail('context_denied');
  const original = await verified(store, reference(envelopeRef), 4096);
  const raw = object(decode(original));
  const manifest: ContextEnvelopeManifest = {
    schemaVersion: 1,
    kind: 'context-envelope',
    package: reference(raw.package),
    operatorInstructions: reference(raw.operatorInstructions),
  };
  if (!Buffer.from(JSON.stringify(manifest)).equals(Buffer.from(original)))
    return fail('context_integrity');
  const context = await readContextPackage(manifest.package, readPolicy, store);
  const bytes = instructions(
    await verified(store, manifest.operatorInstructions, 4096),
  );
  envelopePolicy(readPolicy);
  authorize(
    context.manifest.source.intent,
    context.manifest.files.map((f) => f.path),
    readPolicy,
  );
  return {
    manifest,
    operatorInstructions: new TextDecoder('utf-8', {
      fatal: true,
      ignoreBOM: true,
    }).decode(bytes),
    context,
    map: context.manifest.files.map((f) => ({
      path: f.path,
      artifact: f.artifact,
      byteLength: f.artifact.byteLength,
    })),
    authority: 'historical-data-only',
  };
}
function fail(code: ContextError['code']): never {
  throw new ContextError(code);
}
function digest(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
function equal(a: ArtifactReference, b: ArtifactReference): boolean {
  return a.sha256 === b.sha256 && a.byteLength === b.byteLength;
}
function reference(value: unknown): ArtifactReference {
  try {
    return parseArtifactReference(value);
  } catch {
    return fail('context_integrity');
  }
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return fail('context_integrity');
  return value as Record<string, unknown>;
}
function pathName(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length > 240 ||
    !value ||
    value
      .split('/')
      .some(
        (p) =>
          !/^[A-Za-z0-9_. -]+$/.test(p) ||
          p === '.' ||
          p === '..' ||
          /[. ]$/.test(p) ||
          /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(p),
      )
  )
    return fail('context_invalid');
  const parts = value.split('/');
  if (
    parts.some((p) => /^\.git/i.test(p) && p !== '.gitignore') ||
    parts.slice(0, -1).includes('.gitignore') ||
    parts.some((p) =>
      /^(?:\.claude|knowledge|\.env.*|.*\.env(?:[._-].*)?|\.?private|\.?secrets?(?:\..*)?|\.?credentials?(?:\..*)?|\.htpasswd(?:\..*)?|\.aws|\.ssh|\.npmrc|\.netrc|\.pypirc|\.docker|\.kube|\.azure|\.gnupg|node_modules)$/i.test(
        p,
      ),
    ) ||
    /(?:^|\/)(?:id_rsa|id_ed25519)(?:\.|$)/i.test(value) ||
    /\.(?:pem|key|p12|pfx|crt|cer)$/i.test(value)
  )
    return fail('context_denied');
  return value;
}
function selection(values: readonly string[]): string[] {
  if (!Array.isArray(values) || !values.length) return fail('context_invalid');
  if (values.length > LIMITS.maxFiles) return fail('context_limit');
  const result = values.map(pathName).sort();
  if (new Set(result.map((p) => p.toLowerCase())).size !== result.length)
    return fail('context_invalid');
  return result;
}
function authorize(
  intent: ArtifactReference,
  paths: readonly string[],
  policy: ContextReadPolicy,
): void {
  envelopePolicy(policy);
  if (
    ownData(policy, 'canRead') !== true ||
    !policy.allowedIntents.some((r) => equal(reference(r), intent)) ||
    paths.some((p) => !policy.allowedPaths.includes(p))
  )
    return fail('context_denied');
}
function sensitiveAssignment(value: string, path: string): boolean {
  const assignments =
    /(?<![A-Za-z0-9])(?:[A-Za-z][A-Za-z0-9]*_)*(?:password|api[_-]?key|client[_-]?secret|secret[_-]access[_-]key|access[_-]key[_-]id|session[_-]token|(?:access[_-]|auth[_-]|refresh[_-])?token)["']?\s*([:=])\s*("[^"\r\n]*"|'[^'\r\n]*'|[^\s;,}\r\n]+)/gi;
  for (const match of value.matchAll(assignments)) {
    const raw = match[2]!;
    const quoted = raw.startsWith('"') || raw.startsWith("'");
    const literal = quoted ? raw.slice(1, -1) : raw;
    if (!literal || /^(example|changeme)$/i.test(literal)) continue;
    const prefix = value.slice(0, match.index);
    // Only narrow source-code declarations/property assignments permit a dotted
    // expression. Dotenv/YAML dotted values remain potentially secret literals.
    if (
      !quoted &&
      match[1] === '=' &&
      /\.[cm]?[jt]sx?$/.test(path) &&
      /(?:\b(?:const|let|var)\s+|\bthis\.)$/.test(prefix) &&
      /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+$/.test(raw)
    )
      continue;
    return true;
  }
  return false;
}
function text(bytes: Uint8Array, path: string): void {
  let value: string;
  try {
    value = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return fail('context_sensitive');
  }
  if (
    value.includes('\0') ||
    /-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-(?:(?:ant-api03-|proj-)[A-Za-z0-9_-]{20,}|[A-Za-z0-9]{20,})|(?:AKIA|ASIA)[A-Z0-9]{16})\b/i.test(
      value,
    ) ||
    sensitiveAssignment(value, path)
  )
    fail('context_sensitive');
}
async function verified(
  store: ArtifactStore,
  ref: ArtifactReference,
  maximum: number,
): Promise<Uint8Array> {
  if (ref.byteLength > maximum) return fail('context_limit');
  let bytes: Uint8Array;
  try {
    bytes = await store.readArtifact(ref);
  } catch {
    return fail('context_integrity');
  }
  if (bytes.byteLength !== ref.byteLength || digest(bytes) !== ref.sha256)
    return fail('context_integrity');
  return bytes;
}
async function publish(
  store: ArtifactStore,
  bytes: Uint8Array,
): Promise<ArtifactReference> {
  const expected = { sha256: digest(bytes), byteLength: bytes.byteLength };
  const ref = reference(await store.putArtifact(bytes));
  if (!equal(ref, expected)) return fail('context_integrity');
  await verified(store, ref, bytes.byteLength);
  return ref;
}
async function exactPath(root: string, path: string) {
  if ((await canonical(root)) !== root) return fail('context_changed');
  let current = root;
  const rootStat = await lstat(root, { bigint: true });
  if (!rootStat.isDirectory() || rootStat.ino === 0n)
    return fail('context_changed');
  const pins = [[rootStat.dev.toString(), rootStat.ino.toString()]];
  const parts = path.split('/');
  for (const [index, part] of parts.entries()) {
    // Enumerate names only at requested ancestors to enforce exact Windows spelling.
    if (!(await readdir(current)).includes(part))
      return fail('context_changed');
    current = join(current, part);
    const stat = await lstat(current, { bigint: true });
    if (
      stat.isSymbolicLink() ||
      stat.ino === 0n ||
      (index === parts.length - 1 ? !stat.isFile() : !stat.isDirectory()) ||
      (await canonical(current)) !== current ||
      !contains(root, current)
    )
      return fail('context_changed');
    pins.push([stat.dev.toString(), stat.ino.toString()]);
  }
  return { full: current, identity: JSON.stringify(pins) };
}
async function stamp(path: string): Promise<string> {
  const s = await lstat(path, { bigint: true });
  if (!s.isFile() || s.ino === 0n || s.nlink !== 1n)
    return fail('context_changed');
  return [s.dev, s.ino, s.size, s.mtimeNs, s.ctimeNs].join(':');
}
async function capture(root: string, path: string) {
  const route = await exactPath(root, path);
  const { full } = route;
  const before = await stamp(full);
  const handle = await open(
    full,
    constants.O_RDONLY |
      (process.platform === 'win32' ? 0 : constants.O_NOFOLLOW),
  );
  try {
    const s = await handle.stat({ bigint: true });
    if (
      [s.dev, s.ino, s.size, s.mtimeNs, s.ctimeNs].join(':') !== before ||
      !s.isFile()
    )
      return fail('context_changed');
    if (s.size > BigInt(LIMITS.maxFileBytes)) return fail('context_limit');
    const data = Buffer.alloc(LIMITS.maxFileBytes + 1);
    let count = 0;
    while (count < data.length) {
      const { bytesRead } = await handle.read(
        data,
        count,
        data.length - count,
        count,
      );
      if (!bytesRead) break;
      count += bytesRead;
    }
    if (count > LIMITS.maxFileBytes) return fail('context_limit');
    const after = await handle.stat({ bigint: true });
    if (
      count !== Number(s.size) ||
      [after.dev, after.ino, after.size, after.mtimeNs, after.ctimeNs].join(
        ':',
      ) !== before ||
      JSON.stringify(await exactPath(root, path)) !== JSON.stringify(route) ||
      (await stamp(full)) !== before
    )
      return fail('context_changed');
    const bytes = data.subarray(0, count);
    return { path, full, route, before, bytes };
  } finally {
    await handle.close();
  }
}
function totals(files: readonly ContextFile[]) {
  const byteLength = files.reduce((n, f) => n + f.artifact.byteLength, 0);
  if (byteLength > LIMITS.maxTotalBytes) return fail('context_limit');
  return {
    fileCount: files.length,
    byteLength,
    tokenEstimate: {
      algorithm: 'utf8-byte-units-v1' as const,
      value: byteLength,
      approximate: true as const,
      provider: null,
    },
  };
}
/** Capture only an explicit, newly authorized selection. No external tool execution or export. */
export async function buildContextPackage(
  intentRef: ArtifactReference,
  selectedPaths: readonly string[],
  policy: ContextPolicy,
  store: ArtifactStore,
): Promise<ArtifactReference> {
  try {
    const intent = reference(intentRef);
    const paths = selection(selectedPaths);
    authorize(intent, paths, policy);
    if (ownData(policy, 'canPublish') !== true) return fail('context_denied');
    const source = await contextWorkspaceSnapshot(
      intent,
      ownData(policy, 'workspace') as WorktreePolicy,
      store,
    );
    if (paths.some((p) => !source.files.some((f) => f.path === p)))
      return fail('context_denied');
    const captured = [];
    let total = 0;
    for (const path of paths) {
      const file = await capture(source.destination, path);
      const oid = createHash(source.objectFormat)
        .update(Buffer.from(`blob ${file.bytes.byteLength}\0`, 'ascii'))
        .update(file.bytes)
        .digest('hex');
      if (oid !== source.files.find((f) => f.path === path)?.oid)
        return fail('context_changed');
      text(file.bytes, path);
      total += file.bytes.length;
      if (total > LIMITS.maxTotalBytes) return fail('context_limit');
      captured.push(file);
    }
    const after = await contextWorkspaceSnapshot(
      intent,
      ownData(policy, 'workspace') as WorktreePolicy,
      store,
    );
    if (JSON.stringify(after) !== JSON.stringify(source))
      return fail('context_changed');
    for (const file of captured) {
      if (
        JSON.stringify(await exactPath(source.destination, file.path)) !==
          JSON.stringify(file.route) ||
        (await stamp(file.full)) !== file.before
      )
        return fail('context_changed');
    }
    authorize(intent, paths, policy);
    if (ownData(policy, 'canPublish') !== true) return fail('context_denied');
    const files: ContextFile[] = [];
    for (const f of captured) {
      authorize(intent, paths, policy);
      if (ownData(policy, 'canPublish') !== true) return fail('context_denied');
      files.push({
        path: f.path,
        artifact: await publish(store, f.bytes),
        mediaType: 'text/plain;charset=utf-8',
      });
    }
    authorize(intent, paths, policy);
    if (ownData(policy, 'canPublish') !== true) return fail('context_denied');
    const manifest: ContextManifest = {
      schemaVersion: 1,
      kind: 'context-package',
      contentSource: 'working-tree-bytes',
      privacyProfile: 'conservative-text-v1',
      source: {
        intent,
        receipt: source.receipt,
        project: source.project,
        commit: source.commit,
      },
      validationScope: WORKTREE_VALIDATION_SCOPE,
      policySha256: digest(
        Buffer.from(
          JSON.stringify({
            schemaVersion: 1,
            allowedIntents: policy.allowedIntents
              .map(reference)
              .sort((a, b) => a.sha256.localeCompare(b.sha256)),
            allowedPaths: [...new Set(policy.allowedPaths)].sort(),
          }),
        ),
      ),
      limits: LIMITS,
      files,
      totals: totals(files),
    };
    const bytes = Buffer.from(JSON.stringify(manifest));
    if (bytes.length > MAX_MANIFEST) return fail('context_limit');
    return await publish(store, bytes);
  } catch (error) {
    if (error instanceof ContextError) throw error;
    if (error instanceof ProjectError && error.code === 'permission_denied')
      return fail('context_denied');
    return fail('context_source_invalid');
  }
}
function decode(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(bytes),
    ) as unknown;
  } catch {
    return fail('context_integrity');
  }
}
/** Historical read requires fresh grants; a manifest is evidence, never permission. */
export async function readContextPackage(
  packageRef: ArtifactReference,
  policy: ContextReadPolicy,
  store: ArtifactStore,
): Promise<ContextPackage> {
  try {
    envelopePolicy(policy);
    if (ownData(policy, 'canRead') !== true) return fail('context_denied');
    const raw = object(
      decode(await verified(store, reference(packageRef), MAX_MANIFEST)),
    );
    const source = object(raw.source);
    const intent = reference(source.intent);
    if (!Array.isArray(raw.files)) return fail('context_integrity');
    const paths = selection(raw.files.map((f) => pathName(object(f).path)));
    authorize(intent, paths, policy);
    const files: ContextFile[] = raw.files.map((f) => {
      const item = object(f);
      const artifact = reference(item.artifact);
      if (artifact.byteLength > LIMITS.maxFileBytes)
        return fail('context_limit');
      const file: ContextFile = {
        path: pathName(item.path),
        artifact,
        mediaType: 'text/plain;charset=utf-8',
      };
      if (JSON.stringify(file) !== JSON.stringify(item))
        return fail('context_integrity');
      return file;
    });
    const receipt = reference(source.receipt),
      project = reference(source.project);
    if (
      typeof source.commit !== 'string' ||
      !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(source.commit) ||
      typeof raw.policySha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(raw.policySha256)
    )
      return fail('context_integrity');
    const manifest: ContextManifest = {
      schemaVersion: 1,
      kind: 'context-package',
      contentSource: 'working-tree-bytes',
      privacyProfile: 'conservative-text-v1',
      source: { intent, receipt, project, commit: source.commit },
      validationScope: WORKTREE_VALIDATION_SCOPE,
      policySha256: raw.policySha256,
      limits: LIMITS,
      files,
      totals: totals(files),
    };
    if (
      JSON.stringify(manifest) !== JSON.stringify(raw) ||
      files.some((f, i) => f.path !== paths[i])
    )
      return fail('context_integrity');
    const lineage = object(decode(await verified(store, receipt, 4096)));
    if (
      lineage.schemaVersion !== 1 ||
      lineage.kind !== 'worktree-receipt' ||
      lineage.commit !== source.commit ||
      !equal(reference(lineage.intent), intent) ||
      !equal(reference(lineage.project), project)
    )
      return fail('context_integrity');
    const origin = object(decode(await verified(store, intent, 65536)));
    const descriptor = object(decode(await verified(store, project, 65536)));
    if (
      origin.schemaVersion !== 1 ||
      origin.kind !== 'worktree-intent' ||
      origin.commit !== source.commit ||
      descriptor.schemaVersion !== 1 ||
      descriptor.kind !== 'worktree'
    )
      return fail('context_integrity');
    const content = [];
    for (const file of files) {
      authorize(intent, [file.path], policy);
      const bytes = await verified(store, file.artifact, LIMITS.maxFileBytes);
      text(bytes, file.path);
      content.push({ path: file.path, bytes });
    }
    authorize(intent, paths, policy);
    return {
      manifest,
      files: content,
      sourceValidation: 'historical-not-revalidated',
    };
  } catch (error) {
    if (error instanceof ContextError) throw error;
    return fail('context_integrity');
  }
}
