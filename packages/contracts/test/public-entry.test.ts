import ts from 'typescript';
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  CONTRACT_SCHEMA_VERSION,
  canTransition,
  transitionTask,
  type TaskState,
} from '@beonforge/contracts';

describe('published contracts entrypoint', () => {
  it('resolves the built package and exposes the wire format version', () => {
    expect(CONTRACT_SCHEMA_VERSION).toBe(1);
  });

  it('resolves consumer types through the published declaration entrypoint', () => {
    const config = ts.getParsedCommandLineOfConfigFile(
      ts.sys.resolvePath('tsconfig.test.json'),
      {},
      {
        ...ts.sys,
        onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
          throw new Error(
            ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
          );
        },
      },
    );
    expect(config).toBeDefined();
    if (!config) throw new Error('Consumer configuration is required');
    const result = ts.resolveModuleName(
      '@beonforge/contracts',
      ts.sys.resolvePath('test/public-entry.test.ts'),
      config.options,
      ts.sys,
    );
    expect(result.resolvedModule?.resolvedFileName).toBe(
      ts.sys.resolvePath('dist/index.d.ts').replaceAll('\\', '/'),
    );
  });

  it('publishes the lifecycle types and function signatures', () => {
    expectTypeOf(canTransition).parameters.toEqualTypeOf<
      [TaskState, TaskState]
    >();
    expectTypeOf(canTransition).returns.toEqualTypeOf<boolean>();
    expectTypeOf(transitionTask).returns.toEqualTypeOf<TaskState>();
    expectTypeOf<'unknown'>().not.toExtend<TaskState>();
    expectTypeOf(CONTRACT_SCHEMA_VERSION).toEqualTypeOf<1>();
  });
});
