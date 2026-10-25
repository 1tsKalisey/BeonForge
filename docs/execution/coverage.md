# Matriz de cobertura de implementación

Actualizado: 2026-10-25. Estados: `catalogada`, `diseñada`, `prototipo`, `verificada`, `producción`. Un documento de arquitectura del vault es diseño, no evidencia de implementación.

| Capacidad | Estado del plan | Estado de implementación | Evidencia / próximo gate |
|---|---|---|---|
| Repositorio y memoria operativa | diseñada | verificada | Git propio `487d5e8`, seis documentos de ejecución, raíz y diff comprobados; faltan gates del workspace. |
| pnpm workspace y TypeScript estricto | diseñada | verificada | `3fc9d52`, actualizado por `b4d56e4`; TypeScript 6.0.3, instalación frozen, typecheck y build pasan. |
| lint, format y tests | diseñada | verificada | `b4d56e4`; ESLint, Prettier, Vitest 1/1 y gate integrado pasan; lint detectó `any` de prueba. |
| CI inicial | diseñada | prototipo | `c0dc05f`, pin corregido en `dfcbb1d`; YAML parseado y comandos equivalentes verdes localmente; ejecución remota pendiente. |
| ADR y AGENTS.md | diseñada | verificada | `05b6a51`; instrucciones, plantilla y ADR-0001/0002 revisables. |
| Threat model inicial | diseñada | diseñada | `05b6a51`; amenazas y controles previstos documentados, enforcement pendiente por fase. |
| Contratos versionados, BlockManifest/BlockResult y errores | diseñada | catalogada | Fase 01, schemas y contract tests. |
| DAG, estados, idempotencia, cancelación | diseñada | catalogada | Fase 01, tests y demo. |
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

La paridad antigua/nueva no aplica todavía: no existe implementación de BeonForge previa. Se abrirá matriz de paridad por cada reemplazo real. No se retirará una capacidad sin decisión documentada.
