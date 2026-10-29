# B03-05 — Revisión focalizada de autorización y canonicalización

APPROVE_WITH_FOLLOWUPS recibido. Base 8f602f2; correctivo **0c662fc**, comparar git diff 8f602f2..0c662fc. Únicamente envelope/exports/tests: ContextPackage, binding Git/OID, schemas v1, kernel, dependencias y main e14cfdd intactos. Nodo abierto hasta revisión focalizada, Fase 02 abierta; sin proveedores/agentes/merge/publicación.

P2: canPublish===true explícito al inicio, tras leer paquete antes del primer put y antes del sobre. Mantiene lectura/grants/revocación; política sólo lectura sigue válida para read, no para build. ContextEnvelopePolicy añade flag opcional en tipos por compatibilidad estructural, pero ausencia/false se rechazan context_denied en runtime con cero puts iniciales. Flag revocado durante primera escritura -> un blob, ningún sobre devuelto. CAS no concede autoridad.

P3: bytes originales verificados contra JSON canónico producido, no sólo JSON reconstruido; rechaza espacios, pretty-print, orden alterado, extras y referencias inválidas, sin versionar de nuevo. Políticas null/malformadas -> context_invalid sanitizado antes de uso, sin TypeError/valores sensibles. Campos válidos sin grants -> context_denied. Tres tests agregados: tres rojas previas 28.87 s, tres verdes focales 29.84 s (62 no seleccionados por filtro).

Gates finales: **439/439**, dos corridas completas, sin skips/fallos de tests: contratos 62/persistencia 115/runtime 71/workspace 184/spike 7, 436 previos+tres nuevos. Workspace 567.21 s y 568.97 s. Demo productor/lector y gates previos conservados. Node 24.19.0/SQLite 3.53.3, frozen/peers/formato/lint/typecheck/build/diff/secretos verdes. pnpm check confirmado **exit nativo 0**. Primer check mostró todos los tests verdes pero la envoltura PowerShell devolvió 1 por NativeCommandError del banner stderr de pnpm: no se ocultó, se repitió completo con captura nativa. Primer filtro con pipes falló en shell (red.log); pruebas rojas reales están en red-tests.log.

Logs íntegros sin sobrescribir en `%TEMP%/beonforge-b0305-review-logs/`: install.log, peers.log, red.log, red-tests.log, focused.log, check.log y confirmation.stdout.log/confirmation.stderr.log/confirmation.exit.txt; hashes en sha256.json. Datos de tests exclusivamente sintéticos/temporales. Escaneo sólo cabecera ficticia de clave, sin secretos reales. Intermitencia 180/181 reportada por primera auditoría **no reproducida**, segunda auditoría reportó 181/181; no se declara resuelta, R-061 seguimiento abierto y logs disponibles para contraste. No cambios de timeouts ni de tests para ocultarla.

Revisar prioritariamente permisos antes de efectos y entre escrituras, bytes canónicos originales, diagnósticos tipados y compatibilidad read-only. R-057/058–061 y riesgos previos vigentes; correcciones locales pendientes de verificación independiente. **No cerrar B03-05 ni Fase 02**. D-036 es propuesta pendiente de aprobación expresa del propietario: no sustituye el criterio de redacción original del master-plan. Rechazo conservador no es redacción transformadora. Detenerse tras esta revisión preparada, sin otro nodo.

---

# Histórico — B03-05: paquete inicial

Base aceptada 0e1ec36; nodo registrado antes de implementar en d7121e8. Código `901290a`, comparar git diff 0e1ec36..901290a. ContextPackage v1, binding Git/OID, kernel, dependencias y main e14cfdd intactos. API/exports buildContextEnvelope/readContextEnvelope y tipos en workspace; sin nuevos módulos/frameworks/agentes. B03-01–04 cerrados; B03-05 **abierto hasta auditoría**, Fase 02 no completada.

Contrato completo en packages/workspace/CONTEXT.md. Sobre v1 determinista con sólo refs CAS de paquete e instrucciones; mapa ordenado derivado de paquete autorizado, no duplicado. Instrucciones string/Uint8Array <=4096 bytes UTF-8, vacío permitido, Unicode sin normalizar, string con surrogate aislado rechazado, bytes UTF-8 inválidos rechazados. Privacidad actual aplicada como texto antes de put y al leer; no excepciones de expresiones JS/TS para instrucciones. Reutiliza readContextPackage y grants explícitos actuales; después de publicar instrucciones vuelve a verificar paquete/grants, y read autoriza también tras recuperar instrucciones. Ningún texto/ref concede permisos, ejecución, envío ni autoridad sobre checkout vivo. Store confiable y permisos de almacenamiento del caller como APIs existentes.

Gates **436/436**, sin skips/fallos: contratos 62, persistencia 115, runtime 71, workspace 181, spike 7. Conserva 432 tests + cuatro agregados y amplía demo previa a envelope. Node 24.19.0/SQLite 3.53.3, pnpm frozen/peers/check verdes, incluyendo formato/lint con tipos/typecheck/build y pruebas con exports compilados actuales. Focal inicial B0305/TypeScript demo: cinco verdes 50.82 s; workspace completo final 521.79 s. Diff/secretos/paths verdes; sólo cabecera de clave ficticia en test previo, sin valores reales. Sin cambios fuera de workspace/docs, publicación, merge o CI remota nueva.

Casos: vacío/Unicode/4096 bytes/determinismo string vs bytes, surrogate/string malformado y bytes inválidos, secretos y límite sin puts, grants distintos/revocados antes y durante publicación, paquete ausente/inválido, envelope alterado/schema/extra fields, instrucciones ausentes/corruptas/UTF-8 inválido/secretos, mapa exacto, interrupción tras primer blob y conservación sin envelope devuelto. Demo TypeScript real: repo autorizado→worktree→package→instrucciones→envelope CAS→fin del productor→otro proceso verifica mapa/instrucciones/bytes. Originales conservados con tests anteriores de índices/config y comparación de archivo adicional; no lecturas Git/FS nuevas en las APIs de envelope.

Revisar autorización y fronteras del sobre, publicación con dependencias verificadas, errores sanitizados y determinismo. Sin garantía de transacción/instantánea atómica: huérfanos o publicación incierta tras un fallo son posibles, no limpieza/retry automática ni catálogo. CAS acredita integridad, no autenticidad del propietario; instrucciones son datos, no evidencia de aprobación de herramientas. R-057, R-055/056 y riesgos previos siguen vigentes. **No envío a proveedores ni ejecución de agentes; heurística no infalible; rechazo no es redacción transformadora.** Siguiente paso exclusivo: revisión independiente aportada por usuario. No cerrar Fase 02 ni iniciar otro nodo.

---

# Histórico — B03-04: segunda aceptación y cierre con seguimientos

Usuario comunica segunda auditoría independiente **APPROVE_WITH_FOLLOWUPS**, P2 de binding Git resuelto. Se conserva sin modificar. Correctivo final `a1f4c97`: únicamente claves compuestas/valores en heurística común build/read, falsos positivos TypeScript y política explícita de placeholders. Seis rojas contra dist previo (59.46 s), seis verdes contra build actual; **432/432**, sin skips/fallos: contratos 62, persistencia 115, runtime 71, workspace 177, spike 7. Los 426 previos y seis nuevos, workspace 484.91 s. Frozen/peers/formato/lint con tipos/typecheck/build/check/diff/secretos verdes en Node 24.19.0/SQLite 3.53.3. No fallos finales. Demo productor termina/reapertura/lector CAS conserva mismos bytes. No P2, schema, dependencias ni permisos modificados.

Regresiones: GITHUB_TOKEN/DB_PASSWORD/POSTGRES_PASSWORD/OPENAI_API_KEY, JSON/YAML/dotenv/TS, referencias options.token/req.headers.authorization/process.env.DB_PASSWORD/response.data.token, literal hardcodeado en .test.ts rechazado sin puts; lectura de manifests consistentemente rehasheados rechaza claves con prefijos y valores cortos/dotenv con puntos, con diagnóstico fijo context_sensitive sin eco. Los formatos de credenciales conocidos y rutas privadas siguen cubiertos por suite anterior intacta. Placeholders explícitos vacío/example/changeme (case-insensitive), no excepción general para cualquier cadena corta o tests. Acceso a propiedades permitido sólo en declaración/asignación this JS/TS sin comillas; otras sintaxis conservadoras, no parser universal. No detector infalible ni prueba de que un placeholder no se use realmente como credencial.

**B03-04 aceptado/cerrado conforme a condición del usuario tras gates**; no se afirma revisión independiente adicional de a1f4c97. P3-3/R-055 residual y P3-4/R-056 fragilidad aceptados pendientes; heurística/ACL/CAS huérfano/autenticidad/symlink nativo Windows y demás límites vigentes. Escaneo sólo identifica cabecera sintética de clave privada en test, sin valores reales; main e14cfdd intacta, sin agentes, merge, publicación ni siguiente nodo. Fase 02 sigue abierta. Para revisar el último cambio: git diff 48a9012..a1f4c97; pruebas vía pnpm.cmd check con runtime aprobado. Datos de auditorías anteriores inferiores son históricos.

---

# Histórico — Revisión focalizada P2/privacidad (antes del cierre)

Usuario aporta **APPROVE_WITH_FOLLOWUPS**, sin bypasses de autorización/privacidad explotables desde el repositorio; P2 de integridad reproducible exige corrección antes de agentes. Se trabaja exclusivamente B03-04. Base e740c89; `18d71dd` corrige P2, siguiente commit acota privacidad/tests. No cambios de main, publicación, dependencias ni contratos de Fase 01. No agentes invocados.

Código definitivo: `18d71dd` + `8820f3a`; comparar git diff e740c89..8820f3a. **426/426 verdes**, sin skips/fallos finales: 62 contratos, 115 persistencia, 71 runtime, 171 workspace, 7 spike. Los 410 previos y 16 nuevos; workspace 442.03 s. Frozen/peers/formato/lint/typecheck/build/check completos sobre dist actual, Node 24.19.0/SQLite 3.53.3. Diez regresiones de privacidad verdes; demo productor/reinicio/lector verde. Repetición completa tras corregir fixture EPERM y orden final hash antes de privacidad. Diff/secretos/paths verificados, sólo marcador sintético de clave privada en test; main e14cfdd intacta. Revisar correcciones; **sin cierre operativo final** ni siguiente nodo.

P2: dos rojas con repositorios Git temporales SHA-1/SHA-256. Mediante observaciones instrumentadas se intercambian **directorios reales**: validación ve el ancestro original clean, captura ve un ancestro alternativo estable. No se falsean bytes ni stats; antes se devolvían refs CAS válidas con bytes ajenos al commit. Tras corrección dos verdes (25.89 s): context_changed y cero puts, más captura válida/relectura en ambos formatos. Snapshot interno conserva paths/OIDs de ls-tree al commit autorizado; formato real consultado con rev-parse --show-object-format=storage bajo el mismo runner aislado. Hash Git de header blob+bytes, comparación antes de privacidad/publicación. Checks de rutas/identidad/timestamps/permisos/HEAD y manifest v1 conservados, sin snapshots/bloqueos nuevos ni HEAD posterior como referencia.

P3: diez rojas de admisión antes del endurecimiento, con secretos sintéticos y nombres controlados. Se amplían prefijos sk-ant-api03-/sk-proj-/github_pat_, asignaciones AWS/tokens (incluido JSON), credentials/secrets con extensiones, .htpasswd y sufijos .env. Rechazo antes del primer put; lectura histórica también aplica privacidad actual. Positivo de documentación de prefijos incompletos/tokenizer/placeholders cortos para controlar falsos positivos. Sigue siendo heurística, no DLP; ninguna clave real/valor secreto en evidencias.

