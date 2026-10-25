# Paquete de revisión independiente — M00.3 Foundation

Preparado: 2026-10-25. Estado: **M00.3 cerrado** tras revisión formal `APPROVE_WITH_FOLLOWUPS`, corrección F-1 y run remoto verde. No invocar Claude Code desde BeonForge. Alcance: Fase 00; este paquete no afirma que exista kernel durable.

## Objetivo y especificación

Milestone M00.3: repositorio aislado, workspace TypeScript estricto, gates reproducibles, CI inicial, ADRs, threat model y AGENTS.md. Fuente: `knowledge/AI/18 BeonForge Agentic OS/BeonForge Agentic OS MOC.md`, especialmente «Roadmap y backlog ejecutable», «Arquitectura por capas», «Seguridad y gobernanza» e «Implementación incremental sin perder funcionalidades». Plan ejecutable: `docs/execution/phases/phase-00.md`.

## Commits y diff

- Commit base de revisión: `487d5e8` (`main`, baseline documental).
- Commit final sustantivo: `dfcbb1d` (`phase/00-foundation`, corrección CI). El commit documental que actualiza este paquete queda fuera del diff sustantivo.
- Commits entre ambos, en orden: `2f6ffcd` estado baseline; `7fbbd9c` informe de preparación; `3fc9d52` workspace; `ce0baff` estado; `b4d56e4` gates locales y compatibilidad TypeScript; `c6fa8de` estado; `c0dc05f` CI; `961c19d` estado; `05b6a51` gobernanza; `b1004da` paquete inicial; `dfcbb1d` corrección F-1.
- Resumen de `git diff 487d5e8..05b6a51 --stat` revisado por Claude: 27 archivos, 1993 inserciones y 22 eliminaciones; 1619 líneas pertenecen al lockfile. El delta posterior contiene el paquete documental y un cambio de línea en CI. Código de producto: un paquete de contratos que exporta la versión de formato, sin runtime.
- Archivos modificados: `.github/workflows/ci.yml`, `.gitignore`, `.prettierignore`, `.prettierrc.json`, `AGENTS.md`, `docs/adr/README.md`, `docs/adr/0001-modular-control-plane.md`, `docs/adr/0002-evidence-before-models.md`, `docs/execution/ci.md`, `docs/execution/coverage.md`, `docs/execution/decisions.md`, `docs/execution/master-plan.md`, `docs/execution/phases/phase-00.md`, `docs/execution/preparation-report.md`, `docs/execution/risks.md`, `docs/execution/status.md`, `docs/security/threat-model.md`, `eslint.config.mjs`, `package.json`, `packages/contracts/package.json`, `packages/contracts/src/index.ts`, `packages/contracts/test/public-entry.test.ts`, `packages/contracts/tsconfig.json`, `packages/contracts/tsconfig.test.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `tsconfig.base.json`.

## Decisiones

- D-001/D-002: monolito modular TypeScript, futuros puertos de SQLite y artefactos SHA-256, sin SDKs en dominio.
- D-003/D-005: kernel determinista y un solo escritor antes de modelos y subagentes.
- D-008/D-009: Git propio; vault y configuración `.claude/` preservados fuera del índice.
- D-011 fue sustituida parcialmente por D-012: TypeScript 7.0.2 compilaba, pero `typescript-eslint` 8.72.0 declara peer `<6.1.0`; se fijó TypeScript 6.0.3 y `pnpm peers check` pasó.
- D-013: CI con permisos de lectura, Node/pnpm fijados, lockfile obligatorio y acciones por SHA.

## Verificación reproducible

Desde `C:\Users\ramen\Desktop\Programacion\BeonForge` en Windows:

1. `git rev-parse --show-toplevel` → `C:/Users/ramen/Desktop/Programacion/BeonForge`.
2. `pnpm.cmd install --frozen-lockfile` → pasó; lockfile actualizado y política de cadena de suministro aprobada por pnpm.
3. `pnpm.cmd peers check` → sin problemas.
4. `pnpm.cmd check` → format check, ESLint, typecheck de fuente y test, build y Vitest: **1 archivo, 1 test, todos pasan**.
5. `pnpm.cmd audit --audit-level high` → sin vulnerabilidades conocidas al consultar el registro el 2026-10-25.
6. PyYAML `BaseLoader` parseó `.github/workflows/ci.yml`; comprobó triggers `push`/`pull_request`, permiso `contents: read` y cuatro pasos.
7. `git -c safe.directory=C:/Users/ramen/Desktop/Programacion/BeonForge diff --check` y escaneo textual de secretos sobre archivos nuevos → sin hallazgos. Un `any` inyectado por stdin a ESLint falló con `no-explicit-any`, confirmando que el gate detecta el caso.
8. Tras `dfcbb1d` se repitieron instalación frozen, peers, `pnpm.cmd check` (1/1 test), audit, parse YAML, comprobación de SHA de 40 caracteres, diff y escaneo de secretos: todos pasaron localmente.
9. Evidencia remota verificada con GitHub CLI: [run 40202416013](https://github.com/1tsKalisey/BeonForge/actions/runs/40202416013), `completed/success`, rama `phase/00-foundation`, SHA `84d732845e20576752809c28ec6e3e3b85f6c628`. Pasaron checkout, `pnpm/setup` con el commit corregido, peers y `pnpm check`.

## Revisión preliminar de Claude Code, recibida antes del milestone

| Observación | Clasificación tras reproducción | Evidencia / acción |
|---|---|---|
| No existía `current-review-packet.md` | Confirmado, estado esperado antes de M00.3 | Se crea ahora. No era un defecto de F00-02. |
| No existía `AGENTS.md` | Confirmado, entregable planificado para F00-05 | Creado en `05b6a51`. |
| `status.md` indicaba revisión no solicitada | Confirmado, correcto entonces | Estado actualizado; revisión formal sigue pendiente. |
| El plan pedía paquete y pausa tras M00.3 | Confirmado | Este paquete activa la pausa; no se inicia Fase 01. |
| Rama de fase, cinco commits y árbol limpio | Confirmado para la fecha de esa revisión | El historial creció con F00-03–05; el árbol se comprobó limpio antes de este paquete. |
| Typecheck, diff y status pasaban | Confirmado | Repetidos junto con gates completos. |
| No encontró defectos de código | Sin defecto reproducible | No se creó un commit de corrección de esa revisión. |
| P3: versiones no contrastadas | Sugerencia de verificación | Instalación confirmó versiones reales. Al integrar lint apareció un peer incompatible con TypeScript 7; se resolvió en F00-03 (`b4d56e4`). |
| P3: aún faltaban tests, lint y formato | Confirmado, trabajo planificado | Incorporados y verificados en F00-03. |

La revisión preliminar no emitió veredicto ni pidió cambios. No se atribuye a Claude la incompatibilidad descubierta durante F00-03. Por tanto no existe un hallazgo suyo confirmado que requiera un commit correctivo separado; los cambios de F00-03, F00-04 y F00-05 tienen commits independientes por tarea.

## Revisión formal de Claude Code — APPROVE_WITH_FOLLOWUPS

| Hallazgo | Clasificación propia | Reproducción y tratamiento |
|---|---|---|
| F-1 P2: `pnpm/setup@b1e47f6f...` era tag object, no commit | **Confirmado**; problema del pin CI, ejecución remota no comprobable localmente | `git ls-remote` devolvió `b1e47f6f...` para `refs/tags/v3` y `fa36a5ef7dcdefc3a7cb25655c122e00cf6e636e` para `refs/tags/v3^{}` y `v3.1.2^{}`. Corregido sólo en `.github/workflows/ci.yml` por `dfcbb1d`, comentario `# v3.1.2`. El primer run remoto sigue pendiente. |
| F-2 P3: test pequeño y `paths` apunta a `src` en typecheck | **Confirmado como límite, no defecto de Fase 00** | `tsc --traceResolution` resolvió a `src/index.ts`; `import.meta.resolve` desde el paquete resolvió a `dist/index.js`. El smoke test cubre export/runtime, no paridad de tipos publicados. Añadir typecheck contra `dist/index.d.ts` cuando haya contratos reales en Fase 01. |
| F-3 P3: ESLint recomendado sin reglas con tipos y sólo `.ts`/`.mjs` | **Confirmado como mejora diferida** | `eslint.config.mjs` usa `tseslint.configs.recommended`; `no-floating-promises` no aparece en `--print-config`. Antes de introducir kernel asíncrono, evaluar `recommendedTypeChecked` y ampliar globs si aparecen `.js`/`.cjs`. |

