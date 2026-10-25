# Registro de riesgos

Actualizado: 2026-10-25. Severidad estimada: alta, media o baja.

| ID | Severidad | Riesgo y evidencia | Mitigación / condición de cierre |
|---|---|---|---|
| R-001 | Alta | `git` resuelve ahora a `C:/Users/ramen/Desktop`; el índice superior contiene archivos ajenos. Un add/commit antes de aislar BeonForge podría incluirlos. | `git init` en BeonForge, comprobar `--show-toplevel` antes de cualquier add/commit; no alterar Git superior. |
| R-002 | Media | `knowledge/` quedará fuera de Git propio; una copia aislada no incluirá su fuente de verdad. | Referencia exacta en plan, preservar vault local, decidir distribución antes de compartir o automatizar en CI. |
| R-003 | Media | No hay baseline ejecutable ni tests; no se puede demostrar regresión hasta configurar tooling. | Fase 00 con lockfile, gates y smoke test. |
| R-004 | Media | El shim PowerShell de pnpm y npm falla por execution policy. | Usar `pnpm.cmd` y `npm.cmd`; documentar comandos Windows. |
| R-005 | Media | Especificación amplia; riesgo de carpetas o interfaces vacías contabilizadas como capacidad. | Roadmap vertical, matriz de cobertura con estado y evidencia, demo por fase. |
| R-006 | Alta | Futuros modelos, plugins y herramientas pueden filtrar código/secretos o ejecutar instrucciones de contenido no confiable. | Fases posteriores: política, clasificación, sandbox, redacción, probes y evals antes de activación. |
| R-007 | Media | Migraciones de estado pueden perder recuperación o repetir efectos. | Contract tests, versiones, backup/restore, idempotencia y demo de reanudación en Fase 01. |

No hay bloqueo material para la tarea F00-01 si se aísla Git localmente. Ninguna excepción de gate está aprobada de forma implícita.