Calidad: códigos exactos en selecciones inválidas, case, junction y manifest; workspace sin permisos -> context_denied, fuente inválida -> context_source_invalid. Pruebas de hardlink, symlink, manipulación consistentemente rehasheada hacia ruta privada y cero puts; se retira la aserción trivial de mera existencia del índice al final de la demo (se conservan comparaciones reales de índices/config/bytes).

Limitación de prueba comprobada: primer gate completo falló únicamente al crear symlink nativo de archivo (Windows EPERM, sin SeCreateSymbolicLinkPrivilege). Hardlink/junction reales sí disponibles. Test ahora intenta symlink nativo y, sólo ante ese EPERM en Windows, prueba entrada symlink real 120000 del índice Git, con mismo rechazo; no se afirma cobertura nativa inexistente ni se elevan permisos. Host con soporte de symlinks pendiente para probar esa rama. Primera suite correctiva: 170/171 workspace verdes; gate repetido desde build actual tras corregir fixture y fijar prioridad del error de OID. Resultado definitivo en status; sin excepciones aceptadas a gates finales.

Reproducir con Node 24.19.0 aprobado: pnpm.cmd install --frozen-lockfile; pnpm.cmd peers check; pnpm.cmd check. Focal P2: build primero, luego pnpm.cmd --filter @beonforge/workspace exec vitest run test/context.test.ts -t 'P2 rejects ancestor'. Demo previa de productor termina/lector CAS nuevo se conserva en suite. Verificar prioritariamente binding al árbol inmutable, cero puts ante discrepancia/privacidad, códigos y límites, sin ampliar permisos o scope. R-054 corregido localmente; sin cierre operativo final hasta verificación focalizada. Permanecen heurística de secretos, conversiones raw incompatibles, autenticidad no firmada del CAS, raíces privadas/ACL y falta de snapshot atómico/GC. No iniciar otro nodo.

---

# Histórico — B03-04: paquete inicial

2026-10-29. CTX-MIN recibe identificador definitivo **B03-04** antes de implementar. **Abierto hasta auditoría aportada por el usuario**; no cerrar Fase 02 ni iniciar otro nodo. B03-01/02/03 y Fase 01 siguen aceptados. Sin agentes invocados, merges, publicación, cambios de main/dependencias/lockfile/knowledge/.claude.

## Commits y alcance

- Base aceptada `f953473`. `ab7bd03` registra el nodo antes de implementar.
- `9a0bddb`: R-047/R-050, status con --attr-source=<OID> autorizado y validationScope aditivo/frozen; unborn usa árbol vacío calculado sin escritura. `07f9cc4` corrige únicamente el tipado de la instrumentación de ese test (lint recibido después del commit previo).
- `4e47e23`: API buildContextPackage/readContextPackage, ContextError y manifest v1 en workspace/src/context.ts; tests compilados reales, contrato/demo en CONTEXT.md. src/index.ts pasa a barrel y la implementación anterior se conserva **exactamente** en workspace.ts hasta el nuevo puente interno contextWorkspaceSnapshot (comparación automatizada de texto normalizando CRLF). No reconstrucción de worktrees ni kernel. Revisar `git diff f953473..4e47e23` y los archivos nuevos; los cambios aparentes de 1088 líneas corresponden a esta extracción.

## Comportamiento y fronteras

Build: permiso CAS lectura/publicación, intención/path grants exactos, creación históricamente confirmed y actualmente clean, permisos workspace revalidados antes/después; selección tracked explícita y case exacto. Componentes sin enlaces/junctions, identidades físicas y stamps de archivos/ancestros antes/después; lectura acotada/UTF-8, privacidad y presupuesto completos antes del primer put. La validación existente lee los tracked autorizados necesarios para clean; sólo la selección se recopila/publica. No enumeración de contenidos untracked/ignored ni aumento de permisos.

Manifest v1 determinista, rutas relativas/lineage refs CAS, política de captura hash v1, límites 16 archivos/16 KiB/32 KiB, hashes de **bytes exactos del working tree**, no de objetos Git ni texto normalizado. Estimación utf8-byte-units-v1 = bytes, aproximada/sin proveedor. No paths absolutos/timestamps. Publicación de blobs seguros primero, manifest al final, hash/longitud y relectura verificados; no transacción Git/CAS/SQLite ni paquete parcial retornado ante fallo.

Read: grants **actuales** por intención y ruta, manifest/lineage/artefactos/hash/longitud/totales/versión/privacidad verificados. Devuelve bytes con `sourceValidation: historical-not-revalidated`; una edición posterior conserva el snapshot y nunca autoriza nuevas acciones. Contenido del repo es dato no confiable, no instrucciones/autoridad del control plane. No adaptador/modelo/SDK/exportación/herramientas ejecutables del proyecto. CLI contexto sigue futura según propuesta; CLI worktree existente expone alcance explícito.

## Evidencias reproducibles

Node **24.19.0**, SQLite **3.53.3**, pnpm **12.15.0**, Git **2.52.0.windows.1**, Windows. Resolver paquete devuelve workspace/dist/index.js; NodeNext/typecheck consume declaraciones publicadas dist/index.d.ts, sin alias a fuente. Build ejecutado por check antes de tests, sin dist obsoleto.

- `pnpm.cmd install --frozen-lockfile`, `pnpm.cmd peers check`, `pnpm.cmd check`: **verdes**, sin dependencias nuevas. Check incluye formato/lint con tipos/typecheck/build/tests/spike. Suite **410/410**, sin skips/fallos: contratos 62, persistencia 115, runtime 71, workspace 155, spike 7. Conserva todos los 373 previos; añade 1 prerrequisito y 36 contexto. Workspace completo 318.13 s; focal contexto inicial 36/36 en 274.03 s.
- Rojo inicial: frontera de atributos/scope faltante en Git real y API ausente en exports compilados antes del cambio. No atribuir explotación de atributos al Git anterior: se reproduce la ausencia de la protección/metadata. Verde con .gitattributes untracked hostil, origen de status explícito y fixtures válidos/unborn. Secretos de prueba son ficticios y confinados a temporales.
- Nuevos tests: selección ordenada/repetida/autorización, .gitignore/CRLF/determinismo, untracked/ignored/privados, texto sospechoso/NUL/UTF-8 inválido, staging con bytes restaurados, HEAD/identidad/case/junction, marker ausente/uncertain, edición durante read sin publicación, límites 16/17 archivos y 16/32 KiB, corrupción/ref ausente/receipt inválido/manifest manipulado/put con hash falso y corte simulado entre blobs. Los tests anteriores de hooks/filtros/SIGKILL/recuperación permanecen; no afirmar power loss ni SIGKILL nuevo específico de ContextPackage.
- Demo final reforzada: `pnpm.cmd --filter @beonforge/workspace exec vitest run test/context.test.ts -t 'TypeScript demo'`: **1/1 verde, 12.07 s** (35 no seleccionados por filtro). Proyecto TypeScript temporal real, selección explícita → productor independiente publica CAS y **termina** → otro proceso reabre store → mismos hashes y bytes base64. CLI inspect con .gitignore devuelve confirmed/clean y scope tracked-only. Prueba controlada adicional conserva índice original/índice del worktree/config y hashes de todos los archivos tracked antes/después.
- Fallos intermedios corregidos: tipado/lint de instrumentación; primera batería con timeout Vitest 5 s agotado al crear fixtures reales, sin clasificarlo como fallo del producto. Se fija 60 s por test/30 s cleanup sólo en esa batería. Timeouts Git/persistencia de producción intactos. Gate completo y comprobación focal final pasan; sin excepciones ni fallos pendientes.
- Diff/paths y secretos: sin cambios fuera de workspace/docs de ejecución; escaneo textual sólo reconoce cabecera sintética de clave en test negativo, no credenciales reales. Main e14cfdd intacta; sin CI remota nueva.

## Foco y riesgos de revisión

Revisar la frontera CAS/autoridad, validadores de manifest/ref/lineage, protección exacta de paths/identidades/TOCTOU observable, privacidad antes de publicar, y origen de atributos/scope en compilación actual. Distinguir integridad de autenticidad: refs no son firmas contra propietario del CAS. No bloquear por agentes/exportación/DLP universal/indexación/GC o catálogo deliberadamente fuera de alcance.

R-047/050 **corregidos localmente, sin aceptación independiente todavía**. R-049 continúa global; contexto falla cerrado con spelling exacto. R-048 parcialmente cubierto, no se cierra toda deuda histórica. R-037/038/040/041 y límites de compatibilidad siguen vigentes. R-052/053: privacidad heurística, datos no confiables, estimación aproximada, raíces/ACL privadas, propietario concurrente fuera del modelo de snapshot atómico, blobs huérfanos posibles sin retry/GC. Rollback por revert acotado conservando artefactos/worktrees y referencias; no borrar datos ni volver a validación insegura. **Siguiente paso exclusivo: revisión independiente B03-04; detener implementación.**

---

# Histórico — B03-03: aceptación independiente y cierre

2026-10-29: usuario comunica auditoría Claude **APPROVE_WITH_FOLLOWUPS**, 373/373 verificados, sin P0–P2; confirma cierre. **B03-03 aceptado/cerrado**, código 600dfb0/evidencias 9815731. No se repite auditoría ni se invocan agentes. Fase 02 permanece abierta, no se atribuye ContextPackage ni preparación general para agentes. Este commit sólo documental, main e14cfdd intacta, sin merge/publicación.

| Followup B03-03 | Registro y estado |
|---|---|
| P3-1: .gitattributes untracked puede ser consultado por Git | R-047, aceptado pendiente; fijar/evaluar origen de atributos al commit, prioritario antes de agentes y captura. No se implementa. |
| P3-2: aserciones/staging/CLI | R-048, aceptado pendiente; códigos de error precisos, staging independiente y CLI con .gitignore. No tests nuevos aquí. |
| P3-3: case-only rename Windows puede parecer clean | R-049, aceptado pendiente; no confiar en clean para spelling exacto. |
| P3-4: alcance clean en contrato público/salida máquina | R-050, aceptado pendiente y prioritario antes de agentes; no implica untracked/ignored o ausencia de lecturas Git. Contrato/salida no modificados. |
| P3-5: inconsistencia coverage | R-051, corregido documentalmente: fecha/filas/cierre/.gitignore alineados y ContextPackage no implementado, Fase 02 abierta. Otros cuatro P3 no corregidos. |

Propuesta del siguiente nodo: **CTX-MIN**, alias provisional, no B03-04 definitivo. ContextPackage explícito tracked/UTF-8 autorizado, manifest v1 y refs CAS, límites/privacidad/recovery, sin ejecutar agentes. Plan ejecutable en phase-02.md; antes de capturar, resolver/verificar atributos y alcance de clean, y gate de case exacto Windows. No dependencias de agentes/RAG; no reconstruir kernel/workspaces. No código de propuesta ni correcciones P3 funcionales en este turno.

Gates del cierre en status: formato, frozen/peers, diff/secretos/paths. Evidencia funcional conservada: 373/373 verificados por auditor, no reejecutados por cambios exclusivamente Markdown. Rollback sólo revert documental preservando código/datos/artefactos; ningún efecto externo que reconciliar. Detenerse tras cierre/propuesta.

---

# Histórico — B03-03: paquete previo a aceptación

