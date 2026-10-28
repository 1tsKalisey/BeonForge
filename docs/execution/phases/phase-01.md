# Fase 01 — Kernel durable sin IA

Actualizado: 2026-10-28. Foundation cerrada. B00-01 prepara esta fase; no implementa kernel. Decisiones: D-017/D-018/D-019 y ADR-0001/0002.

Estado: M01.1 y M01.2 cerrados. Segunda revisión M01.2 APPROVE_WITH_FOLLOWUPS recibida; F-5 validado/intacto y followups restore/artifactRoot/manifest corregidos (`15a9cf8`, `6f28d9e`, `93481c0`, `98e93b6`), 184 tests verdes y aceptación registrada. B02b-03 desbloqueado, no iniciado. Evidencias en `../status.md`, `packages/persistence/REVIEW-FIXES.md` y paquete de revisión actual desde la raíz.

## Resultado y límites

Una CLI ejecuta un DAG determinista acotado, falla, conserva evidencia y reanuda sin repetir nodos confirmados. Un efecto incierto exige reconciliación antes de cualquier reintento. Kernel limitado a orquestación, persistencia, estados, recuperación, permisos y coordinación. Sin motores de agentes propios, proveedores, modelos, dashboard ni efectos sobre repositorios del usuario.

## Milestones y dependencias

| Milestone | Dependencia | Gate de salida |
|---|---|---|
| M01.1 — Contratos | B00-01 | B01-01/B01-02 aceptados, F-2/F-3 resueltos, paquete de revisión y pausa hasta revisión independiente del usuario. |
| M01.2 — Persistencia | M01.1 revisado | Spike, almacenamiento transaccional, replay y backup/restore verificados. |
| M01.3 — Recuperación | M01.2 | CLI/DAG determinista con fallo real y reanudación tras reinicio; paquete de revisión y pausa. |

## B01-01 — Adoptar lifecycle existente (completada)

- Objetivo: auditar compatibilidad y reutilizar selectivamente los commits de contratos del PR #1, completando pruebas y API pública sin reimplementación innecesaria.
- Dependencia: B00-01; comprobar árbol y raíz antes de escribir. Partir de Foundation preservada, sin depender del kernel ausente del otro ordenador.
- Archivos: `packages/contracts/` y, sólo para F-2/F-3, scripts raíz y configuración ESLint; memoria de ejecución y lockfile únicamente si un cambio necesario lo exige.
- Procedencia: iniciativa remota observada en `49e5db9`, basada en `99abf50`; lifecycle `edf4379`, exports `6c9164f`, tests `efb28b1` y ajustes de formato posteriores. El objetivo documental `00ebb6b` ya se incorpora en B00-01. Revisar cada delta y adaptar su aplicación al árbol actual; sin merge, publicación ni incorporación duplicada del objetivo.
- Aceptación: estados y errores exportados y documentados; tabla de transiciones validada con expectativas independientes; incertidumbre sin reintento automático. Distinguir semántica de tarea, intento y efecto antes de aceptar el contrato. No afirmar durabilidad ni autorización a partir de una transición pura.
- Tests: pares permitidos/prohibidos, estados terminales, valores externos inválidos, error tipado y recuperación incierta; typecheck y runtime contra exports compilados (F-2); lint con tipos y detección de promesas ignoradas (F-3). Mantener build previo al typecheck consumidor en checkout limpio.
- Seguridad: sin SDKs, credenciales, ejecución de comandos de producto ni efectos externos. Excluir persistencia, scheduler y contratos especulativos de proveedores.
- Gates: instalación frozen, peers, check, diff, revisión de alcance/secretos. Commit cohesivo por tarea; si la adopción falla, conservar evidencia y no declarar B01 completo.
- Rollback: commit inverso acotado, sin reset ni descarte de archivos existentes. Siguiente: B01-02.

## Tareas posteriores, en orden

Cada fila es una unidad acotada. Antes de ejecutarla, concretar sólo los detalles necesarios según el código aceptado, sin abrir tareas en paralelo.

| Tarea / objetivo | Archivos previstos y exclusiones | Aceptación y pruebas requeridas | Riesgo / rollback / siguiente |
|---|---|---|---|
| B01-02 — Contratos mínimos de ejecución | `packages/contracts/`, memoria y paquete de revisión; excluir storage y proveedores. | Definir sólo manifest/result, errores, eventos versionados y referencias de evidencia necesarios para la vertical; validar entradas inválidas y versiones no soportadas, sin SDKs. Cerrar M01.1 tras gates y revisión. | Evitar contratos vacíos o sobredimensionados; revertir commit puntual. Siguiente: B02a-01 tras revisión. |
| B02a-01 — Spike SQLite | Fixture/test aislado y registro breve de decisión; sin driver definitivo anticipado ni cambio global de Node. | Evaluar primero `node:sqlite` en Node 24/Windows: WAL efectivo, commit/rollback, clave única idempotente, cierre/reapertura y estado tras terminar un proceso. Registrar versión, limitaciones y decisión respaldada por resultados. | Compatibilidad y API experimental según versión instalada; si falla, registrar causa antes de evaluar alternativa. Revertir spike. Siguiente: B02b-01. |
| B02b-01 — Eventos y proyección durable | Módulo de persistencia, contratos aceptados y tests; excluir runtime y efectos externos. | Migración versionada, append-only, transacción evento/proyección, idempotencia, rechazo de versión no soportada y replay equivalente después de reinicio. | Corrupción y doble escritura: tests de fallo/rollback; no tocar datos del usuario. Revertir código; conservar fixtures/evidencias. Siguiente: B02b-02. |
| B02b-02 — Artefactos y checkpoints | Persistencia/artefactos y tests en directorio temporal; sin herramientas de edición de código. | SHA-256 verificado, detección de corrupción, rutas confinadas, checkpoint consistente, backup y restauración verificable con reapertura/replay. | Traversal, escrituras parciales y copias inconsistentes; probar fallos, no sobrescribir originales. Revertir commit. Siguiente: B02b-03. |
| B02b-03 — Runtime/CLI determinista y recuperación | Runtime y CLI mínimos con fixtures controladas; excluir agentes, worktrees reales y routing. | DAG válido y rechazo de ciclos, ejecución inicialmente serial, cancelación y permisos explícitos; matar proceso y reanudar conservando evidencia sin repetir nodo válido. Efecto incierto bloqueado, sin promesa de exactly-once externo. Demo desde estado limpio y gates; actualizar threat model y revisión M01.3. | Repetición de efectos: inyección de fallos antes/después de checkpoint; sólo efectos de fixture autorizados. Revertir commit conservando evidencia. Siguiente: revisión de cierre antes de Fase 02. |

## Gates comunes

Instalación frozen, peers y `check` del workspace, tests propios de cada tarea, `git diff --check`, inspección de staged paths/diff y escaneo de secretos. Registrar comandos, resultados y bloqueos en `status.md`; actualizar cobertura sin atribuir implementación a documentos. En Windows usar `pnpm.cmd`; si falta el shim, usar `corepack.cmd pnpm` con la versión del manifest, sin cambiar configuración global.
