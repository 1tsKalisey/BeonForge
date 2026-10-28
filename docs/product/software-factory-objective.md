# Objetivo de producto — BeonForge Software Factory

Fecha: 2026-10-28. Estado: objetivo propuesto para ejecución incremental, sujeto a gates y a las decisiones ya aprobadas en `docs/execution/decisions.md`.

## Objetivo verificable

BeonForge será un plano de control local-first y vendor-neutral que gestione proyectos y tareas desde una interfaz web, planifique dependencias, seleccione ejecutores y modelos mediante reglas auditables, lance trabajos aislados, preserve el estado ante interrupciones y presente evidencias (diff, tests, logs, resultados) para revisión y aprobación humana.

**No construir otro agente de código.** Integrar por adaptadores interfaces oficiales y soportadas de OpenCode y Codex CLI; Ollama como proveedor local. Claude Code Pro se usará de forma independiente salvo permiso e integración expresamente autorizados; nunca convertir credenciales de suscripción en API ni prometer capacidad ilimitada.

## Alcance MVP (criterios de aceptación)

1. Crear proyecto y tarea desde navegador; ver historial y estados tras reiniciar la aplicación.
2. Encolar y ejecutar tarea por OpenCode o Codex CLI, con capacidad comprobada y sin secretos en logs.
3. Aislar cada cambio en Git worktree autorizado y registrar commits, artefactos y evidencia.
4. Recuperar tras fallo sin repetir automáticamente efectos no idempotentes o inciertos.
5. Ejecutar gates reproducibles y presentar diff y resultados al usuario.
6. Aprobar o rechazar cambios desde UI, sin merge, borrado, publicación ni despliegue automático.
7. Consultar modelo/ejecutor elegido y explicar routing, fallbacks y límites.

MVP no promete desarrollo completamente autónomo, dos suscripciones como API, disponibilidad permanente, entrenamiento ni calidad perfecta.

## Arquitectura y límites

- Plano de control: monolito modular Node.js/TypeScript estricto, contratos independientes de SDK.
- Persistencia local: SQLite WAL transaccional, historial append-only y artefactos con SHA-256.
- Ejecución: scheduler durable con leasing, estado incierto explícito, límites de concurrencia; adaptadores intercambiables.
- Espacios de trabajo: Git worktrees, control de rutas, permisos de comandos/red y aprobaciones antes de efectos peligrosos.
- Calidad: gates deterministas primero, revisión independiente opcional después; ningún agente puede autoaprobar su merge.
- Interfaz: API versionada y Angular con tareas, ejecuciones, agentes, routing, evidencias y aprobaciones.
- Routing: reglas deterministas y observables, sin proveedor por defecto fuera de política, según capacidades, clasificación de datos y disponibilidad.
- Modelo local: Ollama para clasificación y tareas ligeras; no depender de 8 GB de VRAM para paralelismo intensivo.

## Orden de implementación (bloques)

| Bloque | Objetivo y gate |
| --- | --- |
| B00 / planificación | Objetivo, ADR de alcance, roadmap, riesgos y gates trazables; no contabilizar como kernel funcional. |
| B01 / contratos | Estados y transiciones tipadas, errores, versión publicada, tests exhaustivos y F-2/F-3. |
| B02 / durabilidad | SQLite/eventos, idempotencia, replay y crash/resume con evidencia. |
| B03 / seguridad workspace | Git worktree aislado, límites de filesystem, políticas y permisos. |
| B04 / harness | Contract tests de OpenCode y Codex CLI, cancelación y errores; sin uso encubierto de subscripciones. |
| B05 / modelos locales | Ollama, probes, clasificación de datos y fallback controlado. |
| B06 / superficie de producto | API + Angular con Kanban, estado y auditoría. |
| B07 / routing | Routing determinista, cuotas observables, backoff, override humano. |
| B08 / cooperación | DAG, dependencias, paralelismo restringido, integrador único. |
| B09 / quality gates | Pruebas reproducibles, revisión independiente y aprobación de merge. |
| B10 / evolución | Métricas, retrieval evaluado, memoria, extensiones según evidencia. |

Cada tarea necesita: identificador, alcance/exclusiones, dependencias, archivos, aceptación y test reproducible, seguridad, rollback y commit cohesivo. No saltar la fase de kernel durable por añadir UI.

## Riesgos y decisiones

- Las cuotas y las reglas de uso de ChatGPT Plus y Claude Pro no equivalen a APIs con facturación o SLA; registrar límites y no eludirlos.
- La rama local `phase/01-kernel` no aparece publicada a fecha de esta iniciativa; esta rama nace de `main` y no sobrescribe trabajo local.
- `knowledge/` y `.claude/` permanecen fuera de alcance e intactos.
- La incorporación al plan maestro y el cambio de fase activa exigen reconciliar primero la rama local de Fase 01; hasta entonces este documento es un objetivo de producto, no una declaración de milestones completados.
- Sin desplegar, publicar, facturar, manejar credenciales ni hacer merge sin autorización y revisión.
