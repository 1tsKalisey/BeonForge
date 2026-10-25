# Matriz de cobertura de implementación

Actualizado: 2026-10-25. Estados: `catalogada`, `diseñada`, `prototipo`, `verificada`, `producción`. Un documento de arquitectura del vault es diseño, no evidencia de implementación.

| Capacidad | Estado del plan | Estado de implementación | Evidencia / próximo gate |
|---|---|---|---|
| Repositorio y memoria operativa | diseñada | verificada | Git propio `487d5e8`, seis documentos de ejecución, raíz y diff comprobados; faltan gates del workspace. |
| pnpm workspace y TypeScript estricto | diseñada | verificada | `3fc9d52`; instalación frozen, typecheck, build e importación Node pasan. |
| lint, format, tests y CI | diseñada | catalogada | F00-03 y F00-04; sin gates todavía. |
| ADR, threat model, AGENTS.md | diseñada | catalogada | F00-05. |
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
