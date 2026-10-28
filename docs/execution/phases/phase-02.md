# Fase 02 — Workspace y contexto

Fase 01/M01.3 aceptados y cerrados. Este documento incorpora exclusivamente el primer nodo autorizado; no replanifica la fase. Fuentes: AGENTS, status, master-plan, D-021–024 y riesgos R-023–033. Vault ausente, no reconstruido.

## B03-01 — Registro e inspección segura de proyectos Git locales

- Objetivo: registrar repositorios y worktrees existentes e inspeccionar metadatos Git sin modificar el proyecto. Distinguir identidad canónica de ruta e identidad física de raíz/entrada .git/directorio Git/común y enlaces de worktree.
- Dependencias: contratos v1, ArtifactStore SHA-256 y persistencia M01.2 aceptada; no requiere agentes ni nuevos eventos/migraciones.
- Archivos: packages/workspace (contratos mínimos, aplicación/adaptador Git/CLI/tests), lockfile sólo vínculos workspace y memoria de ejecución. Sin cambios al runtime o almacenamiento aceptados.
- Incluido: raíz exacta explícita, HEAD/rama/detached/unborn, cambios tracked agregados y detección de submódulos sin recorrerlos; descriptor v1 CAS, referencia portable entre procesos. CLI project register/inspect con --storage absoluto, privado, existente y fuera de proyectos/metadatos autorizados; usa storage/projects.sqlite y su CAS existente.
- Permisos: raíces de proyecto y metadatos externos separados (git-dir y common-dir). Registrar no autoriza inspecciones futuras: cada operación revalida política y pins físicos. No se autorizan otros checkouts por conceder acceso al directorio común.
- Exclusiones: creación/eliminación de worktrees, remotos/fetch/checkout/commits, contenido/indexación/ContextPackage, frameworks, agentes/modelos/dashboard. Sin catálogo: registro se recupera por SHA-256+byteLength en el mismo --storage.
- Seguridad: rutas absolutas locales, componentes sin traversal/symlinks/junctions, identidades dev/ino no nulas y canonicalización nativa; rechazo de cambios detectados antes/después de comandos. Git allowlist sin shell, entorno aislado, --no-optional-locks, fsmonitor desactivado, timeout/salida acotados y diagnósticos fijos. No safe.directory ni configuración global modificados. Raíces privadas/ancestros no mutables por actores no confiables; no sandbox frente a dueño privilegiado concurrente.
- Aceptación/tests: temporales Git reales, worktree, detached/unborn, registro duplicado/reinicio, permisos/rutas/identidades/variables maliciosas/fsmonitor; hashes explícitos de índice/config/archivos de trabajo antes/después. Inspecciones no persistidas por defecto; sólo descriptor estable, sin URLs, paths de cambios, configuración ni contenido en output/CAS.
- Gates: frozen, peers, formato, lint con tipos, typecheck contra dist, build, 255 tests previos+nuevos, diff y secretos. Commits coherentes; actualizar evidencias tras pasar.
- Rollback: revert acotado conservando artefactos privados y todos los repositorios registrados. Siguiente: revisión independiente B03-01; B03-02 worktree aislado queda diferido, sin implementarse aquí.

### Verificación B03-01 — 2026-10-28

Plan `c201c0d`, implementación `a837e9c`, rama phase/02-project-inspection desde 485283c. Node 24.19.0/SQLite 3.53.3, frozen/peers/formato/lint con tipos/typecheck/build y 278 tests verdes (255 originales + 23 workspace). Inventarios de contenido/modo/mtime/directorios intactos, incluidos índice y configuración. CLI compilado registra e inspecciona en procesos distintos usando referencia CAS y el mismo storage; sin catálogo. Primer lint corrigió import sin uso; sin fallos finales ni excepciones. Límites y demo reproducible en packages/workspace/README.md; R-034/035. Paquete de revisión preparado, aceptación independiente pendiente. B03-02 no iniciado.

### Corrección P1 de revisión — alcance autorizado

REQUEST_CHANGES recibido: reemplazar exclusivamente la detección de encabezados por el parser oficial Git config --file/--no-includes/--list/--name-only/-z, antes de inspecciones susceptibles de ejecutar filtros. Archivos: workspace/src/index.ts, tests y evidencias. Conservar pins, rechazo de continuaciones, entorno/argv/timeout/salida limitados; sin dependencias ni cambios al kernel/contratos. Aceptación: regresiones rojas/verdes de secciones contiguas, mayúsculas/includeIf, config.worktree real, configuración válida/malformada y límites; marcadores inocuos confinados a temporales y ningún filtro ejecutado tras corregir. Gates completos sobre build actual. P3 config-inode/ls-files sólo se documentan. Rollback por revert acotado, sin borrar datos; B03-01 abierto hasta nueva revisión independiente y B03-02 diferido.

Verificación local 2026-10-29: `d73466b`, 17 rojas definitivas (16 marcadores de filtros + límite), 34 nuevas verdes y suite completa 312/312 sin skips; frozen/peers/formato/lint/typecheck/build/tests/diff/secretos verificados. Código sólo workspace/src/index.ts y tests; mismos contratos/pins, sin dependencias. Reproducción con fuentes compiladas, temporales e inventarios protegidos. P3 R-037/038 sólo documentados; R-036 requiere verificación externa. Nuevo paquete listo; B03-01 no cerrado. Ante rollback de la corrección, suspender registro/inspección hasta restablecer protección; no volver a usar la versión vulnerable.
