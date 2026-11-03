// Strict incremental JSONL parser for a documented subset of Codex exec output.
// Not a general Codex format compatibility claim. Fail-closed on any ambiguity.
import { types } from 'node:util';

export class ParseError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
    this.name = 'ParseError';
  }
}

export interface ParseLimits {
  readonly maxLineBytes: number;   // per UTF-8-encoded line
  readonly maxTotalBytes: number;  // total buffer
  readonly maxEvents: number;      // maximum lines
}

export const DEFAULT_PARSE_LIMITS: ParseLimits = {
  maxLineBytes: 65536,
  maxTotalBytes: 1048576,
  maxEvents: 4096,
};

// Only these event types are recognised. Unknown types fail-closed.
export type CodexEvent =
  | { readonly schemaVersion: 1; readonly type: 'started' }
  | {
      readonly schemaVersion: 1;
      readonly type: 'message';
      readonly role: string;
      readonly content: string;
    }
  | {
      readonly schemaVersion: 1;
      readonly type: 'proposal';
      readonly baseCommit: string;
      readonly path: string;
      readonly preimageSha256: string;
      readonly content: string;
    }
  | { readonly schemaVersion: 1; readonly type: 'done'; readonly exitCode: number };

const KNOWN_TYPES = new Set(['started', 'message', 'proposal', 'done']);
const EXPECTED_KEYS: Record<string, string> = {
  started: 'schemaVersion,type',
  message: 'content,role,schemaVersion,type',
  proposal: 'baseCommit,content,path,preimageSha256,schemaVersion,type',
  done: 'exitCode,schemaVersion,type',
};

function dataStr(obj: Record<string, unknown>, key: string): string {
  const d = Object.getOwnPropertyDescriptor(obj, key);
  if (!d || !Object.hasOwn(d, 'value') || typeof d.value !== 'string')
    throw new ParseError('invalid_field');
  return d.value as string;
}

function dataInt(obj: Record<string, unknown>, key: string): number {
  const d = Object.getOwnPropertyDescriptor(obj, key);
  if (
    !d ||
    !Object.hasOwn(d, 'value') ||
    typeof d.value !== 'number' ||
    !Number.isSafeInteger(d.value)
  )
    throw new ParseError('invalid_field');
  return d.value as number;
}

export function parseCodexJsonl(
  bytes: Buffer,
  limits: ParseLimits = DEFAULT_PARSE_LIMITS,
): CodexEvent[] {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xef &&
    bytes[1] === 0xbb &&
    bytes[2] === 0xbf
  )
    throw new ParseError('bom_rejected');
  if (bytes.length > limits.maxTotalBytes) throw new ParseError('total_size_exceeded');
  if (bytes.length === 0) throw new ParseError('empty_input');
  if (bytes[bytes.length - 1] !== 0x0a) throw new ParseError('truncated_output');

  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new ParseError('invalid_utf8');
  }

  const parts = text.split('\n');
  // split('\n') on 'a\nb\n' → ['a','b',''], last part must be ''.
  if (parts[parts.length - 1] !== '') throw new ParseError('truncated_output');
  const lines = parts.slice(0, -1);

  if (lines.length > limits.maxEvents) throw new ParseError('event_count_exceeded');

  const events: CodexEvent[] = [];
  let startedSeen = false;
  let doneSeen = false;

  for (const line of lines) {
    if (Buffer.byteLength(line, 'utf-8') > limits.maxLineBytes)
      throw new ParseError('line_size_exceeded');

    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch {
      throw new ParseError('malformed_json');
    }

    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || types.isProxy(raw))
      throw new ParseError('invalid_event_structure');

    const obj = raw as Record<string, unknown>;

    if (obj['schemaVersion'] !== 1) throw new ParseError('unknown_schema_version');

    const type = obj['type'];
    if (typeof type !== 'string' || !KNOWN_TYPES.has(type))
      throw new ParseError('unknown_event_type');
    if (doneSeen) throw new ParseError('events_after_done');
    if (!startedSeen && type !== 'started')
      throw new ParseError('started_event_required_first');

    const sortedKeys = Object.keys(obj).sort().join(',');
    if (sortedKeys !== EXPECTED_KEYS[type]) throw new ParseError('unexpected_fields');

    switch (type) {
      case 'started':
        if (startedSeen) throw new ParseError('duplicate_started');
        startedSeen = true;
        events.push({ schemaVersion: 1, type: 'started' });
        break;
      case 'message':
        events.push({
          schemaVersion: 1,
          type: 'message',
          role: dataStr(obj, 'role'),
          content: dataStr(obj, 'content'),
        });
        break;
      case 'proposal':
        events.push({
          schemaVersion: 1,
          type: 'proposal',
          baseCommit: dataStr(obj, 'baseCommit'),
          path: dataStr(obj, 'path'),
          preimageSha256: dataStr(obj, 'preimageSha256'),
          content: dataStr(obj, 'content'),
        });
        break;
      case 'done':
        doneSeen = true;
        events.push({
          schemaVersion: 1,
          type: 'done',
          exitCode: dataInt(obj, 'exitCode'),
        });
        break;
    }
  }

  return events;
}
