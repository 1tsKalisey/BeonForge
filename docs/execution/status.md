# Estado persistente

Actualizado: 2026-10-25. Leer este archivo antes de cualquier tarea.

## Posición

- Fase actual: 00 — Foundation.
- Milestone actual: M00.3 — revisión formal APPROVE_WITH_FOLLOWUPS tratada; cierre condicionado a un run remoto verde por decisión del usuario.
- Última tarea aceptada: corrección F-1, commit `dfcbb1d`.
- Tarea activa: obtener destino remoto y autorización explícita para publicar la rama `phase/00-foundation`; luego observar un run CI verde y guardar su URL/commit/resultado.
- Siguientes tareas: configurar remoto autorizado, publicar la rama, comprobar el run, actualizar paquete y estado, cerrar M00.3 y planificar Fase 01.
- Bloqueos: `git remote -v` no devuelve remotos; falta destino y autorización de publicación. Git detecta distinto propietario de `.git` bajo el sandbox; usar `git -c safe.directory=C:/Users/ramen/Desktop/Programacion/BeonForge` por comando. Las escrituras a `.git` y al store pnpm pueden requerir escalación.
- Decisiones pendientes: destino remoto y permiso de publicación; forma de distribuir o referenciar el vault sin incorporarlo a Git; framework HTTP en fase posterior.
- Último commit válido de corrección: `dfcbb1d` (`fix(ci): pin pnpm setup to release commit`).
- Revisión Claude: formal recibida `APPROVE_WITH_FOLLOWUPS`; F-1 confirmado y corregido, F-2/F-3 confirmados como seguimientos no bloqueantes. Paquete actualizado. Claude Code no se invoca desde aquí.

## Gates actuales

- PREP-001: 23/23 documentos del plan leídos; inventario del repo y herramientas completado; no se modificó `knowledge/`.
- F00-01: aceptado. `git rev-parse --show-toplevel` apuntó a BeonForge; `git diff --cached --check` pasó; commit limitado a siete archivos; `knowledge/` y `.claude/` ignorados, no modificados.
- F00-02: aceptado. `pnpm.cmd install --frozen-lockfile`, `pnpm.cmd typecheck`, `pnpm.cmd build` y smoke de importación Node pasaron. `git diff --cached --check` pasó; ocho archivos dentro de alcance; escaneo textual de secretos sin hallazgos.
- F00-03: aceptado. `pnpm.cmd install --frozen-lockfile`, `pnpm.cmd peers check` y `pnpm.cmd check` pasaron; un `any` deliberado por stdin produjo error de ESLint; 1/1 test pasó. TypeScript pasó de 7.0.2 a 6.0.3 porque `typescript-eslint` declara peer `<6.1.0`. Diff y escaneo textual de secretos sin hallazgos.
- F00-04: aceptado localmente. YAML parseado con PyYAML, estructura comprobada, `pnpm.cmd peers check` y `pnpm.cmd check` verdes, diff/secret scan limpios. Acciones fijadas por SHA. Ejecución remota no observada; no se afirma CI verde en GitHub.
- F00-05: aceptado. Instalación frozen, peers, `pnpm.cmd check` (formato, lint, typecheck, build, 1/1 test), audit sin vulnerabilidades conocidas, YAML parseado, diff y escaneo textual de secretos pasaron. Paquete de revisión preparado.
- Tras F-1: instalación frozen, peers, `pnpm.cmd check` (1/1 test), audit, YAML/pin, diff y escaneo de secretos pasaron. El SHA de `pnpm/setup` es ahora commit, no tag object.
- Gate pendiente: ejecución remota de CI no observada; no se atribuye resultado verde en GitHub. Por decisión expresa del usuario, M00.3 no cierra hasta registrar un run remoto verde.

## Comandos de validación

Desde `C:\Users\ramen\Desktop\Programacion\BeonForge` en PowerShell: `git rev-parse --show-toplevel`, `git -c safe.directory=C:/Users/ramen/Desktop/Programacion/BeonForge status --short --branch`, el mismo prefijo para `diff --check` y `log -1 --oneline`. Al existir workspace: `pnpm.cmd install --frozen-lockfile`, `pnpm.cmd format:check`, `pnpm.cmd lint`, `pnpm.cmd typecheck`, `pnpm.cmd test`, `pnpm.cmd build`. El shim `pnpm.ps1` está bloqueado por la política de PowerShell; usar `pnpm.cmd`.

## Instrucciones exactas para continuar

1. Abrir este archivo y `docs/execution/reviews/current-review-packet.md`; no iniciar Fase 01 antes de observar un run remoto verde.
2. Ejecutar `git rev-parse --show-toplevel` y comprobar que devuelve exactamente `C:/Users/ramen/Desktop/Programacion/BeonForge`. Usar el prefijo `git -c safe.directory=C:/Users/ramen/Desktop/Programacion/BeonForge` en cada comando Git restante.
3. El usuario exigió run remoto verde. `git remote -v` estaba vacío el 2026-10-25. Obtener URL de un remoto y autorización explícita para publicar; no usar credenciales ni hacer push hasta entonces. Guardar URL del run, SHA, resultado y logs relevantes cuando termine.
4. Mantener F-2 y F-3 en el plan de Fase 01, ejecutar sus gates cuando aparezcan contratos reales y kernel asíncrono. Actualizar paquete, estado, cobertura, decisiones y riesgos; cerrar M00.3 sólo con evidencia remota verde.