2026-10-29. Implementado localmente, **abierto hasta aceptación independiente**. Base df064c8, phase/02-project-inspection. Código en workspace/src/index.ts, worktree-cli.ts y tests; commit/gates finales en status. Contratos/persistencia/runtime/lockfile/dependencias intactos. Main e14cfdd sin cambios, sin agentes, merge/publicación ni otra tarea iniciada.

Código final 600dfb0, diff git diff df064c8..600dfb0; memoria documental posterior. Gates finales **373/373 verdes**, sin skips/fallos: contratos 62, persistencia 115, runtime 71, workspace 118, spike 7. Todos los 352 previos + 21 nuevos. Frozen/peers/formato/lint/typecheck/build, tests contra exports/CLI compilados actuales, diff/secretos/paths comprobados; sin nueva CI remota ni cambios funcionales fuera de workspace.

## Fronteras

- Única excepción: .gitignore exacto leaf regular, raíz/anidado. Otros .git*, directorios, enlaces/gitlinks, case/alias Windows/colisiones denegados. Sin ampliar ASCII/512 archivos/1 MiB por blob o salida/32 MiB/16 componentes. Raw, atributos stdin, hooks/filtros y grants conservados.
- Historia/receipt inmutables; current clean valida tracked contra commit de creación/índice/HEAD detached/pins. Modified incluye edit/delete/stage. HEAD/identidad divergentes -> drift; ausencia, metadata/ruta insegura o verificación fallida -> invalid/error; sin marker válido -> uncertain. Historia no concede permisos. CLI 0 sólo confirmed+clean, otros reportes 2/error 1; create despachado sigue denegado.
- Tras confirmar, no readdir del checkout ni lectura de extras untracked/ignored; Git status mantiene untracked-files=no/ignore-submodules=all. Creación sí exige inventario exacto. Clean no significa estéril ni autoriza usar extras. HEAD inicial sólo metadata; componentes tracked comprobados antes de leer/status para no seguir junctions. Drift observado al final también se comunica como drift. No snapshot atómico ni sandbox frente a dueño concurrente.

## Evidencias

Cinco rojos funcionales iniciales: .gitignore denegado y cuatro éxitos CLI falsos (modified/drift/invalid/prepared). Dos fallos adicionales eran de fixtures: Git bloquea .git/punto final en índice; afinados usando trees reales hash-object --literally/commit-tree sin materializarlos. Se prueban también .gitmodules/.gitattributes/case/alias 8.3/colisión/.gitignore directorio.

20 nuevos verdes enfocados y suite inicial 372/372. Revisión propia detectó HEAD observado en validación final como modified: test adicional rojo delega Git real y cambia HEAD al iniciar la comprobación final; verde tras separar drift de cambios tracked. Gates finales sobre ese código se registran en status; no atribuir aceptación independiente a tests locales.

Demo: proyecto TypeScript Git temporal con package.json, tsconfig, README, src/app.ts y gitignores raíz/anidado. Bytes/OID/reglas Git check-ignore y original intactos salvo metadata administrativa worktrees autorizada. .env/node_modules/dist/.private y untracked quedan fuera de current; tracked edit/reinicio conserva receipt con modified. CLI en otro proceso: clean/modified/drift/invalid/identidad sustituida/uncertain/prepared/permiso denegado, sin create repetido. Casos adicionales de borrado/staging y junction a temporal externo -> invalid. Ningún código del fixture ejecutado ni dependencia instalada.

Tests anteriores de hooks/filtros/atributos hostiles, 500 nombres largos/stdin/fallos y SIGKILL conservados. Sólo recursos temporales; interceptación de spawn sólo para la carrera, con Git/store reales. No traza OS universal de lecturas ni power loss; junction demuestra rechazo y ausencia de contenido privado en reporte, no sandbox.

## Reproducir y salida

pnpm.cmd install --frozen-lockfile; pnpm.cmd peers check; pnpm.cmd check; git diff df064c8..HEAD --check. Demo tras build: pnpm.cmd --filter @beonforge/workspace exec vitest run -t B0303.

Revisar allowlist leaf/mode/alias, privacidad de extras, tracked/index y drift temprano/tardío, historia/current/exit codes, permisos y no repetición. Límites R-037/038/040/041/044/046; no compatibilidad general ni contexto/agentes. Rollback por revert preservando worktrees/receipts/markers, sin limpieza/retry. Esperar auditoría B03-03, mantener abierto y detenerse.

---

# Histórico — B03-02: aceptación focalizada y stdin

2026-10-29: usuario aporta APPROVE_WITH_FOLLOWUPS, confirma P3-1 eadc346 y P3-2 bf81d93 corregidos; no hay bloqueantes para B03-03. Aceptación registrada sin repetir auditoría ni invocar agentes. Histórico debajo. Este paquete revisa sólo el nuevo P3 check-attr/Windows.

Base c15973e. Código en workspace/src/index.ts y tests existentes: --stdin -z --source=<OID>, buffer NUL <=1 MiB, cierre explícito, límites 5 s/1 MiB de salida; entorno y política intactos. Spawn síncrono y evento error se convierten en ProjectError git_failure sin causa/spawnargs. Error stdin mata proceso y espera cierre, timeout/overflow git_limit; captura de end síncrono también. No shell, filtros, retry ni cambios de permisos.

Commit independiente 204eca1; diff git diff c15973e..204eca1. Suite final **352/352** sin skips/fallos: 62 contratos + 115 persistencia + 71 runtime + 97 workspace + 7 spike, todos los 347 previos intactos. Frozen/peers/formato/lint/typecheck/build/tests/diff/secretos verdes sobre dist recompilado. No nueva CI remota, dependencias ni contratos Fase 01 modificados. Resultado local no atribuye aprobación independiente al nuevo cambio stdin.

Rojo antes de cambiar: 3 casos fallan, incluyendo ENAMETOOLONG real en Windows con 500 nombres largos, error síncrono sin sanear y error stdin no manejado. Verde enfocado: 5/5, mismo árbol válido y luego atributos hostiles rechazados sin reservas nuevas, spawn throw, ejecutable inexistente, error stdin y timeout con proceso Node inocuo. Los fallos usan delegación de spawn real o un error sintético explícito; no se falsifica el resultado de Git. Sin ejecuciones inesperadas ni secretos reales en fixtures. Dist actual recompilado; gate completo final en status.

No existe todavía implementación B03-03: el plan previo no la definía. Nueva propuesta en phase-02.md, sólo .gitignore regular y salidas explícitas de validación actual; no agentes/contexto/routing/dashboard, ni compatibilidad general o grants nuevos. Historia confirmada nunca autoriza efectos; drift/invalid/uncertain no se admiten automáticamente.

Reproducción: pnpm.cmd install --frozen-lockfile, pnpm.cmd peers check, pnpm.cmd check y git diff --check. Revisar sólo stdin/EOF/límites/errores/terminación y ausencia de regresiones; P3-1/P3-2 ya aceptados. Rollback por revert acotado preservando datos/worktrees; reintroducir argv largo limitaría Windows de nuevo. Main intacta, sin publicación/merge. Detenerse tras esta corrección y propuesta B03-03.

---

# Histórico — B03-02: revisión de confirmación y atributos

2026-10-29: auditoría APPROVE_WITH_FOLLOWUPS comunicada por el usuario, sin P0–P2; confirma R-039, creación y SIGKILL. Baseline aceptado; correcciones siguientes sólo verificadas localmente, requieren revisión focalizada. No invocar agentes ni iniciar B03-03.

P3-1 eadc346: confirmed.json v1 wx/write/fsync referencia intención y receipt CAS original después de verificar. state histórica separada de current clean/modified/drift/invalid; no concede permisos ni permite nuevo create. Marker/receipt/pins/HEAD/lock validados; ausencia/corrupción/corte previo al marker -> uncertain, sin reconstrucción automática. Cuatro rojos iniciales sin marker; seis verdes de edición/reinicio, pérdida/corrupción/truncado, HEAD/destino alterados. SIGKILL adicional entre publicación del receipt y marker conserva incertidumbre. El test de archivo extra pasa a exigir confirmación histórica.

P3-2: cinco rojos info/attributes (encoding/filter/text/eol/ident) aceptaban reservas. check-attr --source=<OID> -z valida triples/recuento antes de reserva y dispatch; rechaza asignaciones explícitas, sin filtros/shell. GIT_ATTR_NOSYSTEM=1, atributos globales NUL, aislamiento R-039 intacto. Comprobar rechazo sin reservas/worktrees residuales. No compatibilidad ampliada.

Código P3-2 bf81d93; base de ambas correcciones f8206a6, diff git diff f8206a6..bf81d93. Gates finales 347/347 sin skips: 62 contratos + 115 persistencia + 71 runtime + 92 workspace + 7 spike, incluye 335 previos. Frozen/peers/formato/lint/typecheck/build/diff/secretos verdes; exports dist actuales recompilados. Selector de tests con pipe falló por interpretación de pnpm.cmd; repetido correctamente por separado. Sin cambios de dependencias, contratos Fase 01 o datos reales. No atribuir nueva aprobación independiente a estas correcciones.

Prioridad: rechazo de .gitignore/.git* y límites ASCII/512 archivos/1 MiB/32 MiB/16 componentes impiden considerar preparado para proyectos reales habituales. R-037/038/040 pendientes. Revisar especialmente que historia no autoriza efectos nuevos, drift no es éxito actual, crash previo a marker no se reconfirma, y atributos se evalúan sin ejecución implícita. Gates finales/commits en status; histórico conservado debajo.

Reproducción: pnpm.cmd install --frozen-lockfile, pnpm.cmd peers check, pnpm.cmd check, git diff --check. Rollback por revert acotado conservando markers/receipts/worktrees; sin reparación/borrado automático. Main intacta, sin merge/publicación. Detenerse hasta revisión focalizada.

---

# Histórico — B03-02: paquete previo a auditoría

Preparado 2026-10-29. Implementado, pendiente de revisión; no se atribuye aceptación independiente. Base 84d60ae, rama phase/02-project-inspection, R-039 79ba91e (antes de mutaciones), B03-02 17243e8. Main e14cfdd intacta. Diff de código: git diff 84d60ae..17243e8; documentación posterior de evidencias en este cierre de tarea. B03-01 sigue aceptado/cerrado. Sin agentes invocados ni B03-03 iniciado.

## Alcance revisable

- workspace/src/index.ts: parser privado/ceiling y runner Git común con argv fijos, salida binaria acotada, hooks privados vacíos. APIs prepare/create/inspect, WorktreePolicy con ejecución y escritura de metadatos separadas, schemas CAS v1 para intención/recibo. Source/identidades revalidadas. Sin contratos de Fase 01, SQLite, proveedores, dependencias o lockfile nuevos.
- worktree-cli.ts y cli.ts: project worktree create/inspect reales. --ref/--bytes representan projectRef en create e intentRef en inspect; mismo --storage/projects.sqlite y CAS. CLI emite intención antes de add, resultado incierto sale 2; inspección no crea base inexistente. Ejemplos completos en README.
- Add detached/no-checkout/locked a OID local exacto; sin force/fetch/shell/checkout, blobs regulares como bytes por wx/fsync y read-tree al índice propio. Rechaza árboles no soportados antes del efecto. Límites: nombres ASCII conservadores sin .git*, enlaces/gitlinks, Windows reservados/case collisions; 512 archivos, 16 componentes, 32 MiB total/1 MiB por comando. Git conserva 5 s y entorno aislado.
- Intención CAS antes de Git; dispatch.json exclusivo/fsync con SHA, lock administrativo con la misma identidad. No transacción CAS/filesystem/Git. Prepared/pending/uncertain/confirmed diferenciados; despacho existente prohíbe repetir create. Inspect verifica HEAD/índice/bytes/inventario/lock y publica recibo CAS recuperable, sin reejecutar Git mutante. Parciales/huérfanos conservados sin limpieza destructiva.