No hubo hallazgos bloqueantes ni defectos de código o alcance adicionales. F-1 tiene commit correctivo separado; F-2/F-3 permanecen explícitos como seguimiento de Fase 01.

## Gates no ejecutados, riesgos y límites

- El run remoto requerido fue observado verde. `origin` apunta al repositorio privado `1tsKalisey/BeonForge`; su rama publicada y default actual es `phase/00-foundation`. La rama local `main` no está publicada y no se publicará sin autorización explícita.
- No hay demo de kernel, EventStore, ArtifactStore, CLI ni recuperación; pertenecen a Fase 01. El test actual comprueba el entrypoint compilado del paquete de contratos, no comportamiento de orquestación.
- El threat model documenta controles futuros, no policy enforcement actual. `knowledge/` no está versionado: una copia del repo necesita la especificación por separado.
- El sandbox de Windows requiere `safe.directory` por comando y permiso adicional para escribir `.git`/store pnpm; no se cambió configuración global.
- Deuda explícita: validar primer run remoto cuando haya un repositorio conectado; F-2 y F-3 al introducir contratos y kernel asíncrono; convertir mitigaciones del threat model en tests/política al abrir las fronteras correspondientes. No hay retirada funcional ni migración de datos en esta fase.

## Preguntas concretas para el reviewer

1. ¿El workflow fijado por SHA instala Node/pnpm desde el manifest y exige realmente el lockfile congelado en la versión citada de `pnpm/setup`? Señalar línea y reproducción si no.
2. ¿Alguna configuración de ESLint, TypeScript o Vitest permite que código fuente o tests queden fuera de los gates de forma accidental?
3. ¿AGENTS.md, ADRs y threat model contradicen el plan, atribuyen controles no implementados o dejan una amenaza crítica sin seguimiento?
4. ¿Hay archivos fuera de alcance, secretos o cambios al vault entre `487d5e8` y `05b6a51`? Adjuntar ruta y evidencia.
5. Respondida: F-1 corregido y run remoto verde observado. M00.3 puede cerrarse y queda cerrado en este paquete.
