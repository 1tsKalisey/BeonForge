import { describe, expect, it } from 'vitest';
import { CONTRACT_SCHEMA_VERSION } from '@beonforge/contracts';

describe('published contracts entrypoint', () => {
  it('resolves the built package and exposes the wire format version', () => {
    expect(CONTRACT_SCHEMA_VERSION).toBe(1);
  });
});
