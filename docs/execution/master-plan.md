# Plan maestro de ejecución

Actualizado: 2026-10-28. Fuentes operativas: `AGENTS.md`, esta memoria de ejecución y `docs/product/software-factory-objective.md`. La especificación complementaria es `knowledge/AI/18 BeonForge Agentic OS/BeonForge Agentic OS MOC.md` y sus 22 documentos, cuya lectura histórica consta en PREP-001. El vault no está disponible en este checkout; no se ha vuelto a auditar. Es de solo lectura y no se incorpora a Git por defecto.

Inspección inicial y herramientas: `docs/execution/preparation-report.md`.

## Resultado y reglas de avance

BeonForge será un plano de control local-first, vendor-neutral, con contratos de bloque versionados, DAG durable, evidencia verificable, recuperación y permisos explícitos. Una capacidad pasa de `catalogada` a `diseñada`, `prototipo`, `verificada` y `producción` sólo con código funcional, contrato, pruebas, documentación, seguridad, observabilidad, demo o evidencia, recuperación y cobertura actualizada. Una fase avanza tras una demo desde entorno limpio y gates satisfechos. Una revisión externa importante pausa el siguiente milestone hasta recibir hallazgos del usuario.

## Arquitectura acordada

- Monolito modular con `domain`, `application`, `infrastructure` e `interfaces`, puertos y adaptadores. El dominio no importa SDKs de proveedores.
- Node.js LTS, TypeScript estricto, pnpm workspaces, Vitest, ESLint, formato uniforme. SQLite WAL para eventos y metadatos; filesystem dirigido por SHA-256 para blobs; Git para versionado. OpenTelemetry al empezar ejecución observable.
- Contratos versionados en toda frontera; eventos append-only, proyecciones reconstruibles, checkpoints, idempotencia y cancelación. Evidencia y políticas preceden a inferencia.
- CLI y API antes de Angular. Modelos, subagentes, routing y entrenamiento sólo después de los prerrequisitos de sus fases.
- Kernel ligero: orquestación, persistencia, estados, recuperación, permisos y coordinación; las capacidades de agente de programación se delegan a interfaces soportadas de OpenCode y Codex. Claude Code permanece como herramienta independiente de revisión, aportada por el usuario.

## Secuencia ejecutable

| Fase | Resultado observable y gate de salida | Dependencias |
|---|---|---|
| 00 Foundation | Repo aislado, workspace estricto, comandos repetibles, CI inicial, ADR, threat model y AGENTS.md | Informe de preparación |
| 01 Kernel durable sin IA | CLI ejecuta un DAG determinista, falla, conserva evidencia, reanuda sin repetir nodos válidos y termina verificablemente | 00 |
| 02 Workspace y contexto | Worktree acotado y ContextPackage reproducible con instrucciones, mapa y redacción | 01 |
| 03 Primer proveedor local | Registry, probes y Ollama candidato evaluado con salida estructurada y cancelación | 02, clasificación de datos, política, evals |
| 04 Vertical bugfix | Workflow sobre fixture: reproducir, test rojo, cambio, gates, revisión y rollback | 01–03 |
| 05 Harness externos | Adaptadores soportados de OpenCode y Codex CLI, perfiles y contract tests; Claude Code independiente | 04 |
| 06 Routing y OmniRoute | Reglas auditables, presupuestos, fallback y shadow; OmniRoute restringido a datos no sensibles | 03, 05, política y evals |
| 07 Subagentes | Delegación contractual, worktrees aislados, integrador único y comparación con agente único | 02, 05–06 |
| 08 Contexto y memoria avanzada | Índice incremental, recuperación evaluada y promoción controlada de memoria | 04, evals |
| 09 Dashboard Angular | Vistas de runs, approvals, artefactos y gates desde API versionada, con accesibilidad y reconexión | API estable |
| 10 Entrenamiento | Dataset lineage, primer LoRA/SFT ante fallo medido, canary y rollback | registry, evals, licencia |
| 11 Plugins | Manifiesto, permisos, instalación deshabilitada, contract tests y retirada | kernel y política estables |

## Dependencias y límites transversales

Los bloques del objetivo son hitos de producto, no sustituyen las dependencias de fase: B00 corresponde a esta reconciliación; B01/B02 al kernel de Fase 01; B03 a Fase 02; B04 a Fase 05; B05 a Fase 03; B06 a la API y Fase 09; B07 a Fase 06; B08 a la coordinación de Fases 01/07; B09 es transversal; B10 agrupa evolución posterior. No se adelantan proveedores ni UI por el orden numérico de los bloques. Entrenamiento, OmniRoute y plugins permanecen diferidos fuera del MVP.

Fase 01 cerrada con M01.1/M01.2/M01.3 aceptados. M01.3 APPROVE_WITH_FOLLOWUPS recibido/aceptado y tres P3 verificados, 255 tests verdes. Persistencia/F-5 y semántica segura intactos. Siguiente nodo: acotar la primera tarea de Fase 02 Workspace y contexto; aún no hay plan detallado phase-02.md ni implementación iniciada. Sin merge/publicación ni cambios de main.

Cada fase conserva seguridad, threat model, paridad, migración, backup/restore, observabilidad, documentación y cobertura. No se incorporan Nx, Turborepo, NgRx, LangGraph, Temporal, Graphiti, vector DB, Kubernetes o microservicios por anticipación. Repositorios y frameworks citados en el vault son candidatos. Fases 00–01 usan un solo escritor, sin IA de producto, modelos locales, OmniRoute, routing automático ni dashboard.

## Operación por tarea

Antes de editar: leer `status.md`, verificar Git y baseline, confirmar alcance, archivos y comandos. Después: cambio mínimo, pruebas pertinentes, gates, diff y secretos, commit cohesionado, actualización de estado/cobertura/decisiones/riesgos y siguiente nodo. La plantilla concreta y desglose de Fase 00 están en `phases/phase-00.md`. Cada milestone importante produce `reviews/current-review-packet.md` y espera la revisión externa entregada por el usuario.
