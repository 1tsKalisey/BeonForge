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
