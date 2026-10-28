# Paquete de revisión independiente — M01.2 Persistencia

Preparado: 2026-10-28. Estado: **pendiente de revisión del usuario**. B02b-02 terminado con gates locales verdes; no iniciar B02b-03 ni cerrar M01.2 antes de aceptación. No invocar otros agentes. Paquetes históricos M01.1/M00.3 conservados debajo.

## Alcance y evidencia M01.2

- Base: `d960957` (M01.1 cerrado). Final de código: `2e5f9e3`, rama `phase/01-artifacts-recovery`. Diff reproducible: `git diff d960957..2e5f9e3`; sólo B02b-02: `git diff 0a0c4f9..2e5f9e3`.
- `d01daf2`/`2730db5`: spike y selección node:sqlite. `39480c0`/`0a0c4f9`: eventos/proyección en worker. `2e5f9e3`: CAS, checkpoints schema v2 y backup/restore aislado. Este registro documental posterior no cambia código.
- Alcance contractual: M01.1 intacto; mismo EventStore y worker reutilizados, DurableStore añade operaciones específicas. B02b-02 no añade dependencias ni cambia root manifests/lockfile. Sin runtime de ejecución, scheduler, agentes, routing ni UI.
- Node 24.19.0/SQLite 3.53.3 verificados, WAL/FULL; frozen, peers, formato, lint con tipos, typecheck, build y **115/115 tests** (62 contratos, 46 persistencia, 7 spike). Los 25 tests nuevos usan exports compilados y temporales reales, sin mocks de durabilidad o failpoints productivos.

## Comportamiento y límites a revisar

`packages/persistence/RECOVERY.md` define APIs, publicación, rutas autorizadas, fallos entre filesystem/SQL, checkpoints y protocolo de copia. CAS usa SHA-256/longitud, staging exclusivo fsync, publicación link sin overwrite y dedupe verificado. Sólo después confirma referencias SQLite. Fallos pueden dejar temporales o blobs huérfanos; no son un checkpoint ni provocan ejecución/GC.

Migración aditiva 1→2 introduce workflow_checkpoints. Un snapshot v1 contiene prefijo confirmado y proyecciones; carga verifica bytes y replay bajo SAVEPOINT revertido, preservando la proyección actual y pending/uncertain. No equivale a SQLite WAL checkpoint. No hay sustitución de datos ni downgrade automático.

Backup usa node:sqlite.backup con WAL activo y serializa el comando completo; copia/valida CAS y SQLite, sella snapshot standalone y completa manifest/marcador. Restore comprueba hashes/inventario, integrity_check, FK, schema/application_id, replay y referencias/checkpoints en directorio nuevo antes de ready. Restores repetidos generan nuevos directorios, nunca reemplazan el activo. Activación fuera de alcance, requiere aprobación aparte.

Seguridad depende de raíces privadas: traversal, symlinks/junctions, directorios reemplazados y no-files se rechazan; no se promete sandbox ante dueño privilegiado que cambie ancestros durante syscalls. Windows requiere ACL privada y carece de fsync portable de directorios. Hashes no autentican bundles contra sustitución privilegiada. No hay streaming/GC/cuotas ni garantías de power loss; ver R-025/R-026/R-027.

## Reproducciones y resultados

- SHA conocido/vacío, dedupe concurrente entre dos publishers, truncación antes de publicar, corrupción sin overwrite y referencias ausentes rechazadas. Traversal y junctions se prueban preservando sentinels fuera del CAS, siempre dentro de temporales controlados.
- SQL fail después de publicar snapshot conserva huérfano y revierte metadata; retry deduplica. SIGKILL dentro de trigger temporal antes del INSERT de checkpoint confirma CAS publicado/ninguna fila confirmada, con recuperación/retry coherente. Otros kills: staging, blob huérfano, checkpoint ya confirmado, backup/restore interrumpidos después de copia SQLite antes de completar conjunto.
- Backup/restore real de WAL activo con append posterior encolado: restaurado conserva el snapshot anterior y el activo conserva su estado posterior. Bundle corrupto, schema futuro incluso con hash nuevo y referencia lógica inexistente son rechazados; directorios incompletos no se aceptan como activos.
- Fallos iniciales corregidos: Buffer no importado en fixture; EPERM al fsync readonly del snapshot en Windows. Diagnóstico reproducido, snapshot nuevo sincronizado con handle write-capable; gates finales verdes sin skips. Diff/staged paths y escaneo de secretos sin hallazgos. Sin run remoto nuevo, merge, publicación ni modificación de main (`e14cfdd`).

## Preguntas para revisión

1. ¿Publicación CAS antes de SQL y los marcadores manejan todos los cortes pertinentes sin promover contenido incompleto o duplicar efectos?
2. ¿Checkpoints/prefijo/replay preservan estado confirmado y pending/uncertain sin modificar indebidamente la proyección actual?
3. ¿Backup/restore valida realmente el conjunto y evita overwrite/activación, incluyendo fallos, versiones y referencias faltantes?
4. ¿Las comprobaciones de rutas y las condiciones de propietario/ACL están correctamente acotadas, sin atribuir sandbox/power-loss guarantees no implementadas?

Rollback: revertir commits de implementación/registro de esta tarea conservando datos; no borrar ni forzar downgrade schema v2. Siguiente B02b-03 sólo tras revisión/aceptación M01.2; no ejecutado.

---

# Paquete de revisión independiente — M01.1 Contratos

Preparado: 2026-10-28. Estado: **M01.1 aceptado y cerrado** tras revisión independiente `APPROVE_WITH_FOLLOWUPS`, único hallazgo F-4 corregido y gates verdes. Revisión confirmada por el usuario, sin invocar otros agentes. El paquete histórico M00.3 se conserva debajo.

