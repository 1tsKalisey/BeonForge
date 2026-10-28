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
| EventStore SQLite y proyecciones | diseñada | catalogada | Fase 01, recuperación desde eventos. |
| ArtifactStore SHA-256 y checkpoints/resume | diseñada | catalogada | Fase 01, fallo y reanudación sin repetir bloque válido. |
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
