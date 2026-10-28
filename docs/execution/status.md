# Estado persistente

Actualizado: 2026-10-28. Leer este archivo antes de cualquier tarea.

## Posición

- Fase preparada: 01 — Kernel durable sin IA; Foundation y M00.3 permanecen cerrados con revisión independiente y CI histórica verde.
- Última tarea: B00-01 — reconciliación documental autorizada; resultados de validación abajo. No incorpora código de producto.
- Tarea activa: ninguna. Siguiente nodo ejecutable único: B01-01 — auditar y adoptar selectivamente el lifecycle del PR #1 según `phases/phase-01.md`, resolviendo F-2/F-3.
- Dependencias posteriores: contratos mínimos y revisión M01.1 antes del spike SQLite; preferencia por `node:sqlite`, sin driver decidido todavía.
- Bloqueos de contexto: vault ausente en este checkout; lectura histórica PREP-001 conservada, sin nueva auditoría. El kernel antiguo está incompleto en otro ordenador y no es dependencia.
- Decisiones pendientes: forma de distribuir o referenciar el vault sin incorporarlo a Git; framework HTTP en fase posterior; estrategia de schema validation del kernel.
- Último commit de cierre antes de registrar la promoción: `629059e` (`docs: close foundation milestone`). `main` y `phase/00-foundation` fueron publicados por fast-forward, sin force ni merge commit.
- Revisión Claude: formal `APPROVE_WITH_FOLLOWUPS` completada; F-1 confirmado y corregido, F-2/F-3 registrados para Fase 01. M00.3 cerrado. Claude Code no se invoca desde aquí.

## Gates actuales

- B00-01: raíz comprobada `C:/Users/RaulMéndez/Desktop/personal/BeonForge`; baseline limpio en `main` (`99abf50`). No existe rama local `phase/01-kernel` ni otro worktree. La iniciativa remota observada en `49e5db9` añade objetivo y lifecycle; sólo se adopta el documento de producto desde esa revisión, sin merge ni publicación. Código/tests remotos aún no integrados ni ejecutados aquí.
- B00-01 / entorno y gates: Node `24.13.0` (CI histórica: `24.19.0`), pnpm `12.15.0`. `corepack.cmd pnpm install --frozen-lockfile` y `corepack.cmd pnpm peers check` pasaron sin cambios al lockfile. El primer `corepack.cmd pnpm check` falló porque sus scripts internos no encontraban `pnpm` en PATH. Se habilitó un shim de Corepack en directorio temporal y se añadió sólo al PATH del proceso: `pnpm.cmd check` pasó (formato, lint, typecheck, build, 1/1 test). Sin cambios globales de configuración ni de código; sin nuevo run de CI remota. Prettier excluye `docs/` según configuración existente.
- B00-01 / cierre: objetivo de producto copiado de `49e5db9` conservando su texto y procedencia; ocho archivos documentales previstos. Diff y escaneo textual de secretos revisados antes del commit. Rollback: commit inverso limitado a B00-01; no descartar trabajo previo. Siguiente nodo: B01-01, no iniciado en esta tarea.

- PREP-001: 23/23 documentos del plan leídos; inventario del repo y herramientas completado; no se modificó `knowledge/`.
- F00-01: aceptado. `git rev-parse --show-toplevel` apuntó a BeonForge; `git diff --cached --check` pasó; commit limitado a siete archivos; `knowledge/` y `.claude/` ignorados, no modificados.
- F00-02: aceptado. `pnpm.cmd install --frozen-lockfile`, `pnpm.cmd typecheck`, `pnpm.cmd build` y smoke de importación Node pasaron. `git diff --cached --check` pasó; ocho archivos dentro de alcance; escaneo textual de secretos sin hallazgos.
- F00-03: aceptado. `pnpm.cmd install --frozen-lockfile`, `pnpm.cmd peers check` y `pnpm.cmd check` pasaron; un `any` deliberado por stdin produjo error de ESLint; 1/1 test pasó. TypeScript pasó de 7.0.2 a 6.0.3 porque `typescript-eslint` declara peer `<6.1.0`. Diff y escaneo textual de secretos sin hallazgos.
- F00-04: aceptado localmente. YAML parseado con PyYAML, estructura comprobada, `pnpm.cmd peers check` y `pnpm.cmd check` verdes, diff/secret scan limpios. Acciones fijadas por SHA. Ejecución remota no observada; no se afirma CI verde en GitHub.
- F00-05: aceptado. Instalación frozen, peers, `pnpm.cmd check` (formato, lint, typecheck, build, 1/1 test), audit sin vulnerabilidades conocidas, YAML parseado, diff y escaneo textual de secretos pasaron. Paquete de revisión preparado.
- Tras F-1: instalación frozen, peers, `pnpm.cmd check` (1/1 test), audit, YAML/pin, diff y escaneo de secretos pasaron. El SHA de `pnpm/setup` es ahora commit, no tag object.
- CI remota: run `40202416013`, workflow `CI`, evento `push`, rama `phase/00-foundation`, SHA `84d732845e20576752809c28ec6e3e3b85f6c628`, estado `completed`, conclusión `success`. Pasaron setup, checkout, pnpm/Node, peers y gates. URL: `https://github.com/1tsKalisey/BeonForge/actions/runs/40202416013`.
- Repositorio remoto: `origin` = `https://github.com/1tsKalisey/BeonForge.git`, privado. `main` se avanzó exclusivamente por fast-forward hasta `629059e`, se publicó y quedó como rama predeterminada; `phase/00-foundation` también está publicada. Run de `main` `40202841059` sobre `629059e269db32121758be3258a3f4cad205b108`: `completed/success`.
- Compatibilidad Windows: el checkout de `main` reveló CRLF incompatibles con Prettier; `.gitattributes` fija LF para texto y marca binarios comunes. Tras normalizar, `pnpm.cmd check` y peers volvieron a pasar.

## Comandos de validación

Desde la raíz real del checkout en PowerShell: `git rev-parse --show-toplevel`, `git status --short --branch`, `git diff --check`. Sólo ante error de propiedad usar `git -c safe.directory=<raíz-absoluta-verificada>` por comando. Gates: `pnpm.cmd install --frozen-lockfile`, `pnpm.cmd peers check`, `pnpm.cmd check` (formato, lint, typecheck, build y tests). Si falta `pnpm.cmd`, usar `corepack.cmd pnpm` como en B00-01.

## Instrucciones exactas para continuar

1. Leer B01-01 en `phases/phase-01.md` y el objetivo en `docs/product/software-factory-objective.md`. No repetir la auditoría de Foundation ni reabrir B00.
2. Confirmar raíz del checkout y cambios locales. Preservar archivos existentes; no usar la ruta del ordenador anterior.
3. Auditar compatibilidad antes de reutilizar selectivamente los commits del PR #1. No reimplementar lo existente ni incorporar código por merge. El objetivo documental ya está adoptado desde `49e5db9`; sus advertencias sobre reconciliación describen el estado previo, actualizado aquí.
4. Resolver F-2 (tipos publicados) y F-3 (lint con tipos), gates y cobertura en B01. Kernel limitado a orquestación, persistencia, estados, recuperación, permisos y coordinación. Pausar tras paquete de revisión M01.1 antes de persistencia/runtime.
