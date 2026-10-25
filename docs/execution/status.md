# Estado persistente

Actualizado: 2026-10-25. Leer este archivo antes de cualquier tarea.

## Posición

- Fase actual: 00 — Foundation.
- Milestone actual: M00.3 — preparado para revisión independiente; todavía no cerrado.
- Última tarea aceptada: F00-05 — AGENTS.md, ADRs y threat model, commit `05b6a51`.
- Tarea activa: revisión independiente formal de M00.3, pendiente de entrega por el usuario. Paquete: `docs/execution/reviews/current-review-packet.md`.
- Siguientes tareas: reproducir y clasificar la revisión formal; corregir sólo defectos confirmados en commits separados; rerun de gates; decidir cierre M00.3. Fase 01 sólo después.
- Bloqueos: revisión formal pendiente; no iniciar siguiente milestone. Git detecta distinto propietario de `.git` bajo el sandbox; usar `git -c safe.directory=C:/Users/ramen/Desktop/Programacion/BeonForge` por comando. Las escrituras a `.git` y al store pnpm pueden requerir escalación.
- Decisiones pendientes: forma de distribuir o referenciar el vault sin incorporarlo a Git; framework HTTP en fase posterior.
- Último commit válido de tarea: `05b6a51` (`docs: establish foundation governance`). El commit documental del paquete de revisión se identifica con `git log -1` tras confirmar este estado.
- Revisión Claude: preliminar recibida sin veredicto; hallazgos clasificados en el paquete. Revisión formal de M00.3 pendiente. Claude Code no se invoca desde aquí.

## Gates actuales

- PREP-001: 23/23 documentos del plan leídos; inventario del repo y herramientas completado; no se modificó `knowledge/`.
- F00-01: aceptado. `git rev-parse --show-toplevel` apuntó a BeonForge; `git diff --cached --check` pasó; commit limitado a siete archivos; `knowledge/` y `.claude/` ignorados, no modificados.
- F00-02: aceptado. `pnpm.cmd install --frozen-lockfile`, `pnpm.cmd typecheck`, `pnpm.cmd build` y smoke de importación Node pasaron. `git diff --cached --check` pasó; ocho archivos dentro de alcance; escaneo textual de secretos sin hallazgos.
- F00-03: aceptado. `pnpm.cmd install --frozen-lockfile`, `pnpm.cmd peers check` y `pnpm.cmd check` pasaron; un `any` deliberado por stdin produjo error de ESLint; 1/1 test pasó. TypeScript pasó de 7.0.2 a 6.0.3 porque `typescript-eslint` declara peer `<6.1.0`. Diff y escaneo textual de secretos sin hallazgos.
- F00-04: aceptado localmente. YAML parseado con PyYAML, estructura comprobada, `pnpm.cmd peers check` y `pnpm.cmd check` verdes, diff/secret scan limpios. Acciones fijadas por SHA. Ejecución remota no observada; no se afirma CI verde en GitHub.
- F00-05: aceptado. Instalación frozen, peers, `pnpm.cmd check` (formato, lint, typecheck, build, 1/1 test), audit sin vulnerabilidades conocidas, YAML parseado, diff y escaneo textual de secretos pasaron. Paquete de revisión preparado.
- Gate pendiente: ejecución remota de CI no observada; no se atribuye resultado verde en GitHub. El milestone permanece abierto hasta la revisión formal y tratamiento de hallazgos.

## Comandos de validación

Desde `C:\Users\ramen\Desktop\Programacion\BeonForge` en PowerShell: `git rev-parse --show-toplevel`, `git -c safe.directory=C:/Users/ramen/Desktop/Programacion/BeonForge status --short --branch`, el mismo prefijo para `diff --check` y `log -1 --oneline`. Al existir workspace: `pnpm.cmd install --frozen-lockfile`, `pnpm.cmd format:check`, `pnpm.cmd lint`, `pnpm.cmd typecheck`, `pnpm.cmd test`, `pnpm.cmd build`. El shim `pnpm.ps1` está bloqueado por la política de PowerShell; usar `pnpm.cmd`.

## Instrucciones exactas para continuar

1. Abrir este archivo y `docs/execution/reviews/current-review-packet.md`; no iniciar Fase 01 antes de la revisión formal entregada por el usuario.
2. Ejecutar `git rev-parse --show-toplevel` y comprobar que devuelve exactamente `C:/Users/ramen/Desktop/Programacion/BeonForge`. Usar el prefijo `git -c safe.directory=C:/Users/ramen/Desktop/Programacion/BeonForge` en cada comando Git restante.
3. Por cada hallazgo nuevo, reproducir, clasificar como confirmado/falso positivo/sugerencia/decisión, corregir sólo confirmados dentro de alcance, añadir tests pertinentes y ejecutar `pnpm.cmd install --frozen-lockfile`, `pnpm.cmd peers check`, `pnpm.cmd check`, diff y secretos.
4. Actualizar el paquete, este estado, cobertura, decisiones y riesgos. Crear commits cohesivos separados para correcciones. Cerrar M00.3 sólo con evidencia y decisión de revisión documentada; después planificar Fase 01.
