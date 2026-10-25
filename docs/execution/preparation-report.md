# Informe de preparación — PREP-001

Fecha: 2026-10-25. Resultado: apto para iniciar Fase 00, con Git aislado en F00-01. Este informe describe el estado observado antes de crear el workspace; no certifica capacidades de producto.

## Inventario inicial

- En la raíz sólo existían `.claude/` y `knowledge/`. `.claude/settings.local.json` deshabilita el servidor MCP `obsidian`; se preservó sin modificar.
- No había `AGENTS.md`, `package.json`, lockfile, código ni tests de BeonForge.
- BeonForge no tenía `.git/`. `git rev-parse --show-toplevel` apuntaba a `C:/Users/ramen/Desktop`, un repositorio superior con numerosos cambios preparados ajenos. Se prohibió operar sobre su índice. F00-01 creó un Git propio; la raíz verificada pasó a `C:/Users/ramen/Desktop/Programacion/BeonForge`.
- Se leyeron completos el MOC y los 22 documentos de `knowledge/AI/18 BeonForge Agentic OS` (23 archivos). El MOC leído tenía SHA-256 `C0DACFFDD378FF039E3D7AE33E09AF51ABEC510662233597A2DFA7584FD0B9A0`. No se cargaron masivamente las demás notas del vault ni se escribió en `knowledge/`.

## Decisiones ya fijadas por el plan y el encargo

Bloques versionados como unidad estable; DAG, eventos, artefactos y recuperación antes de IA; monolito modular TypeScript estricto con puertos; SQLite y filesystem SHA-256; Git; CLI/API antes de Angular; política y evidencia para cada efecto. Codex es el único escritor inicial. Ollama, OmniRoute, subagentes, routing, dashboard y entrenamiento tienen fases posteriores y prerrequisitos explícitos. Frameworks del vault son candidatos, no dependencias.

## Decisiones diferidas

Versiones exactas de paquetes y lockfile (F00-02/03), framework HTTP (al llegar API), sandbox por plataforma, ruta de distribución del vault de solo lectura, motor de evals, framework de entrenamiento, base vectorial/grafo, protocolo público de plugins y licencia/distribución del producto. Se resolverán por necesidad y evidencia; ninguna bloquea F00-02.

## Herramientas observadas, sin instalación durante la inspección

| Herramienta | Versión / estado |
|---|---|
| Node.js | v24.19.0 |
| pnpm | 12.15.0 mediante `pnpm.cmd` |
| npm | 11.10.1 mediante `npm.cmd` |
| Corepack | 0.35.0 mediante `corepack.cmd` |
| Git | 2.51.0.windows.1 |
| TypeScript, ESLint, Prettier | No encontrados como comandos globales |

PowerShell bloquea `pnpm.ps1` y `npm.ps1`; usar los `.cmd`. Bajo el sandbox, Git detecta el propietario de `.git` como distinto al usuario interactivo: usar `git -c safe.directory=C:/Users/ramen/Desktop/Programacion/BeonForge` por comando. Las escrituras en `.git` requieren escalación del entorno.

## Riesgos y preparación de Fase 00

El riesgo de incluir cambios del Git superior está mitigado por el repositorio anidado y la comprobación obligatoria de raíz. `knowledge/` y `.claude/` quedan preservados e ignorados en Git; una copia independiente necesitará la especificación por separado. No hay baseline ejecutable, así que format, lint, typecheck, tests y build se incorporarán en F00-02/03. Las medidas del threat model todavía no son enforcement del producto.

Primer baseline: `487d5e8` en `main`; rama de trabajo `phase/00-foundation`. Estado de continuación: `docs/execution/status.md`. Desglose y criterios de la fase: `docs/execution/phases/phase-00.md`.