## Evidencia y límites de las pruebas

R-039: regresión de frontera roja antes del cambio y verde después, delegando spawn real para comprobar cwd/ceiling/ausencia de -C. Dos fixtures de includes externos malformados ya se rechazaban con Git 2.52; no se afirma explotación reproducida en ese entorno ni trazado OS universal. Un test adicional coloca el temporal bajo ancestro Git con configuración/include hostil y confirma funcionamiento sin consultar esos includes. Primer commit pasa 315 tests y gates antes de implementar mutaciones.

B03-02: 19 pruebas nuevas reales: OID/HEAD detached/contenido, origen dirty y linked source, permisos comunes separados, destino ocupado/sentinel e identidad reemplazada, junction/root inválido, hooks/filtros/includes/enlaces/gitlinks/atributos rechazados, concurrencia de despacho y CLI en procesos separados. Bytes binarios y archivos extra posteriores verificados. Inventarios SHA/modo/mtime del original conservados, salvo directorios administrativos cuyo timestamp cambia y nuevas entradas bajo .git/worktrees; no cambios al índice/config/HEAD/archivos originales.

SIGKILL sobre proceso hijo real: antes de create -> prepared, después de add y materialización antes de read-tree -> uncertain, después de confirmar -> confirmed. Barreras sólo en script de test delegando Git/store reales, sin failpoints de producto ni mocks de durabilidad. Recovery corre en otro proceso; número de worktrees se mantiene 1/2/2, sin repetición. No se prueba power loss ni muerte a mitad de una escritura interna específica de Git.

Suite integrada final: **335/335 verdes**, sin skips/fallos: contratos 62 + persistencia 115 + runtime 71 + workspace 80 + spike 7. Incluye los 312 previos y 23 nuevos (4 R-039 + 19 worktrees). Fuentes compiladas antes de tests; typecheck consumidor dist, frozen/peers/formato/lint/build, diff y secretos comprobados. Fallos intermedios: estrechamiento TS de tupla; dos escenarios de integración excedían 5 s de Vitest (margen 15/20 s sólo en tests, no límites Git), corregidos sin skips/exclusiones. Aviso LF/CRLF de Git sólo en fixture de atributos rechazada, no cambio de configuración del usuario.

## Reproducción y preguntas de auditoría

```powershell
pnpm.cmd install --frozen-lockfile
pnpm.cmd peers check
pnpm.cmd check
git diff 84d60ae..HEAD --check
```

Revisar especialmente: ausencia de descubrimiento antes de validación; autorización de metadatos comunes; no-checkout y materialización sin ejecución implícita; posesión física/lock/despacho de intención y denegación de repetición; partials y evidencia después del crash. Distinguir límites conservadores documentados de fallos de seguridad o recuperación.

R-037/038/040 siguen pendientes (inode -> registrar de nuevo, volumen ls-files, continuaciones conservadoras). R-039 corregido localmente, requiere auditoría de este paquete. R-041: ACL/raíces/Git/PATH confiables, storeRoot debe corresponder al store, exclusión intraproceso y uso exclusivo del operador; sin sandbox/lease multiproceso/autenticación contra dueño privilegiado. Confirmed es estado observado, no garantía contra procesos ajenos posteriores. Worktrees permanecen locked; sin remove/unlock/prune, streaming/GC, agentes o contexto. Rollback por revert preservando datos/worktrees; reparar/eliminar requiere autorización. Detenerse hasta revisión independiente B03-02.

---

# Histórico — B03-01: aceptación independiente y cierre formal

Registrado: 2026-10-29. Segunda auditoría **APPROVE_WITH_FOLLOWUPS** comunicada y aceptada por el usuario: Claude confirma P1 d73466b resuelto, sin bloqueo para cerrar. **B03-01 aceptado y cerrado.** Código final d73466b, evidencias 0cb8e61, rama phase/02-project-inspection. Este turno es exclusivamente documental, sin invocar agentes ni atribuir otra auditoría propia.

Se conservan 312/312 tests funcionales y gates de la corrección como evidencia histórica; las comprobaciones de este cierre se registran en status. Main e14cfdd intacta, sin merge/publicación. Cuatro P3 **aceptados y pendientes, ninguno corregido**:

| Seguimiento | Estado / tratamiento |
|---|---|
| R-037: config reemplazado por inode nuevo | Nuevo registro tras revisión manual, conservar referencias; sin relajar pins. |
| R-038: salida ls-files con muchos tracked | git_limit; procesamiento incremental diferido. |
| R-039: include externo durante descubrimiento por -C root | Prioridad antes de repositorios no confiables y mutaciones B03-02. Candidato: parser desde directorio privado sin descubrimiento, a demostrar con regresión. --no-includes no garantiza por sí solo ausencia de lectura externa. |
| R-040: rechazo de barras escapadas legítimas | Compatibilidad limitada; conservar fallo cerrado, corrección diferida con tests pares/impares y CRLF/LF. |

La aceptación cierra el P1 de ejecución arbitraria, no acredita ausencia total de lecturas externas ni corrige los P3. Las afirmaciones previas de no lectura de includes se limitan al parser explícito, no al descubrimiento inicial de Git.

Siguiente nodo: **B03-02 — Creación y verificación de worktrees aislados**, propuesta en docs/execution/phases/phase-02.md con prerequisito R-039. Sin implementación ni aceptación atribuida al plan. Detenerse tras cierre/preparación.

---

# Histórico — B03-01: corrección P1 previa a segunda auditoría

Preparado: 2026-10-29. Veredicto independiente recibido: **REQUEST_CHANGES**, un único P1 bloqueante confirmado. Corrección `d73466b` verificada localmente; **B03-01 sigue abierto hasta verificación independiente y aceptación**. No se invocaron Claude Code ni otros agentes. No iniciar B03-02.

## Alcance y commits

Base correctiva `d34d82f`, código/tests `d73466b` en phase/02-project-inspection: `git diff d34d82f..d73466b` (sólo workspace/src/index.ts y workspace/test/project.test.ts). Memoria, README y paquete actual en commit documental posterior. Implementación completa desde `485283c`; plan inicial `c201c0d`. Contratos/persistencia/F-5/runtime/dependencias/schema/lockfile intactos frente a la base correctiva; main permanece e14cfdd, sin merge/publicación.

Cambio mínimo: el bucle existente de config/config.worktree conserva lectura limitada, pins y rechazo de continuaciones; usa parser oficial `git config --file <ruta> --no-includes --list --name-only -z`. Comparación de sección de clave normalizada rechaza include.*, includeif.* y filter.* independientemente de encabezados contiguos, mayúsculas y subsecciones. Registro e inspección validan antes de rev-parse/status/ls-files. Errores de Git/parsing/salida inesperada fallan cerrado; se comprueba terminación NUL y registros con sección/clave. No se interpreta configuración externa ni se siguen includes durante validación.

Se reutiliza el mismo runner privado con variante fija config+archivo: argv separados, shell:false, entorno aislado, --no-pager/--no-optional-locks, fsmonitor desactivado, 5 s/1 MiB. No hay runner genérico ni cambio de contratos públicos/identidades/permisos.

## Reproducción rojo → verde

- Build de fuente anterior antes del rojo. Reproducción definitiva de 34 pruebas nuevas: **17 rojas / 17 verdes**; 16 casos de encabezados contiguos ejecutaron el marcador inocuo (4 variantes × register/inspect × config/config.worktree) y una operación aceptó el listado expandido superior al límite. Antes de esa reproducción se corrigió la fixture: un cambio de tamaño permitía a Git detectar dirty sin convertir; mantener tamaño obliga a comprobar el filtro. El control positivo ya pasaba antes de modificar producto.
- Después de `d73466b` y nuevo build: **34/34 verdes** enfocadas. Matriz: filter convencional, [core][filter "x"], [core][include], includeIf, mayúsculas/encabezados contiguos; archivos config y config.worktree sobre linked worktree real, operaciones register/inspect. Inspect parte de un registro limpio y modifica configuración conservando inode, evitando falsos verdes por rechazo de identidad.
- También: dos casos válidos con secciones contiguas, cuatro casos malformados, dos de continuaciones y un listado de claves >1 MiB a partir de archivo <256 KiB. Error unsafe_path para claves prohibidas, git_failure para parsing, git_limit para salida excedida; sin resultados parciales ni retry.
- El control positivo adicional invoca Git status sin la protección del producto, ejecuta sólo Node con script fijo y marcador bajo el temporal de la fixture. Demuestra que el filtro es operativo. **Ningún filtro se ejecuta desde registerProject/inspectProject tras la corrección.** Inventarios SHA-256/modo/mtime de repositorio/worktree/metadata y archivo include intactos; comandos/scripts sólo pueden escribir el marcador dentro de temporales controlados, eliminados al cerrar stores.

## Gates y reproducción independiente

Node 24.19.0/SQLite 3.53.3. Frozen install, peers, formato, lint con tipos, typecheck consumidor dist, build y **312/312 tests**, sin skips/fallos finales: contratos 62 + persistencia 115 + runtime 71 + workspace 57 + spike 7. Son los 278 previos intactos + 34 nuevos. Diff/staged paths y escaneo de patrones de secretos sin hallazgos; no se acredita CI remota nueva. Los únicos rojos definitivos son los intencionales anteriores a corregir; ajuste de fixture descrito arriba, sin exclusiones de gates.

```powershell
pnpm.cmd install --frozen-lockfile
pnpm.cmd peers check
pnpm.cmd check
git diff d34d82f..d73466b --check
```

Para aislar seguridad después de build actual: `pnpm.cmd --filter @beonforge/workspace exec vitest run -t P1` (34 seleccionadas; las 23 previas se omiten sólo en esta selección, no en el gate completo). Revisar especialmente que config --no-includes valida antes de comandos susceptibles de filtros y mantiene todas las protecciones previas. No atribuir aprobación a estos resultados locales.

## Seguimientos y salida

P3-1/R-037: un reemplazo legítimo del inode de config exige nuevo registro tras revisión manual, con las mismas raíces/storage/permisos; conservar nueva referencia y no alterar la antigua. Procedimiento explícito en packages/workspace/README.md. P3-2/R-038: muchos tracked pueden exceder salida de ls-files; git_limit sin parcial/retry, procesamiento incremental diferido a nodo posterior. **Ambos sólo documentados, sin cambios funcionales.** R-034/035 (raíces/ACL privadas, PATH/Git confiables, snapshot no atómico y límites) permanecen; R-036 mitigado localmente, pendiente de verificación independiente.

Rollback: revert correctivo acotado sin borrar datos/repositorios y suspender registro/inspección hasta restablecer protección, pues la versión anterior es vulnerable. Siguiente nodo único: recibir verificación independiente P1 y aceptación B03-01. Detenerse sin B03-02 ni cierre automático.

---

# Histórico — B03-01: paquete inicial anterior a REQUEST_CHANGES

Preparado: 2026-10-28. **Implementado/verificado localmente, pendiente de revisión independiente aportada por el usuario.** No se invocó Claude Code ni otros agentes. Fase 01/M01.3 siguen aceptados/cerrados; este paquete no atribuye aprobación a B03-01. B03-02 no iniciado.

## Alcance y diff

