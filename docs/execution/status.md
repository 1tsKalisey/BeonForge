# Estado persistente

Actualizado: 2026-10-25. Leer este archivo antes de cualquier tarea.

## Posición

- Fase actual: 00 — Foundation.
- Milestone actual: M00.2 — toolchain reproducible.
- Última tarea aceptada: F00-03 — gates locales y prueba del entrypoint, commit `b4d56e4`.
- Tarea activa: F00-04 — CI inicial.
- Siguientes tareas: F00-05 ADR, threat model y AGENTS.md; después paquete de revisión M00.3.
- Bloqueos: ninguno para F00-04. Git detecta distinto propietario de `.git` bajo el sandbox; usar `git -c safe.directory=C:/Users/ramen/Desktop/Programacion/BeonForge` por comando. Las escrituras a `.git` y al store pnpm pueden requerir escalación.
- Decisiones pendientes: forma de distribuir o referenciar el vault sin incorporarlo a Git; framework HTTP en fase posterior.
- Último commit válido de tarea: `b4d56e4` (`build: add local quality gates`).
- Revisión Claude: revisión preliminar recibida sin veredicto por ausencia de M00.3. Hallazgos reproducidos; no hay defecto confirmado en los commits revisados. Paquete formal pendiente tras F00-05. Claude Code no se invoca desde aquí.

## Gates actuales

- PREP-001: 23/23 documentos del plan leídos; inventario del repo y herramientas completado; no se modificó `knowledge/`.
- F00-01: aceptado. `git rev-parse --show-toplevel` apuntó a BeonForge; `git diff --cached --check` pasó; commit limitado a siete archivos; `knowledge/` y `.claude/` ignorados, no modificados.
- F00-02: aceptado. `pnpm.cmd install --frozen-lockfile`, `pnpm.cmd typecheck`, `pnpm.cmd build` y smoke de importación Node pasaron. `git diff --cached --check` pasó; ocho archivos dentro de alcance; escaneo textual de secretos sin hallazgos.
- F00-03: aceptado. `pnpm.cmd install --frozen-lockfile`, `pnpm.cmd peers check` y `pnpm.cmd check` pasaron; un `any` deliberado por stdin produjo error de ESLint; 1/1 test pasó. TypeScript pasó de 7.0.2 a 6.0.3 porque `typescript-eslint` declara peer `<6.1.0`. Diff y escaneo textual de secretos sin hallazgos.
- F00-04: CI localmente consistente con `pnpm.cmd check`; no atribuir ejecución remota hasta verla.

## Comandos de validación

Desde `C:\Users\ramen\Desktop\Programacion\BeonForge` en PowerShell: `git rev-parse --show-toplevel`, `git -c safe.directory=C:/Users/ramen/Desktop/Programacion/BeonForge status --short --branch`, el mismo prefijo para `diff --check` y `log -1 --oneline`. Al existir workspace: `pnpm.cmd install --frozen-lockfile`, `pnpm.cmd format:check`, `pnpm.cmd lint`, `pnpm.cmd typecheck`, `pnpm.cmd test`, `pnpm.cmd build`. El shim `pnpm.ps1` está bloqueado por la política de PowerShell; usar `pnpm.cmd`.

## Instrucciones exactas para continuar

1. Abrir este archivo, `master-plan.md`, `coverage.md` y la tarea activa en `phases/phase-00.md`.
2. Ejecutar `git rev-parse --show-toplevel` y comprobar que devuelve exactamente `C:/Users/ramen/Desktop/Programacion/BeonForge`. Usar el prefijo `git -c safe.directory=C:/Users/ramen/Desktop/Programacion/BeonForge` en cada comando Git restante.
3. Ejecutar los gates de la tarea activa y revisar `git status`, `git diff --check`, `git diff --stat` y secretos en archivos nuevos.
4. Aceptar sólo con criterios satisfechos, crear commit cohesionado y actualizar este estado, cobertura, decisiones y riesgos. Preparar el siguiente nodo sin mezclarlo en el mismo commit.
