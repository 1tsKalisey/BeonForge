# Registro de riesgos

Actualizado: 2026-10-25. Severidad estimada: alta, media o baja.

| ID | Severidad | Riesgo y evidencia | Mitigación / condición de cierre |
|---|---|---|---|
| R-001 | Alta, mitigado | Antes de F00-01, `git` resolvía a `C:/Users/ramen/Desktop` y su índice contenía archivos ajenos. | Git propio inicializado y raíz comprobada. Revalidar raíz antes de cada tarea; no alterar Git superior. |
| R-002 | Media | `knowledge/` quedará fuera de Git propio; una copia aislada no incluirá su fuente de verdad. | Referencia exacta en plan, preservar vault local, decidir distribución antes de compartir o automatizar en CI. |
| R-003 | Media, parcial | Workspace, instalación frozen, typecheck y build funcionan; aún no hay lint, formato ni tests automatizados. | F00-03 agrega gates locales; F00-04 los ejecuta en CI. |
| R-004 | Media | El shim PowerShell de pnpm y npm falla por execution policy. | Usar `pnpm.cmd` y `npm.cmd`; documentar comandos Windows. |
| R-005 | Media | Especificación amplia; riesgo de carpetas o interfaces vacías contabilizadas como capacidad. | Roadmap vertical, matriz de cobertura con estado y evidencia, demo por fase. |
| R-006 | Alta | Futuros modelos, plugins y herramientas pueden filtrar código/secretos o ejecutar instrucciones de contenido no confiable. | Fases posteriores: política, clasificación, sandbox, redacción, probes y evals antes de activación. |
| R-007 | Media | Migraciones de estado pueden perder recuperación o repetir efectos. | Contract tests, versiones, backup/restore, idempotencia y demo de reanudación en Fase 01. |
| R-008 | Baja | El sandbox creó `.git` con propietario distinto al usuario Windows; Git considera el repositorio inseguro sin excepción local al comando. | Usar `git -c safe.directory=C:/Users/ramen/Desktop/Programacion/BeonForge`; no modificar la configuración global. Escrituras a `.git` pueden necesitar escalación. |
| R-009 | Baja | El store global de pnpm no es escribible dentro del sandbox, aunque la instalación frozen se reproduce al ejecutar con permiso. | Mantener lockfile fijado y documentar escalación del entorno; no cambiar configuración del usuario. |

No hay bloqueo material para F00-03. Ninguna excepción de gate está aprobada de forma implícita.