Base `485283c`, plan `c201c0d`, implementación `a837e9c`, rama `phase/02-project-inspection`. Revisar `git diff 485283c..a837e9c` para plan/código/tests/lockfile y memoria documental posterior de esta misma tarea. Main permanece `e14cfdd`, sin merge/publicación. `packages/contracts`, `packages/persistence` (incluido F-5) y `packages/runtime` no tienen cambios frente a la base. Sin dependencias externas: lockfile sólo incorpora nueve líneas de enlaces workspace.

Únicamente repositorios Git normales y linked worktrees existentes. Descriptor JSON v1 en ArtifactStore aceptado, sin catálogo ni nuevos eventos/migraciones. Inspección de HEAD/rama/detached/unborn, cambios tracked agregados y gitlinks. No creación de worktrees, context selection/indexación, runtime nuevo, agentes, proveedores ni UI.

## Puntos de revisión

- `packages/workspace/src/index.ts`: pathId frente a repositoryId, pins físicos dev/ino/tipo, raíz exacta, punteros `.git`/commondir/backlink y revalidación previa/posterior. Permisos separados checkout/git-dir/common-dir; el común no autoriza otros checkouts. Rutas canónicas por componentes, rechazo de symlinks/junctions/traversal/UNC/ADS y de metadata insegura. Descriptor incompatible o identidad reemplazada falla cerrado; no se actualiza automáticamente.
- Adaptador Git en el mismo archivo: allowlist privada, argv separados/sin shell, entorno aislado, no-optional-locks/pager off/fsmonitor off, configuración global/system externa desactivada, no safe.directory. Sin untracked/ignored ni contenido de submódulos. Includes/filtros/continuaciones/alternates rechazados; salida y tiempo finitos, errores fijos sin stderr/rutas brutos.
- `packages/workspace/src/cli.ts`: registro e inspección usan --storage absoluto, existente, privado y separado de raíces autorizadas; projects.sqlite y projects.sqlite.artifacts. SHA-256+byteLength recuperan el descriptor tras reinicio. Inspect exige DB regular no vacía existente. API recibe ArtifactStore confiable externo, sin ampliarlo para descubrir rutas o crear catálogo.
- `packages/workspace/test/project.test.ts`: repositorios temporales reales, imports públicos y CLI dist; fixtures mutan Git sólo antes del inventario. Inventarios SHA-256/modo/mtime/directorios aseguran ausencia de escrituras, incluyendo índice, configuración, tracked/ignored/privados. No mocks de Git ni durabilidad.

## Evidencia y reproducción

Con runtime portátil verificado Node 24.19.0/SQLite 3.53.3 y Git local:

```powershell
pnpm.cmd install --frozen-lockfile
pnpm.cmd peers check
pnpm.cmd check
git diff --check
```

Resultado: **278/278 tests**, cero skips/fallos finales: contratos 62, persistencia 115, runtime 71, workspace 23, spike SQLite 7. Check compila fuentes antes de lint/typecheck/tests; tests y consumidores resuelven dist/index.js y dist/index.d.ts actuales. Formato, lint con tipos, typecheck, build, frozen y peers verdes. Primer lint detectó un import sin uso, corregido sin exclusiones. Escaneo textual de patrones de secretos y paths del diff sin hallazgos; no acredita auditoría exhaustiva ni nueva CI remota.

Demo automatizada: test CLI registra en un proceso, conserva sha256+byteLength e inspecciona en otro sobre el mismo --storage. Resultado repository/0 cambios tracked, inventario original intacto; duplicación de registro devuelve la misma referencia. Fixtures adicionales acreditan un cambio tracked, detached/unborn, worktree con repositoryId compartido y pathId distinto, denegación por permiso git/común faltante, reemplazo de raíz/Git/config/commondir, junctions y prefijos de ruta engañosos, variables Git hostiles, fsmonitor no ejecutado, gitlinks sin checkout, storage superpuesto y DB ausente rechazados sin creación. Comandos manuales y política en packages/workspace/README.md.

## Límites y salida

R-034/035: raíces/ancestros/Git/PATH confiables, ACL privada Windows del operador; no sandbox contra propietario concurrente ni snapshot atómico de HEAD/índice. Dev/ino no disponibles se rechazan. Descriptores contienen rutas privadas y deben protegerse. Git status puede leer tracked para calcular cambios, sin incorporarlos a contexto. Metadata limitada a 10 000 entradas por validación; config/punteros 256 KiB, cada comando 5 s/1 MiB. Repositorios con includes/filtros/alternates, git-dir separado no-worktree, UNC/symlinks/junctions o límites excedidos se rechazan deliberadamente. Verificación local Windows, no nueva CI Linux observada.

Solicitar veredicto independiente sobre este alcance, distinguiendo límites explícitos de defectos reales. No bloquear por creación de worktrees, aislamiento de herramientas o selección/indexación de contexto aún no implementados. Rollback: revertir commits B03-01 conservando datos privados existentes y repositorios; sin borrado, migración o modificación del kernel aceptado. Siguiente nodo único: recibir revisión B03-01. Detenerse, sin iniciar B03-02.

---

# Histórico — M01.3: aceptación formal y cierre de Fase 01

Registrado: 2026-10-28. **M01.3 y Fase 01 aceptados/cerrados.** Veredicto independiente APPROVE_WITH_FOLLOWUPS aceptado por el usuario, sin P0–P2. El cierre estaba condicionado a tres P3 mínimos, ahora reproducidos/corregidos/verificados. No se invocó ningún agente ni se atribuye una nueva revisión independiente a estos commits; se registra la aceptación recibida y sus condiciones satisfechas. Fase 02 no iniciada.

## Commits y evidencias correctivas

Base: `12e3eba` (paquete inicial M01.3). Código final: `c1b8bad`, rama `phase/01-workflow-runtime`. Diff: `git diff 12e3eba..c1b8bad`; milestone completo desde `dada616`. Main permanece `e14cfdd`, sin merge/publicación. Evidencia y semántica temporal en packages/runtime/README.md; paquetes históricos conservados debajo.

| Hallazgo | Rojo antes del cambio | Corrección / verde |
|---|---|---|
| P3-1, cancelación/persistencia | 5 tests compilados no podían observar la confirmación/transitoriedad/desconocimiento. | `b178729`: cancellationPersisted true para cancelled confirmado/recuperado, false para parada conocida antes de iniciar el siguiente intento, null antes de leer historia/otros estados/resultados inciertos. 5 nuevos verdes; incluye error SQL real y recuperación sin retry de pending. |
| P3-2, exit/argumentos | 15 rojas: abort reescribía 0/1/2 a 130, formatos no decimales se aceptaban y rangos inválidos creaban storage antes de fallar. | `8e13a5e`: exit según estado real, blocked=2 con abort, cancelled=130; timeout decimal canónico 1..2147483647 antes de DB. 18 nuevos verdes incluidos ambos límites y cancelación aplicable. |
| P3-3, inspect | 5 rojas: DB ausente se inicializaba, diagnóstico de parent ausente era genérico, vacío se inicializaba y directory dejaba CAS. | `c1b8bad`: lstat previo, database_not_found para DB/parent ausentes; rechaza vacío/no regular antes de persistencia. 6 nuevos verdes, inventarios/sentinels intactos y operación existente conservada. |

## Gates, compatibilidad y aceptación

- Build de fuentes actuales antes de cada reproducción roja; tests contra exports/CLI compilados, no dist obsoleto. Check recompila fuentes y consumidor de declaraciones. No se borraron ni sustituyeron tests originales.
- Node 24.19.0/SQLite 3.53.3, frozen install, peers, formato, lint con tipos, typecheck, build y **255/255 tests** verdes: 62 contratos + 115 persistencia + 71 runtime + 7 spike. Son los 226 previos más 29 nuevos (5 + 18 + 6); sin skips/fallos finales. Demo SIGKILL/checkpoint/tail y volumen anteriores siguen incluidos. No se encontraron fallos de gates intermedios ajenos a las regresiones rojas intencionales.
- Semántica de ejecución intacta: cancelled terminal sigue terminal; pending/uncertain no se reejecutan ni se convierten en reanudables. cancellationPersisted es observación al emitir el reporte, no petición durable global ni permiso para retry. Ante fallo/resultado desconocido de persistencia se propaga error y no se inventa confirmación; recovery sigue siendo autoridad.
- Campo nuevo opcional en el tipo para compatibilidad de consumidores; error database_not_found y validación CLI son aditivos/acotados. Contratos/eventos/schema y código aceptado de persistencia/F-5 intactos; sin dependencias, root manifests o lockfile nuevos.
- Pruebas de señales usan proceso real del CLI y SIGINT emitido en fronteras delegadas de process.once/stdout para ser portables; no simulan reportes, durabilidad ni resultados de persistencia. No prometen entrega OS idéntica en todas las plataformas. Inspect es preflight bajo el modelo existente de raíces privadas, no adaptador readonly.
- Diff/staged paths y escaneo textual de secretos revisados; sólo temporales controlados, limpiados sin residuos. Sin nueva CI remota observada, publicación, merge ni modificación de main.

Aceptación formal: revisión independiente aceptada por el usuario y tres seguimientos verificados con todos los gates. Se cierra M01.3/Fase 01, sin autogenerar otro veredicto. Riesgos R-023/024/025/026/027/031/032 continúan: memoria, ámbito intraproceso, ACL privadas, cancelación cooperativa/handlers confiables, falta de reconciliación y power loss no acreditado.

Rollback: revert sólo de correcciones/registro conservando datos y schemas. Siguiente nodo: acotar la primera tarea de Fase 02 Workspace y contexto según master-plan; no hay phase-02.md ni tarea detallada aún. No se crea plan ni se inicia código de esa fase en este turno.

---

# Histórico — M01.3 runtime y recuperación, paquete previo a revisión

Preparado: 2026-10-28. **B02b-03 verificado localmente; M01.3 no aceptado/cerrado.** Esperar revisión independiente suministrada por el usuario; no invocar agentes ni iniciar Fase 02. M01.1/M01.2 aceptados siguen intactos; registros históricos debajo.

## Alcance y diff

- Base: `dada616` (M01.2 cerrado); código final `1378d38`, rama `phase/01-workflow-runtime`. Diff reproducible: `git diff dada616..1378d38`. Main sigue `e14cfdd`, sin merge/publicación.
- Nuevo paquete funcional packages/runtime: Workflow JSON v1 y parser, DAG de 1–64 nodos, runner serial, puertos mínimos de handlers confiables y CLI run/inspect. Usa contratos y DurableStore existentes, sin import SQLite/proveedores en runner ni cambios a persistencia/F-5. Lockfile sólo añade dos enlaces workspace (9 líneas), sin nuevas dependencias externas.
- Protocolo: kernel.plan reservado enlaza CAS del grafo canónico a runId con eventos v1 existentes antes de handlers. Start confirmado antes de dispatch; inputs efectivos enlazan evidencia de dependencias; outputs CAS antes de finish/checkpoint. La metadata no es un agente ni nuevo EventStore. Alterar un grafo ligado al mismo run o adoptar historia ajena falla cerrado.
- Recuperación hidrata últimos intentos desde checkpoint y consulta proyecciones de identidades del tail; comprueba semántica de historia/orden/manifest. Continúa leyendo el log completo: no se promete optimización tail-only. Un finish confirmado sin checkpoint se reutiliza y repara su checkpoint, sin repetir handler.
- Registro handler/versión/efectos debe coincidir, allowlist externa denegada por defecto. Failed exige selección explícita de un nuevo intento por invocación; cancelled terminal, pending/uncertain bloqueados. No se implementa reconciliación manual ni estados de aprobación de task/merge.

## Evidencia verificable

