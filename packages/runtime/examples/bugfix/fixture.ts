// Synthetic code authored for M04.1 only. No templates from other projects.
export const BEFORE =
  'export function add(a: number, b: number): number {\n  return a - b;\n}\n';
export const AFTER = BEFORE.replace('a - b', 'a + b');
export const FILES: Readonly<Record<string, string>> = Object.freeze({
  '.gitignore': 'node_modules/\n*.log\n',
  'package.json':
    '{"name":"beonforge-synthetic-bugfix","private":true,"type":"module"}\n',
  'src/add.ts': BEFORE,
  'test/add.test.mjs':
    "import { test } from 'node:test';\nimport { strict as assert } from 'node:assert';\nimport { add } from '../src/add.ts';\ntest('synthetic-add-2-plus-2', () => assert.equal(add(2, 2), 4));\n",
});
export const EXPECTED_DIFF =
  'diff --git a/src/add.ts b/src/add.ts\n--- a/src/add.ts\n+++ b/src/add.ts\n@@ -1,3 +1,3 @@\n export function add(a: number, b: number): number {\n-  return a - b;\n+  return a + b;\n }\n';
