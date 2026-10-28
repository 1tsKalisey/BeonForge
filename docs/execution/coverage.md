# Matriz de cobertura de implementación

Actualizado: 2026-10-28. Estados: `catalogada`, `diseñada`, `prototipo`, `verificada`, `producción`. Un documento de arquitectura del vault es diseño, no evidencia de implementación. B00-01 reconcilia documentación; no añade capacidad de kernel.

| Capacidad | Estado del plan | Estado de implementación | Evidencia / próximo gate |
|---|---|---|---|
| Repositorio y memoria operativa | diseñada | verificada | Foundation cerrada; B00-01 incorpora objetivo de producto y plan ejecutable de Fase 01. Gates actuales en `status.md`. |
| pnpm workspace y TypeScript estricto | diseñada | verificada | `3fc9d52`, actualizado por `b4d56e4`; TypeScript 6.0.3, instalación frozen, typecheck y build pasan. |
| lint, format y tests | diseñada | verificada | `b4d56e4`; ESLint, Prettier, Vitest 1/1 y gate integrado pasan; lint detectó `any` de prueba. |
| CI inicial | diseñada | verificada | `c0dc05f`, pin corregido en `dfcbb1d`; run remoto `40202416013` verde sobre `84d7328`, con checkout, setup, peers y gates completados. |
| ADR y AGENTS.md | diseñada | verificada | `05b6a51`; instrucciones, plantilla y ADR-0001/0002 revisables. |
| Threat model inicial | diseñada | diseñada | `05b6a51`; amenazas y controles previstos documentados, enforcement pendiente por fase. |
| Lifecycle puro de tarea y error de transición | diseñada | verificada | B01-01 `4bf3e58`: API reutilizada del PR #1, 49 pares independientes. F-4: lista, arrays y tabla congelados; regresión rojo/verde y tipos exactos desde exports compilados. Gate actual 62/62 tests; F-2/F-3 conservados. Sin autorización ni recuperación implementadas. |
| Contratos versionados, BlockManifest/BlockResult y errores de ejecución | diseñada | verificada | B01-02 `cccbb16`: parsers v1, errores tipados, eventos started/finished y referencias SHA-256; 47 tests nuevos. M01.1 cerrado tras APPROVE_WITH_FOLLOWUPS y F-4 resuelto; 62/62 tests actuales. No acredita ejecución ni durabilidad. |
| DAG, idempotencia, cancelación de ejecución | diseñada | catalogada | Fase 01, tests y demo; el estado cancelled no implementa cancelación de efectos. |
| EventStore SQLite y proyecciones | diseñada | verificada | B02b-01 `39480c0`: WAL/FULL en worker, append-only, secuencia/idempotencia y proyección atómica, replay tras reapertura. 21 integraciones originales; M01.2 cerrado tras segunda revisión y followups verificados, gate actual 184 tests. La recuperación de ejecución sigue pendiente de B02b-03. |
| Evaluación técnica node:sqlite | diseñada | verificada | B02a-01 `d01daf2`: 7 tests de WAL/transacciones/migración/UNIQUE/concurrencia/BUSY/kill/integridad/performance/worker; verdes con Node 24.13.0/SQLite 3.50.4 y 24.19.0/3.53.3. Se selecciona sólo el segundo runtime para B02b por fix WAL-reset. No implementa EventStore ni durabilidad del kernel. |
| ArtifactStore SHA-256 e integridad | diseñada | verificada | B02b-02 `2e5f9e3`: staging fsync/link sin overwrite, dedupe, hashes/longitudes, rutas confinadas/junctions, temporales/huérfanos seguros. 25 tests nuevos de recuperación; roots privados y límites Windows documentados. |
| Checkpoints de workflow y backup/restore | diseñada | verificada | M01.2 aceptado APPROVE_WITH_FOLLOWUPS, seguimientos `15a9cf8`/`6f28d9e`/`93481c0`/`98e93b6`: restore fuera del origen/CAS/SQL protegido sin residuos, artifactRoot no modifica backups, manifest ajeno compatible y copias dañadas rechazadas. F-5 validado/intacto. 184 tests, 33 nuevos; conserva volumen 800/40, sin reemplazo de activos ni garantía de power loss. |
| Límites de espera de persistencia | diseñada | verificada | F-5: apertura, cola, ejecución, backup/restore con presupuestos finitos configurables. Cola expirada sin envío ni efecto; mutación enviada sin confirmación queda incierta, sin retry. Locks SQLite reales y volumen; métricas antes/después en packages/persistence/REVIEW-FIXES.md. |
| Resume de ejecución | diseñada | catalogada | B02b-03: CLI/DAG y recuperación sin repetir nodos válidos; almacenamiento de checkpoint no implementa ejecución. |
| CLI mínima | diseñada | catalogada | Fase 01, demo E2E. |
| Git/workspace y contexto | diseñada | catalogada | Fase 02. |
| Model registry, provider adapters y probes | diseñada | catalogada | Fases 03, 05; evaluación previa a uso real. |
| Routing y OmniRoute | diseñada | catalogada | Fase 06, shadow y política de datos. |
| Agentes y subagentes | diseñada | catalogada | Fase 07, aislamiento y comparación. |
| Memoria, RAG y retrieval | diseñada | catalogada | Fases 02 y 08, evals. |
| Herramientas, MCP y plugins | diseñada | catalogada | Fases 02 y 11, permisos y contract tests. |
| Seguridad y políticas | diseñada | catalogada | Threat model Fase 00; enforcement posterior antes de efectos. |
| Evals y OpenTelemetry | diseñada | catalogada | Instrumentar al existir ejecución observable; eval suite antes de modelos. |
| API de control y dashboard Angular | diseñada | catalogada | API al estabilizar kernel; dashboard Fase 09. |
| Entrenamiento y adaptación | diseñada | catalogada | Fase 10, dataset y baseline evaluado. |

El kernel incompleto de otro ordenador no está disponible y no es dependencia. No hay reemplazo de una capacidad local funcional; preservar Foundation y el trabajo del PR #1. Se abrirá matriz de paridad por cada reemplazo real.