Node 24.19.0/SQLite 3.53.3, WAL/FULL, frozen install, peers, formato, lint con tipos, typecheck de fuentes y consumidor dist, build, **226/226 tests** (62 contratos + 115 persistencia + 42 runtime + 7 spike), sin skips/fallos finales. Diff/paths/secretos revisados; sólo temporales propios cerrados/eliminados. Root package/contratos/persistencia intactos, sin nuevo run remoto observado.

42 tests nuevos: 35 frontera/runtime y 7 CLI/proceso. Cubren DAG/ciclos/versiones/inputs inválidos, permisos/effect mismatch, plan inmutable, orden serial/evidencia, rerun sin duplicados, retry de failed, cancel antes/después de dispatch, timeout/handler tardío bloqueando store, resultados inválidos/excepciones sin filtrar contenido, SQL real fallido antes de finish/checkpoint y recuperación. Primer lint detectó ocho require-await en fixtures instantáneas, corregidos sin excepciones de reglas; gates completos posteriores verdes.

Demo repetible tras build: `pnpm.cmd --filter @beonforge/runtime demo`. Un hijo usa el mismo runtime/SQLite/CAS y archivos receipt exclusivos/fsync. Barreras sólo de test delegan append/checkpoint reales o esperan tras el efecto; no simulan durabilidad ni añaden failpoints productivos. Parent mata con SIGKILL y reabre:

| Corte | Snapshot / tail | Resultado y efectos |
|---|---|---|
| Finish confirmado antes de checkpoint | seq 2 / 2 eventos | succeeded; 1 efecto restante, 0 reejecuciones confirmadas, 2 receipts |
| Después del checkpoint | seq 4 / 0 eventos | succeeded; 1 efecto restante, 0 reejecuciones confirmadas, 2 receipts |
| Durante segundo efecto ya escrito | seq 4 / 1 start | blocked pending; 0 efectos reejecutados, 2 receipts y ninguna invocación restante |

CLI real además ejecuta ejemplo, inspecciona eventos, reabre sin duplicar, devuelve failure/blocked con códigos coherentes y conserva incertidumbre tras timeout. El CLI sólo registra fixtures puras, sin shell/red/carga dinámica de módulos. El efecto externo de demo se ejecuta por API con handler confiable y permiso explícito, únicamente en temporales.

## Revisión enfocada y límites

1. ¿La vinculación del plan y el orden de deps/manifest/attempt IDs impiden mezclar definiciones o reejecutar trabajo confirmado al recuperar checkpoint y tail?
2. ¿Se conserva incertidumbre en cada fallo entre start, efecto, CAS, finish y checkpoint, sin retries automáticos ni duplicaciones peligrosas?
3. ¿Cancelación, timeout y exclusión por handle fallan cerrado ante handlers tardíos, sin confirmar/publicar su resultado después de retornar uncertain?
4. ¿Las fronteras de permisos/registro y CLI son mínimas y honestas sobre su confianza, sin anticipar motores de agentes o herramientas generales?

R-023/024/025/026/027/031/032: memoria sin cuotas/streaming, propietario/ACL privado, un control plane por DB, no raw concurrent store mutation, cancelación cooperativa sin sandbox/preempción, handler puede seguir efectos hasta asentarse, sin reconciliación pending/uncertain ni exactamente-una-vez/power loss. Los permisos son decisiones explícitas del caller, no aprobaciones humanas persistidas. Validar esto dentro del alcance; proveedores, worktrees, políticas generales y reconciliación futura no son capacidades implementadas por B02b-03.

Rollback: revert acotado de implementación/registro conservando datos v1/schema v2. Siguiente nodo único: recibir revisión independiente M01.3; Fase 01 no se cierra ni Fase 02 se inicia antes de aceptación.

---

# Histórico — M01.2 aceptación formal y cierre

Registrado: 2026-10-28. **M01.2 aceptado y cerrado.** Segunda revisión independiente de Claude Code: APPROVE_WITH_FOLLOWUPS, comunicada por el usuario. F-5 está resuelto y validado. El usuario condicionó el cierre a corregir y verificar tres hallazgos restantes; condición satisfecha con regresiones/gates siguientes. No se atribuye una tercera revisión de estos commits ni se invocó Claude Code u otro agente. Paquetes anteriores conservados debajo.

## Cambios revisables y regresiones

Base de followups: `293b8cd`. Final de código: `98e93b6`, rama `phase/01-artifacts-recovery`. Diff: `git diff 293b8cd..98e93b6`; milestone completo desde `d960957`. Main permanece `e14cfdd`, sin merge ni publicación. Evidencia detallada en `packages/persistence/REVIEW-FIXES.md`.

| Seguimiento de segunda revisión | Evidencia roja previa al cambio | Corrección / verde |
|---|---|---|
| F-7 P2, destinos de restore | 8 destinos inseguros aceptados tras build actual: origen, sus blobs/descendientes y SQL/CAS activo. | `15a9cf8`: valida lstat/rutas reales/parentesco contra origen, escritores registrados y ancestros CAS/artefactos/recuperación antes de crear. 12 regresiones verdes, sin residuos, backups/restores posteriores válidos, stores cerrados identificables y junctions. |
| F-6 P3, artifactRoot | 6 rojas: SQLite externo podía ejecutar putArtifact dentro de backups completos/renombrados/incompletos o crear DB bajo descendiente del bundle. | `6f28d9e`: guarda ancestros de ambas rutas antes de inicializar; no toma prestado CAS de otro restore. 8 nuevas verdes, inventarios y DB/CAS externos intactos; propio restore sigue operable. |
| P3, manifest ajeno | 6 rojas originales por nombre de archivo; otra roja mostró firma de dos campos demasiado genérica durante la corrección. | `93481c0`/`98e93b6`: firma completa schemaVersion/database/artifacts/sequence, rol y reconocimiento de snapshots legacy sellados. 13 nuevas verdes: manifests ajenos, inválidos BeonForge, copias renombradas/dañadas y ausencia de manifest bajo marcador de rol. |

## Verificación y aceptación

- Cada regresión roja se ejecutó después de `pnpm.cmd build` contra exports compilados del código fuente actual; no se usó dist obsoleto. Check recompila antes de lint, typecheck y tests. Sólo temporales privados controlados, con limpieza verificada.
- Frozen install, peers, formato, lint con tipos, typecheck, build y **184/184 tests** (62 contratos + 115 persistencia + 7 spike) verdes. 33 tests nuevos: 12 F-7 + 8 F-6 + 13 manifest. Se conservan volumen 800/40, idempotencia, referencias, corrupción, backup/restore, rollback/reopen y SIGKILL; sin skips/fallos finales.
- F-5 no modificado: núcleo de database.ts desde normalizeError hasta final idéntico a `293b8cd`; colas/timeouts de client intactos, sólo se añade directorio de escritores al comando privado restore. Nuevos guards de ruta/rol no rediseñan stores ni añaden dependencias, schemas de dominio, GC, scheduler, agentes o runtime.
- Diff, staged paths y escaneo textual de secretos sin hallazgos; main, contratos M01.1, root manifests/lockfile preservados. Sin nuevo run remoto observado.
- Aceptación registrada a partir del veredicto independiente recibido y de la verificación de sus followups conforme a la condición del usuario; cierre M01.2. No se interpreta un gate local como un nuevo veredicto independiente.

Límites abiertos: R-023/025/026/027, memoria materializada/retención, raíces/ancestros privados y ACL, crash de proceso distinto de power loss, marcas/hashes sin autenticación privilegiada. El registro de escritores es intraproceso; stores cerrados/CAS externos sólo son reconocibles por su layout/marcadores. En la clasificación legacy ambigua se lee SQLite para identificar su cabecera, con el límite de memoria ya documentado. Estos límites no implementan ni bloquean ficticiamente funcionalidades posteriores.

Rollback: revert acotado conservando datos y schema, sin borrado ni sustitución de activos. Siguiente nodo B02b-03 desbloqueado pero **no iniciado**; esta ejecución se detiene aquí.

---

# Histórico — Segunda revisión tras REQUEST_CHANGES

Preparado: 2026-10-28. **Milestone abierto, aprobación independiente pendiente. No iniciar B02b-03.** Claude Code emitió REQUEST_CHANGES según informe recibido del usuario; no se invoca desde aquí. Los paquetes anteriores se conservan debajo como históricos.

## Base y commits correctivos

Base de esta revisión: `4dc43a8` (B02b-02 y paquete original). Final de código: `0121302`, rama `phase/01-artifacts-recovery`. Diff: `git diff 4dc43a8..0121302`. Para milestone completo, base M01.1 `d960957`: `git diff d960957..0121302`. Main permanece `e14cfdd`, sin merge/publicación.

| Hallazgo | Reproducción antes del cambio | Corrección y evidencia |
|---|---|---|
| F-5 P1, degradación/timeouts | Volumen automatizado 800 eventos/40 checkpoints: open directo 26,223 s, 50040 lecturas verificadas/17200 applies; backup 115,215 s, 197842/66400. Open worker falla a 10,018 s, storage_failure. | `605c43d`: validación única, caché SHA por operación y replay incremental ordenado. Final open 0,746 s, 41/800; backup 1,644 s, 82/800. Política finita configurable separa cola/apertura/ejecución/backup/restore; cola expirada sin envío, mutación enviada incierta sin retry. |
| F-6 P2, apertura insegura | 9 regresiones rojas: backup completo/incompleto aceptado y restores sin ready válido/DB/CAS inicializados. | `773524d`: identificación antes de escritura, ready v1 estricto, nombres/versión/prefijo coherentes; marcador de origen incluso tras rename. 11 nuevas verdes y kills históricos. Restores previos con ready válido compatibles. |
| F-7 P2, destino anidado | 6 regresiones rojas: SQLite/CAS raíz/hijos, blobs y staging; contaminación de inventario. | `2913393`: rutas reales/relación padre-hijo y rechazo de junctions antes de mkdtemp; 13 nuevas verdes, cero residuos en rechazo y retry/restore válidos; CAS personalizado y nombres de hermanos probados. |
| P3, diagnóstico de inventario | Regresión roja por error genérico ante entrada ajena a blobs. | `0121302`: unexpected_artifact_entry fijo sin rutas/nombres; no borra ni ignora entradas. Una regresión verde. |

## Gates y reproducción

- Node 24.19.0/SQLite 3.53.3, WAL/FULL, mismo worker; sin dependencias nuevas, cambios al dominio M01.1, schema v2, root manifests o lockfile. API compatible con opciones/diagnósticos aditivos; contratos de manifiestos/resultados/eventos intactos.
- Frozen install, peers, formato, lint con tipos, typecheck, build, **151/151 tests** (62 contratos + 82 persistencia + 7 spike), sin skips ni fallos finales. Volumen, integridad, idempotencia, rollback, referencia ausente, corrupción, reapertura y SIGKILL incluidos. Diff/alcance/secretos revisados; sólo temporales controlados.
- Comando de volumen después de build: `pnpm.cmd --filter @beonforge/persistence exec vitest run test/volume.test.ts --silent=false`. Workload: 800 starts independientes, una evidencia compartida, 40 checkpoints cada 20 eventos. Fixture instrumenta ArtifactFiles.read y apply compilados sólo en hijo de test; contadores excluyen hashes de inventario/staging y no observan workers. Tiempos diagnósticos, no SLA. Detalle completo y comparativa en `packages/persistence/REVIEW-FIXES.md`.
- Muestra final `0121302`: worker abre 0,741 s, backup 1,390 s y restore 1,459 s; restaurado reabre con 800 eventos y checkpoint 800. Los contadores máximos se asertan sin umbrales de velocidad del hardware. La regresión original fue roja antes de modificar producción.
- Fallos intermedios corregidos: effects inválido en primera fixture (no contado como reproducción); lint de once() y formato Markdown; dos reaperturas con alias Windows 8.3/largo en primer check F-6. Regresiones/gates completos posteriores verdes, sin excepciones.

