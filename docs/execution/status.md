# Estado persistente

Actualizado: 2026-10-25. Leer este archivo antes de cualquier tarea.

## Posición

- Fase actual: 00 — Foundation.
- Milestone actual: M00.1 — repositorio aislado y baseline documental.
- Última tarea aceptada: PREP-001 — inspección, lectura de los 23 documentos del plan e informe de preparación.
- Tarea activa: F00-01 — inicializar Git propio, rama `main` y primer commit de baseline sin añadir `knowledge/` ni `.claude/`.
- Siguientes tareas: F00-02 workspace mínimo y TypeScript estricto; F00-03 herramientas de formato, lint, test y build; F00-04 CI inicial; F00-05 ADR, threat model y AGENTS.md.
- Bloqueos: ninguno para F00-01. El Git de `C:/Users/ramen/Desktop` contiene cambios ajenos; todos los comandos de BeonForge deberán comprobar que la raíz Git sea este directorio.
- Decisiones pendientes: versión fijada de paquetes al crear lockfile; forma de distribuir o referenciar el vault sin incorporarlo a Git; framework HTTP en fase posterior.
- Último commit válido: ninguno en Git propio antes de F00-01.
- Revisión Claude: no solicitada; se preparará al terminar un milestone importante. Claude Code no se invoca desde aquí.

## Gates actuales

- PREP-001: 23/23 documentos del plan leídos; inventario del repo y herramientas completado; no se modificó `knowledge/`.
- F00-01: `git rev-parse --show-toplevel` debe apuntar a BeonForge; `git status --short --branch` debe mostrar únicamente trabajo propio; `git show --stat --oneline HEAD` debe mostrar un baseline acotado. Revisar `.gitignore` y el diff antes de commit.
- Gates de formato, lint, typecheck, tests y build: aún no aplicables porque no hay proyecto Node. Su ausencia no acredita calidad del kernel.

## Comandos de validación

Desde `C:\Users\ramen\Desktop\Programacion\BeonForge` en PowerShell: `git rev-parse --show-toplevel`, `git status --short --branch`, `git diff --check`, `git log -1 --oneline`. Al existir workspace: `pnpm.cmd install --frozen-lockfile`, `pnpm.cmd format:check`, `pnpm.cmd lint`, `pnpm.cmd typecheck`, `pnpm.cmd test`, `pnpm.cmd build`. El shim `pnpm.ps1` está bloqueado por la política de PowerShell; usar `pnpm.cmd`.

## Instrucciones exactas para continuar

1. Abrir este archivo, `master-plan.md`, `coverage.md` y la tarea activa en `phases/phase-00.md`.
2. Ejecutar `git rev-parse --show-toplevel` y comprobar que devuelve exactamente `C:/Users/ramen/Desktop/Programacion/BeonForge`. Si devuelve `C:/Users/ramen/Desktop`, no usar `git add`, `commit` ni operaciones sobre el índice heredado; completar F00-01 localmente primero.
3. Ejecutar los gates de la tarea activa y revisar `git status`, `git diff --check`, `git diff --stat` y secretos en archivos nuevos.
4. Aceptar sólo con criterios satisfechos, crear commit cohesionado y actualizar este estado, cobertura, decisiones y riesgos. Preparar el siguiente nodo sin mezclarlo en el mismo commit.