## Resultado de revisión y F-4

- Veredicto recibido: APPROVE_WITH_FOLLOWUPS. Único hallazgo: F-4, P3, mutabilidad runtime de TASK_STATES y TASK_TRANSITIONS. Sin otros defectos bloqueantes confirmados; las garantías reservadas para B02 siguen pendientes.
- Reproducción: tres tests de regresión contra imports de `@beonforge/contracts` (dist) fallaron antes del cambio: Reflect.set podía añadir estados/transiciones y reemplazar filas (3 rojos, 59 verdes).
- Corrección independiente F-4: Object.freeze sobre TASK_STATES, cada array y la tabla TASK_TRANSITIONS; sin cambiar nombres públicos, tipos ni transiciones. Tests comprueban rechazo de adición/reemplazo/borrado y conservación de isTaskState/canTransition/transitionTask. Un cuarto test comprueba tipos readonly/tuplas exactos publicados.
- Verificación final: frozen install, peers, formato, lint con tipos, typecheck, build y **62/62 tests en 3 archivos** verdes; diff/alcance y escaneo textual de secretos revisados. Sin dependencias nuevas, cambios a otros contratos, merge, publicación ni modificación de main. Entorno local igual al documentado abajo; sin nuevo run remoto.
- Cierre autorizado por el usuario al pasar gates y no quedar hallazgos bloqueantes. F-4 resuelto, M01.1 cerrado; siguiente nodo B02a-01 — Spike SQLite, no iniciado. La evidencia original de B01-02 se conserva a continuación; el commit de cierre F-4 incorpora su corrección y este registro.

## Alcance y commits M01.1

- Base de revisión: `a3e5168` (B00-01 aceptado). Final de código: `cccbb16`, rama `phase/01-execution-contracts`. `main` permanece en `e14cfdd`; sin merge ni publicación.
- `4bf3e58`: lifecycle adoptado selectivamente del PR #1, tests independientes y F-2/F-3. `e14cfdd`: evidencias B01-01. `cccbb16`: contratos mínimos y validadores B01-02. Este registro documental posterior no cambia código.
- Diff reproducible: `git diff a3e5168..cccbb16`; cambios B01-02: `git show cccbb16`. Fuente: B01-02 en `docs/execution/phases/phase-01.md`, ADR-0001/0002 y objetivo Software Factory.
- B01-02 añade `BlockManifest`, `BlockResult`, `BlockExecutionError`, `BlockExecutionEvent`, `ArtifactReference` y parsers desde unknown; centraliza la constante v1 preservando su export público. Sin SDKs, dependencia nueva, almacenamiento, runtime, DAG, agentes ni UI.

## Decisiones y fronteras a revisar

Contratos/fronteras y límites completos en `packages/contracts/README.md`. Inputs y evidencia referencian blobs mediante SHA-256/byteLength. Manifest identifica handler/version y declara efectos, sin aprobarlos. Un resultado pertenece a un intento; éxito no equivale a aprobación de tarea/merge. Incertidumbre se conserva como resultado explícito y no autoriza retry. Eventos registran inicio/fin; no son un EventStore.

Se rechazan versiones no soportadas, campos extra, shapes inválidos y valores fuera de límites. Los parsers retornan copias; readonly es tipado, no congelación runtime. No verifican hashes reales, redacción, correlación entre registros ni permisos. La aplicación/persistencia futura debe imponer estas garantías, documentadas en R-016/R-017/R-018. No hay datos persistidos que migrar.

## Evidencia M01.1

- Entorno: Node 24.13.0, pnpm 12.15.0 mediante Corepack/shim temporal limitado al PATH del proceso. Sin configuración global modificada; vault ausente, sin nueva lectura atribuida.
- Instalación frozen y peers correctos; lockfile intacto. `pnpm.cmd check` pasa formato, lint con tipos, typecheck, build y **58/58 tests en 3 archivos**. B01-02 añade 47 tests válidos/inválidos/límites; se conservan los 49 pares de lifecycle.
- F-2: consumidor sin paths hacia src, resolución a `dist/index.d.ts` verificada por test y assertions de tipos de nuevos exports. F-3: recommendedTypeChecked vigente; sondas negativa/positiva documentadas en B01-01.
- Diff/staged paths y escaneo textual de secretos sin hallazgos. No hubo fallos de gates B01-02. Sin run remoto nuevo ni demo de durabilidad; no se afirma recuperación implementada.
- Rollback: revertir commits de implementación/evidencia B01-02 en la rama de trabajo; preservar B00/B01-01 y no cambiar `main`. Siguiente: B02a-01 únicamente tras revisión y aceptación M01.1.

## Preguntas para la revisión

1. ¿Los contratos son suficientes para la vertical determinista mínima sin acoplar ejecución a persistencia/proveedores o introducir API especulativa?
2. ¿Hay una entrada JSON inválida/versionada que los parsers acepten por error, o una combinación resultado/error incoherente?
3. ¿La distinción intento/tarea, incertidumbre, aprobación y efectos está clara sin prometer garantías no implementadas?
4. ¿Se mantienen F-2/F-3 y los tests realmente consumen tipos/exports compilados? Adjuntar reproducción de cualquier hallazgo.

---

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

- El run remoto requerido fue observado verde. Con autorización posterior, `main` avanzó por `--ff-only` hasta `629059e`, se publicó sin force y pasó a ser la rama predeterminada. `phase/00-foundation` permanece publicada. El run de `main` [40202841059](https://github.com/1tsKalisey/BeonForge/actions/runs/40202841059) terminó `success` sobre `629059e269db32121758be3258a3f4cad205b108`.
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