## Preguntas de revisión y límites pendientes

1. ¿El replay ordenado/caché local conserva cada verificación de integridad y cada prefijo, sin aceptar referencias de longitud incoherente o mantener cachés entre operaciones?
2. ¿Las clases de timeout mantienen incertidumbre sólo para comandos enviados, sin ejecutar comandos expirados ni reintentar efectos?
3. ¿Los marcadores distinguen backup/restore de store nuevo antes de mutaciones, incluyendo ausencia, corrupción, rename e interrupciones?
4. ¿La validación de destino rechaza raíces/descendientes/aliases antes de crear residuos y permite los hermanos válidos?

Seguimientos P3 explícitos en REVIEW-FIXES/R-023/025/026/027: memoria materializada sin streaming/cuotas, retención sin GC, raíces/ancestros y ACL privados, power loss Windows no acreditado, hashes/marcadores sin autenticación privilegiada. No se recibieron IDs/textos P3 externos adicionales; no se atribuyen hallazgos inventados a Claude. Sin runtime, scheduler, agentes, routing, UI ni arquitectura nueva. Sin nueva CI Linux/remota observada.

Rollback: revertir sólo commits correctivos conservando datos y schema; no borrar copias reales ni reemplazar activos. No se cierra M01.2 hasta aprobación independiente; siguiente nodo único: recibir esa revisión, reproducir hallazgos si los hubiera. B02b-03 no iniciado.

---

# Histórico — Primer paquete M01.2 Persistencia

Preparado: 2026-10-28. Estado: **pendiente de revisión del usuario**. B02b-02 terminado con gates locales verdes; no iniciar B02b-03 ni cerrar M01.2 antes de aceptación. No invocar otros agentes. Paquetes históricos M01.1/M00.3 conservados debajo.

## Alcance y evidencia M01.2

- Base: `d960957` (M01.1 cerrado). Final de código: `2e5f9e3`, rama `phase/01-artifacts-recovery`. Diff reproducible: `git diff d960957..2e5f9e3`; sólo B02b-02: `git diff 0a0c4f9..2e5f9e3`.
- `d01daf2`/`2730db5`: spike y selección node:sqlite. `39480c0`/`0a0c4f9`: eventos/proyección en worker. `2e5f9e3`: CAS, checkpoints schema v2 y backup/restore aislado. Este registro documental posterior no cambia código.
- Alcance contractual: M01.1 intacto; mismo EventStore y worker reutilizados, DurableStore añade operaciones específicas. B02b-02 no añade dependencias ni cambia root manifests/lockfile. Sin runtime de ejecución, scheduler, agentes, routing ni UI.
- Node 24.19.0/SQLite 3.53.3 verificados, WAL/FULL; frozen, peers, formato, lint con tipos, typecheck, build y **115/115 tests** (62 contratos, 46 persistencia, 7 spike). Los 25 tests nuevos usan exports compilados y temporales reales, sin mocks de durabilidad o failpoints productivos.

## Comportamiento y límites a revisar

`packages/persistence/RECOVERY.md` define APIs, publicación, rutas autorizadas, fallos entre filesystem/SQL, checkpoints y protocolo de copia. CAS usa SHA-256/longitud, staging exclusivo fsync, publicación link sin overwrite y dedupe verificado. Sólo después confirma referencias SQLite. Fallos pueden dejar temporales o blobs huérfanos; no son un checkpoint ni provocan ejecución/GC.

Migración aditiva 1→2 introduce workflow_checkpoints. Un snapshot v1 contiene prefijo confirmado y proyecciones; carga verifica bytes y replay bajo SAVEPOINT revertido, preservando la proyección actual y pending/uncertain. No equivale a SQLite WAL checkpoint. No hay sustitución de datos ni downgrade automático.

Backup usa node:sqlite.backup con WAL activo y serializa el comando completo; copia/valida CAS y SQLite, sella snapshot standalone y completa manifest/marcador. Restore comprueba hashes/inventario, integrity_check, FK, schema/application_id, replay y referencias/checkpoints en directorio nuevo antes de ready. Restores repetidos generan nuevos directorios, nunca reemplazan el activo. Activación fuera de alcance, requiere aprobación aparte.

Seguridad depende de raíces privadas: traversal, symlinks/junctions, directorios reemplazados y no-files se rechazan; no se promete sandbox ante dueño privilegiado que cambie ancestros durante syscalls. Windows requiere ACL privada y carece de fsync portable de directorios. Hashes no autentican bundles contra sustitución privilegiada. No hay streaming/GC/cuotas ni garantías de power loss; ver R-025/R-026/R-027.

## Reproducciones y resultados

- SHA conocido/vacío, dedupe concurrente entre dos publishers, truncación antes de publicar, corrupción sin overwrite y referencias ausentes rechazadas. Traversal y junctions se prueban preservando sentinels fuera del CAS, siempre dentro de temporales controlados.
- SQL fail después de publicar snapshot conserva huérfano y revierte metadata; retry deduplica. SIGKILL dentro de trigger temporal antes del INSERT de checkpoint confirma CAS publicado/ninguna fila confirmada, con recuperación/retry coherente. Otros kills: staging, blob huérfano, checkpoint ya confirmado, backup/restore interrumpidos después de copia SQLite antes de completar conjunto.
- Backup/restore real de WAL activo con append posterior encolado: restaurado conserva el snapshot anterior y el activo conserva su estado posterior. Bundle corrupto, schema futuro incluso con hash nuevo y referencia lógica inexistente son rechazados; directorios incompletos no se aceptan como activos.
- Fallos iniciales corregidos: Buffer no importado en fixture; EPERM al fsync readonly del snapshot en Windows. Diagnóstico reproducido, snapshot nuevo sincronizado con handle write-capable; gates finales verdes sin skips. Diff/staged paths y escaneo de secretos sin hallazgos. Sin run remoto nuevo, merge, publicación ni modificación de main (`e14cfdd`).

## Preguntas para revisión

1. ¿Publicación CAS antes de SQL y los marcadores manejan todos los cortes pertinentes sin promover contenido incompleto o duplicar efectos?
2. ¿Checkpoints/prefijo/replay preservan estado confirmado y pending/uncertain sin modificar indebidamente la proyección actual?
3. ¿Backup/restore valida realmente el conjunto y evita overwrite/activación, incluyendo fallos, versiones y referencias faltantes?
4. ¿Las comprobaciones de rutas y las condiciones de propietario/ACL están correctamente acotadas, sin atribuir sandbox/power-loss guarantees no implementadas?

Rollback: revertir commits de implementación/registro de esta tarea conservando datos; no borrar ni forzar downgrade schema v2. Siguiente B02b-03 sólo tras revisión/aceptación M01.2; no ejecutado.

---

# Paquete de revisión independiente — M01.1 Contratos

Preparado: 2026-10-28. Estado: **M01.1 aceptado y cerrado** tras revisión independiente `APPROVE_WITH_FOLLOWUPS`, único hallazgo F-4 corregido y gates verdes. Revisión confirmada por el usuario, sin invocar otros agentes. El paquete histórico M00.3 se conserva debajo.

## Resultado de revisión y F-4

- Veredicto recibido: APPROVE_WITH_FOLLOWUPS. Único hallazgo: F-4, P3, mutabilidad runtime de TASK_STATES y TASK_TRANSITIONS. Sin otros defectos bloqueantes confirmados; las garantías reservadas para B02 siguen pendientes.
- Reproducción: tres tests de regresión contra imports de `@beonforge/contracts` (dist) fallaron antes del cambio: Reflect.set podía añadir estados/transiciones y reemplazar filas (3 rojos, 59 verdes).
- Corrección independiente F-4: Object.freeze sobre TASK_STATES, cada array y la tabla TASK_TRANSITIONS; sin cambiar nombres públicos, tipos ni transiciones. Tests comprueban rechazo de adición/reemplazo/borrado y conservación de isTaskState/canTransition/transitionTask. Un cuarto test comprueba tipos readonly/tuplas exactos publicados.
- Verificación final: frozen install, peers, formato, lint con tipos, typecheck, build y **62/62 tests en 3 archivos** verdes; diff/alcance y escaneo textual de secretos revisados. Sin dependencias nuevas, cambios a otros contratos, merge, publicación ni modificación de main. Entorno local igual al documentado abajo; sin nuevo run remoto.
- Cierre autorizado por el usuario al pasar gates y no quedar hallazgos bloqueantes. F-4 resuelto, M01.1 cerrado; siguiente nodo B02a-01 — Spike SQLite, no iniciado. La evidencia original de B01-02 se conserva a continuación; el commit de cierre F-4 incorpora su corrección y este registro.

## Alcance y commits M01.1

- Base de revisión: `a3e5168` (B00-01 aceptado). Final de código: `cccbb16`, rama `phase/01-execution-contracts`. `main` permanece en `e14cfdd`; sin merge ni publicación.
- `4bf3e58`: lifecycle adoptado selectivamente del PR #1, tests independientes y F-2/F-3. `e14cfdd`: evidencias B01-01. `cccbb16`: contratos mínimos y validadores B01-02. Este registro documental posterior no cambia código.
- Diff reproducible: `git diff a3e5168..cccbb16`; cambios B01-02: `git show cccbb16`. Fuente: B01-02 en `docs/execution/phases/phase-01.md`, ADR-0001/0002 y objetivo Software Factory.
- B01-02 añade `BlockManifest`, `BlockResult`, `BlockExecutionError`, `BlockExecutionEvent`, `ArtifactReference` y parsers desde unknown; centraliza la constante v1 preservando su export público. Sin SDKs, dependencia nueva, almacenamiento, runtime, DAG, agentes ni UI.

## Decisiones y fronteras a revisar

Contratos/fronteras y límites completos en `packages/contracts/README.md`. Inputs y evidencia referencian blobs mediante SHA-256/byteLength. Manifest identifica handler/version y declara efectos, sin aprobarlos. Un resultado pertenece a un intento; éxito no equivale a aprobación de tarea/merge. Incertidumbre se conserva como resultado explícito y no autoriza retry. Eventos registran inicio/fin; no son un EventStore.

Se rechazan versiones no soportadas, campos extra, shapes inválidos y valores fuera de límites. Los parsers retornan copias; readonly es tipado, no congelación runtime. No verifican hashes reales, redacción, correlación entre registros ni permisos. La aplicación/persistencia futura debe imponer estas garantías, documentadas en R-016/R-017/R-018. No hay datos persistidos que migrar.

## Evidencia M01.1

- Entorno: Node 24.13.0, pnpm 12.15.0 mediante Corepack/shim temporal limitado al PATH del proceso. Sin configuración global modificada; vault ausente, sin nueva lectura atribuida.
- Instalación frozen y peers correctos; lockfile intacto. `pnpm.cmd check` pasa formato, lint con tipos, typecheck, build y **58/58 tests en 3 archivos**. B01-02 añade 47 tests válidos/inválidos/límites; se conservan los 49 pares de lifecycle.
- F-2: consumidor sin paths hacia src, resolución a `dist/index.d.ts` verificada por test y assertions de tipos de nuevos exports. F-3: recommendedTypeChecked vigente; sondas negativa/positiva documentadas en B01-01.
- Diff/staged paths y escaneo textual de secretos sin hallazgos. No hubo fallos de gates B01-02. Sin run remoto nuevo ni demo de durabilidad; no se afirma recuperación implementada.
- Rollback: revertir commits de implementación/evidencia B01-02 en la rama de trabajo; preservar B00/B01-01 y no cambiar `main`. Siguiente: B02a-01 únicamente tras revisión y aceptación M01.1.

## Preguntas para la revisión

1. ¿Los contratos son suficientes para la vertical determinista mínima sin acoplar ejecución a persistencia/proveedores o introducir API especulativa?
2. ¿Hay una entrada JSON inválida/versionada que los parsers acepten por error, o una combinación resultado/error incoherente?
3. ¿La distinción intento/tarea, incertidumbre, aprobación y efectos está clara sin prometer garantías no implementadas?
4. ¿Se mantienen F-2/F-3 y los tests realmente consumen tipos/exports compilados? Adjuntar reproducción de cualquier hallazgo.

---

# Paquete de revisión independiente — M00.3 Foundation

Preparado: 2026-10-25. Estado: **M00.3 cerrado** tras revisión formal `APPROVE_WITH_FOLLOWUPS`, corrección F-1 y run remoto verde. No invocar Claude Code desde BeonForge. Alcance: Fase 00; este paquete no afirma que exista kernel durable.

## Objetivo y especificación

Milestone M00.3: repositorio aislado, workspace TypeScript estricto, gates reproducibles, CI inicial, ADRs, threat model y AGENTS.md. Fuente: `knowledge/AI/18 BeonForge Agentic OS/BeonForge Agentic OS MOC.md`, especialmente «Roadmap y backlog ejecutable», «Arquitectura por capas», «Seguridad y gobernanza» e «Implementación incremental sin perder funcionalidades». Plan ejecutable: `docs/execution/phases/phase-00.md`.

## Commits y diff

- Commit base de revisión: `487d5e8` (`main`, baseline documental).
- Commit final sustantivo: `dfcbb1d` (`phase/00-foundation`, corrección CI). El commit documental que actualiza este paquete queda fuera del diff sustantivo.
- Commits entre ambos, en orden: `2f6ffcd` estado baseline; `7fbbd9c` informe de preparación; `3fc9d52` workspace; `ce0baff` estado; `b4d56e4` gates locales y compatibilidad TypeScript; `c6fa8de` estado; `c0dc05f` CI; `961c19d` estado; `05b6a51` gobernanza; `b1004da` paquete inicial; `dfcbb1d` corrección F-1.
- Resumen de `git diff 487d5e8..05b6a51 --stat` revisado por Claude: 27 archivos, 1993 inserciones y 22 eliminaciones; 1619 líneas pertenecen al lockfile. El delta posterior contiene el paquete documental y un cambio de línea en CI. Código de producto: un paquete de contratos que exporta la versión de formato, sin runtime.
- Archivos modificados: `.github/workflows/ci.yml`, `.gitignore`, `.prettierignore`, `.prettierrc.json`, `AGENTS.md`, `docs/adr/README.md`, `docs/adr/0001-modular-control-plane.md`, `docs/adr/0002-evidence-before-models.md`, `docs/execution/ci.md`, `docs/execution/coverage.md`, `docs/execution/decisions.md`, `docs/execution/master-plan.md`, `docs/execution/phases/phase-00.md`, `docs/execution/preparation-report.md`, `docs/execution/risks.md`, `docs/execution/status.md`, `docs/security/threat-model.md`, `eslint.config.mjs`, `package.json`, `packages/contracts/package.json`, `packages/contracts/src/index.ts`, `packages/contracts/test/public-entry.test.ts`, `packages/contracts/tsconfig.json`, `packages/contracts/tsconfig.test.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `tsconfig.base.json`.

## Decisiones

- D-001/D-002: monolito modular TypeScript, futuros puertos de SQLite y artefactos SHA-256, sin SDKs en dominio.
- D-003/D-005: kernel determinista y un solo escritor antes de modelos y subagentes.
- D-008/D-009: Git propio; vault y configuración `.claude/` preservados fuera del índice.
- D-011 fue sustituida parcialmente por D-012: TypeScript 7.0.2 compilaba, pero `typescript-eslint` 8.72.0 declara peer `<6.1.0`; se fijó TypeScript 6.0.3 y `pnpm peers check` pasó.
- D-013: CI con permisos de lectura, Node/pnpm fijados, lockfile obligatorio y acciones por SHA.

## Verificación reproducible

Desde `C:\Users\ramen\Desktop\Programacion\BeonForge` en Windows:

1. `git rev-parse --show-toplevel` → `C:/Users/ramen/Desktop/Programacion/BeonForge`.
2. `pnpm.cmd install --frozen-lockfile` → pasó; lockfile actualizado y política de cadena de suministro aprobada por pnpm.
3. `pnpm.cmd peers check` → sin problemas.
4. `pnpm.cmd check` → format check, ESLint, typecheck de fuente y test, build y Vitest: **1 archivo, 1 test, todos pasan**.
5. `pnpm.cmd audit --audit-level high` → sin vulnerabilidades conocidas al consultar el registro el 2026-10-25.
6. PyYAML `BaseLoader` parseó `.github/workflows/ci.yml`; comprobó triggers `push`/`pull_request`, permiso `contents: read` y cuatro pasos.
7. `git -c safe.directory=C:/Users/ramen/Desktop/Programacion/BeonForge diff --check` y escaneo textual de secretos sobre archivos nuevos → sin hallazgos. Un `any` inyectado por stdin a ESLint falló con `no-explicit-any`, confirmando que el gate detecta el caso.
8. Tras `dfcbb1d` se repitieron instalación frozen, peers, `pnpm.cmd check` (1/1 test), audit, parse YAML, comprobación de SHA de 40 caracteres, diff y escaneo de secretos: todos pasaron localmente.
9. Evidencia remota verificada con GitHub CLI: [run 40202416013](https://github.com/1tsKalisey/BeonForge/actions/runs/40202416013), `completed/success`, rama `phase/00-foundation`, SHA `84d732845e20576752809c28ec6e3e3b85f6c628`. Pasaron checkout, `pnpm/setup` con el commit corregido, peers y `pnpm check`.

## Revisión preliminar de Claude Code, recibida antes del milestone

| Observación | Clasificación tras reproducción | Evidencia / acción |
|---|---|---|
| No existía `current-review-packet.md` | Confirmado, estado esperado antes de M00.3 | Se crea ahora. No era un defecto de F00-02. |
| No existía `AGENTS.md` | Confirmado, entregable planificado para F00-05 | Creado en `05b6a51`. |
| `status.md` indicaba revisión no solicitada | Confirmado, correcto entonces | Estado actualizado; revisión formal sigue pendiente. |
| El plan pedía paquete y pausa tras M00.3 | Confirmado | Este paquete activa la pausa; no se inicia Fase 01. |
| Rama de fase, cinco commits y árbol limpio | Confirmado para la fecha de esa revisión | El historial creció con F00-03–05; el árbol se comprobó limpio antes de este paquete. |
| Typecheck, diff y status pasaban | Confirmado | Repetidos junto con gates completos. |
| No encontró defectos de código | Sin defecto reproducible | No se creó un commit de corrección de esa revisión. |
| P3: versiones no contrastadas | Sugerencia de verificación | Instalación confirmó versiones reales. Al integrar lint apareció un peer incompatible con TypeScript 7; se resolvió en F00-03 (`b4d56e4`). |
| P3: aún faltaban tests, lint y formato | Confirmado, trabajo planificado | Incorporados y verificados en F00-03. |

La revisión preliminar no emitió veredicto ni pidió cambios. No se atribuye a Claude la incompatibilidad descubierta durante F00-03. Por tanto no existe un hallazgo suyo confirmado que requiera un commit correctivo separado; los cambios de F00-03, F00-04 y F00-05 tienen commits independientes por tarea.

## Revisión formal de Claude Code — APPROVE_WITH_FOLLOWUPS

| Hallazgo | Clasificación propia | Reproducción y tratamiento |
|---|---|---|
| F-1 P2: `pnpm/setup@b1e47f6f...` era tag object, no commit | **Confirmado**; problema del pin CI, ejecución remota no comprobable localmente | `git ls-remote` devolvió `b1e47f6f...` para `refs/tags/v3` y `fa36a5ef7dcdefc3a7cb25655c122e00cf6e636e` para `refs/tags/v3^{}` y `v3.1.2^{}`. Corregido sólo en `.github/workflows/ci.yml` por `dfcbb1d`, comentario `# v3.1.2`. El primer run remoto sigue pendiente. |
| F-2 P3: test pequeño y `paths` apunta a `src` en typecheck | **Confirmado como límite, no defecto de Fase 00** | `tsc --traceResolution` resolvió a `src/index.ts`; `import.meta.resolve` desde el paquete resolvió a `dist/index.js`. El smoke test cubre export/runtime, no paridad de tipos publicados. Añadir typecheck contra `dist/index.d.ts` cuando haya contratos reales en Fase 01. |
| F-3 P3: ESLint recomendado sin reglas con tipos y sólo `.ts`/`.mjs` | **Confirmado como mejora diferida** | `eslint.config.mjs` usa `tseslint.configs.recommended`; `no-floating-promises` no aparece en `--print-config`. Antes de introducir kernel asíncrono, evaluar `recommendedTypeChecked` y ampliar globs si aparecen `.js`/`.cjs`. |

No hubo hallazgos bloqueantes ni defectos de código o alcance adicionales. F-1 tiene commit correctivo separado; F-2/F-3 permanecen explícitos como seguimiento de Fase 01.

## Gates no ejecutados, riesgos y límites

- El run remoto requerido fue observado verde. Con autorización posterior, `main` avanzó por `--ff-only` hasta `629059e`, se publicó sin force y pasó a ser la rama predeterminada. `phase/00-foundation` permanece publicada. El run de `main` [40202841059](https://github.com/1tsKalisey/BeonForge/actions/runs/40202841059) terminó `success` sobre `629059e269db32121758be3258a3f4cad205b108`.
- No hay demo de kernel, EventStore, ArtifactStore, CLI ni recuperación; pertenecen a Fase 01. El test actual comprueba el entrypoint compilado del paquete de contratos, no comportamiento de orquestación.
- El threat model documenta controles futuros, no policy enforcement actual. `knowledge/` no está versionado: una copia del repo necesita la especificación por separado.
- El sandbox de Windows requiere `safe.directory` por comando y permiso adicional para escribir `.git`/store pnpm; no se cambió configuración global.
- Deuda explícita: validar primer run remoto cuando haya un repositorio conectado; F-2 y F-3 al introducir contratos y kernel asíncrono; convertir mitigaciones del threat model en tests/política al abrir las fronteras correspondientes. No hay retirada funcional ni migración de datos en esta fase.

## Preguntas concretas para el reviewer

1. ¿El workflow fijado por SHA instala Node/pnpm desde el manifest y exige realmente el lockfile congelado en la versión citada de `pnpm/setup`? Señalar línea y reproducción si no.
2. ¿Alguna configuración de ESLint, TypeScript o Vitest permite que código fuente o tests queden fuera de los gates de forma accidental?
3. ¿AGENTS.md, ADRs y threat model contradicen el plan, atribuyen controles no implementados o dejan una amenaza crítica sin seguimiento?
4. ¿Hay archivos fuera de alcance, secretos o cambios al vault entre `487d5e8` y `05b6a51`? Adjuntar ruta y evidencia.
5. Respondida: F-1 corregido y run remoto verde observado. M00.3 puede cerrarse y queda cerrado en este paquete.
