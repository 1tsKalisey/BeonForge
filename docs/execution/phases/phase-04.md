# Fase 04 — Primera vertical de bugfix

## Cierre autorizado de M04.1 y Fase04 — 2026-11-02

Propietario aprueba expresamente **M04.1 APPROVE_WITH_FOLLOWUPS** y cierre global04 conforme al gate original: «Workflow sobre fixture: reproducir, test rojo, cambio, gates, revisión y rollback». Acepta residuales/P3 como seguimientos, no su resolución. Cierre técnico verificado por los gates finales indicados abajo; no se redefine ningún criterio.

Auditoría suministrada:30/30 tests específicos ejecutados independientemente,40 reproducciones (incluidas dos inicialmente inválidas repetidas correctamente),36 hashes de evidencias y8 hashes de fuentes contrastados.673/673 globales acreditados mediante logs; **no se atribuye a Claude la ejecución de la suite completa**. Commits fed1763 y8f921c0. Sin hallazgos bloqueantes comunicados. No repetición de auditoría, agentes, inferencias ni acceso a otros proyectos.

| Criterio vigente | Estado auditado | Evidencia concreta |
|---|---|---|
| 1. Dependencias01–03 | Cumplido | Cierres aceptados en status/phase-01/02/03;03 registrado7f84b21. No dependencia de harness05 para parche fijo. |
| 2. D-043 | Cumplido | fixture.ts contiene4 archivos sintéticos propios; prepareBugfixDemo crea nuevo Git local sin remotos. bugfix.test.ts: preparación deniega padre ocupado/relativo/enlazado, no descubre otros proyectos. |
| 3. Proyecto/worktree autorizado | Cumplido | prepareBugfixDemo usa registro/creación B03; commit064a5101625739a80344d54c14d6719bbb57c152 en demo, detached/receipt confirmado,12 pins/permisos. Tests de fuera de raíz/sustitución/enlaces/configuración. |
| 4. Contexto reproducible | Cumplido | ContextPackage/Envelope4 archivos; referencias/OID y mapa verificados por inspect en proceso separado. Test CLI de recuperación del mismo contexto/evidencia. |
| 5. Test rojo | Cumplido | Test fijo synthetic-add-2-plus-2 falla por ERR_ASSERTION, exit1/un fallo; no se acepta fallo de infraestructura como rojo. Handler red y caso integrado M041. |
| 6. Corrección limitada | Cumplido | Preview SHA ligado a intención/commit/pre-post; sólo src/add.ts: return a-b → return a+b, grants propios vivos. Tests de manipulación/revocación/dispatch preexistente. |
| 7. Test verde | Cumplido | Mismo test intacto exit0/un pass, handler green; caso integrado verifica postimagen autorizada. |
| 8. Evidencia/diff persistidos | Cumplido en alcance | CAS3495d39461b7d9821038035f38bad8501c99139ca8b380144e06b1df69a47327/865bytes, diff exacto de un archivo, SQL/checkpoints/segundo proceso. P3-2: no prueba autocontenida ni refs de salidas en el resumen final. |
| 9. Recuperación conservadora | Cumplido | Test pérdida de finish SQL tras escritura real y SIGKILL tras dispatch; segundo proceso blocked/pending, sin repetir/limpiar/reescribir. P3-1/P3-3 limitan recuperación operativa, no se promete reparación. |
| 10. Revisión pendiente, no integración | Cumplido | run/inspect devuelven review pending/integration not_performed; tests de approve sólo registran dato del caller, nunca merge/push. Marker se contrasta con SQL/CAS. Sin identidad humana autenticada. |
| 11. Descarte/origen intacto | Cumplido | Test discard explícito ligado a evidencia y postimagen: inverso autorizado → bytes originales → rojo esperado/diff vacío; inventarios de original/HEAD/índice/config/sentinelas intactos. Sólo fixtures distintos, no decisión real sobre demo manual. |

Gates finales nuevos de este cierre: **673/673 tests**, sin fallos ni skips = contratos62 + persistencia115 + workspace187 + runtime101 (incluidos30 M04.1) + Ollama201 + spike7. Node24.19.0 estable en Program Files y pnpm12.15.0. `pnpm.cmd install --frozen-lockfile`=0, `pnpm.cmd peers check`=0 y `pnpm.cmd check`=0; check incluye formato/lint/typecheck/build/tests. Duración1268,39s (workspace662,33s; runtime546,70s), medición del gate, no SLA. Fuente/dependencias intactas, dist recompilado por el gate. R-061 no reproducida, causa desconocida/no resuelta. Diff/escaneo heurístico de secretos y formato final documentales registrados con exit0. Logs completos stdout/stderr/exits/tiempos/entorno y SHA-256: `%TEMP%/beonforge-phase04-close-57e4785b9d0a4a7292165714d74ecb01/`. Advertencias LF/CRLF y cambios HEAD de fixtures son salidas de tests sintéticos, no cambios al checkout del producto. **M04.1 y Fase04 CERRADOS / ACEPTADOS (CLOSED / ACCEPTED)** tras autorización expresa y gates; Fase05 sólo preparada, NO INICIADA.

Los30 casos nuevos están en packages/runtime/test/bugfix.test.ts; funciones/CLI en examples/bugfix, contratos aceptados intactos. Detalles y hashes históricos de la demo se conservan abajo. El cierre de fase acepta la capacidad de revisión pendiente/descarte, no integra el parche de la demo ni autentica al humano.

### Seguimientos aceptados, no corregidos

- **P3-1:** fallos previos a efectos pueden clasificarse uncertain y bloquear permanentemente; distinguir predispatch conocido de incertidumbre real en futura ampliación. No reintentar por asumir que no hubo efecto.
- **P3-2:** redExit/greenExit finales sin referencias CAS explícitas a salidas de tests; evidencia depende del kernel/SQLite. Fortalecer trazabilidad antes de usarla como prueba independiente.
- **P3-3:** corte entre review.json y workflow puede dejar pending sin recuperación operativa; pending no equivale a revisión humana todavía completable. No reinterpretar marcador como confirmación, borrar o repetir automáticamente.

R-067 y R-057/061/065/066 siguen abiertos/aceptados para este alcance, sin sandbox SO/red, power loss, exactly-once/liderazgo multiproceso ni autenticación humana. Condiciones más amplias requieren controles/autorizaciones posteriores. Siguiente: sólo preparación [Fase05/B04-01](phase-05.md), NO INICIADA; D-043 obligatoria. Rollback de este cierre por commit inverso documental, sin alterar datos/evidencias ni código aceptado.

---

## Histórico anterior al cierre de Fase04

## Entrega vigente — M04.1 implementado, abierto para revisión

2026-11-02. Código **fed1763**, comparar `git diff b39e98b..fed1763`. **Fase04 ABIERTA**, nodo implementado localmente y pendiente de aceptación independiente; no cierre automático ni inicio05. Plan inferior conservado como histórico de preparación/criterios aprobados, no posición actual. D-043 continúa obligatoria: el repositorio sintético ya se creó sólo después de autorizar M04.1, sin otros proyectos como objetivos.

API/CLI acotadas bajo packages/runtime/examples/bugfix: prepare crea proyecto/commit/worktree/contexto en nuevo padre privado vacío autorizado; run ejecuta DAG red→patch→green→evidence; inspect reabre SQLite/CAS y distingue historia/checkout/revisión; review registra decisión explícita o descarta sólo el parche conocido. TS ejecutado por Node24 aprobado/typechecked con tests; kernel/workspace/persistencia/contratos se consumen desde dist actual. No nuevos exports del kernel, tablas/schemas de dominio, SDK o ejecutor genérico. Sólo enlace dev workspace/4 líneas de lockfile y script demo separado de CLI existente.

| Criterio | Evidencia funcional y aceptación local |
|---|---|
| Entorno D-043 | Fixture propio de4 archivos, git init nuevo/local/sin remotos; padre vacío/canónico privado explícito. Ningún proyecto existente copiado, descubierto o inspeccionado como objetivo; BeonForge sólo es código del producto/gates. |
| Workspace/contexto | APIs B03 existentes: commit completo exacto, worktree detached confirmed/clean inicial, ContextPackage y Envelope de selección fija con binding OID/hashes/mapa. 12 pins de directorios, identidad Git/source/destino y autorización revalidados. |
| Rojo verificable | Un test Node fijo de add(2,2): salida1, una prueba fallida y ERR_ASSERTION/nombre esperado. Código de test y package/source exactos, no scripts arbitrarios ni fallo de infraestructura aceptado como rojo. Resumen real en CAS del bloque red. |
| Corrección/verde/diff | src/add.ts cambia sólo return a-b por return a+b, ligado a raíz/intención/commit/hashes pre/post. File handle verificado, nlink1, write corto rechazado, flush/fsync; test idéntico pasa exit0. Diff Git seguro de un archivo comparado contra patch exacto; origen/index/config/HEAD del fixture original inventariados sin cambios de run/review. |
| Revisión | Run devuelve succeeded **con review:pending**, no aprobación/integración. Grant propio canReview y SHA de evidencia, canDiscard adicional, marker exclusivo durable y receipt SQL/CAS coherentes. Approve registra entrada explícita del caller; no autentica identidad humana ni hace merge/commit/push. |
| Descarte | Sólo fixture nuevo de cada test, decisión sintética explícita: inverso exacto AFTER→BEFORE, rojo esperado y diff tracked vacío/current clean. Origen intacto y evidencia histórica verde conservada. Postimagen editada/permiso/hash incorrectos no se sobrescriben. Demo manual real sigue pendiente, no se aprobó/descartó por esos tests. |
| Recuperación | Start durable antes de efecto, dispatch patch wx/fsync; reapertura reutiliza resultados confirmados sin nuevos eventos. Fault de finish SQL tras escritura real deja pending, SIGKILL tras dispatch bloquea en otro proceso; conserva bytes/marker, no reintento/limpieza. Partial bytes detectados no se reparan. |
| Frontera segura | Grants heredados/getters/revocación, permisos/root/hash erróneos; src/test/HEAD alterados, extras ignored/untracked, enlaces/junction/hardlink, config Git hostil y variables Node/Git maliciosas rechazados. Node FS permission/test isolation none, env mínimo, sin shell; timeout10s/64KiB por stream y60s/bloque cooperativo. No sandbox SO/red. |
| Marcadores/storage | Review pendiente/truncado nunca implica aprobación; contradicción con receipt confirmado se rechaza (regresión rojo/verde). Sólo prepare inicializa: DB ausente en sesión existente no se recrea (rojo/verde). Errores estáticos sin stdout/stderr/cause privados; exit1 diagnóstico no prueba ausencia de efectos. |

### Demo observable y límites

CLI sobre root sintético nuevo: base commit `064a5101625739a80344d54c14d6719bbb57c152`, ContextPackage4 archivos/mapa verificados, run exit0/completed red,patch,green,evidence. Evidencia CAS `3495d39461b7d9821038035f38bad8501c99139ca8b380144e06b1df69a47327`/865bytes; segundo proceso inspect exit0, confirmed histórico/current modified, redExit1/greenExit0, review pending, integration not_performed. Root localizable por puntero privado `%TEMP%/beonforge-m041-demo-parent.txt`; logs de inspect dentro de su evidence/. Ninguna inferencia o aprobación humana nueva.

```diff
-  return a - b;
+  return a + b;
```

La revisión/descarte funcionales se prueban con decisiones explícitas sintéticas y repos nuevos; no se presenta eso como aceptación humana real. No agente simulado ni evaluación de programación de Ollama. Worktree/Node permission no garantizan confinamiento de SO/red, herramientas y ancestros/caller deben ser confiables/privados/exclusivos. Cortes no son power loss ni exactly-once, CAS no autentica dueño y markers/SQL/FS no son transacción. R-067 y anteriores vigentes; Fase05 y entornos reales requieren sus controles/autorizaciones, D-043 intacta.

### Gates finales y trazabilidad

**673/673** =643 anteriores+30 nuevas (62 contratos+115 persistencia+187 workspace+101 runtime+201 Ollama+7 spike), sin fallos/skips en suite final. Node24.19.0 estable/pnpm12.15.0; frozen/peers/check final exit nativo0, formato/lint/typecheck/build/tests/diff/secretos verdes. Check1310,32s/workspace658,83s/runtime589,49s; tiempo de gates, no SLA del bugfix. El enlace dev hace que pnpm pruebe runtime después de workspace. Primera pasada672 también verde antes del último caso de storage; final prueba los30 con fuente actual estabilizada antes de colectar runtime. Lint/typecheck/build globales repetidos tras finalizar tests; formato documental final separado, sin otro cambio funcional.

Logs stdout/stderr/exits/entorno/regresiones/hashes: `%TEMP%/beonforge-m041-ecbccd3dc5ef4f8cafdd420b176a5e38/`. Autoría: 8.3 TEMP corregido en autorización de tests sin relajar canonical; primer focal20/21 por edición concurrente de esquema de pins entre runner/hijo, resuelto antes de suite estable. Red/green internos review1/1 y storage1/1; cancelación de review antes de intent cubierta. Diagnóstico stdin con --input-type no compatible con worker sustituido por CLI de archivo, sin cambiar kernel; helper de espera de rerun expiró sin matar pruebas, check real final completo. Ningún fallo atribuido a R-061 ni marcado resuelto.

Siguiente paso exclusivo: paquete de revisión independiente M04.1 por propietario. No otro nodo/harness/proveedor ni cierre global04. Rollback del producto: commit inverso acotado de demo/tests, conservar datos/evidencias; sin borrado o reparación automática de raíces.

---

## Histórico — plan aprobado antes de implementar M04.1

Estado: **PREPARADA / NO INICIADA**. Sólo planificación documental autorizada; ninguna ejecución de esta vertical. Dependencia Fases01–03 satisfecha por cierres aceptados, incluido D-042/643 tests y gates finales de03. Fuente normativa: master-plan, fila04, **«Workflow sobre fixture: reproducir, test rojo, cambio, gates, revisión y rollback»**. No se altera ese criterio ni se adelanta la fila05.

Actualización operativa: propietario autoriza implementar exclusivamente M04.1. Archivos: examples/bugfix y tests/README/package scripts/tsconfig.test de runtime, enlace workspace de desarrollo y documentos de ejecución. Ningún cambio al kernel/contratos aceptados. Demo TypeScript ejecutada con Node24 aprobado y typechecked junto a tests; CLI fija sin módulos/comandos arbitrarios. Preparación sobre padre privado vacío explícito; revisión pendiente por defecto, approve/discard sólo con decisión y grants propios ligados a raíz/hash de evidencia. Gates completos/643 anteriores y nuevas integraciones; rollback acotado de commits de demo conservando evidencias, sin borrar datos reales. No05 ni cierre automático04; siguiente gate revisión independiente. El texto de preparación inferior es el plan aprobado, no evidencia de ejecución.

## Primer y único nodo propuesto — M04.1

**M04.1 — Vertical bugfix determinista sobre fixture autorizado.** El plan no asignaba un identificador de tarea a04; se reutiliza el patrón de milestone M01.1/M01.2/M01.3 como nodo mínimo, sin inventar un bloque de producto ni reasignar B04 (harness, Fase05). Preparado para implementación posterior expresamente solicitada, no iniciado por este documento.

### D-043 — Repositorio sintético necesario, todavía no creado

**Sí es necesario crear un nuevo repositorio de pruebas** para demostrar Git/worktrees y un cambio real sin usar proyectos existentes. Se creará sólo cuando se autorice implementar/ejecutar M04.1. Los archivos bajo examples serán plantillas sintéticas propias; no se clona, copia, inspecciona o reutiliza ningún otro proyecto y no se convierte BeonForge en objetivo del agente. Los gates del producto siguen siendo mantenimiento de BeonForge, separados de la evaluación del proyecto objetivo.

Estructura mínima prevista, toda dentro de una raíz privada de pruebas explícitamente autorizada (marcador documental, no ruta creada ni autorización automática de todo TEMP):

```text
<AUTHORIZED_TEST_ROOT>/<run-id>/
  project/                 # git init local nuevo, sin remotos
    .git/                  # metadata común autorizada separadamente
    .gitignore
    package.json           # fixture mínimo, sin dependencias ni scripts arbitrarios
    src/add.ts             # suma con bug sintético conocido
    test/add.test.mjs       # regresión sintética conocida
  worktrees/fix/           # nuevo, nunca un checkout existente
  storage/                 # SQLite y CAS privados, fuera del worktree
  evidence/                # reportes/diff saneados
  process/                 # HOME/TEMP de procesos de prueba cuando corresponda
```

Criterios de aislamiento para la futura demo:

- Autorizar y registrar rutas canónicas exactas/identidades de raíz, project, .git/common-dir, destino, storage/evidence y ubicaciones auxiliares. Comprobar parentesco físico antes de crear/escribir/ejecutar, revalidar en cada operación sensible; rechazar symlinks, junctions, aliases Windows ambiguos, sustituciones y escapes por rutas/configuración Git. Fallar cerrado sin tocar ubicaciones ajenas.
- Sólo git init local y commits del fixture sintético; sin clone/fetch/push, remotos, submódulos, hooks, includes/filtros ejecutables, gestores de paquetes o descubrimiento de proyectos. Sin acceso a otros checkouts ni código/datos copiados. Mantener separado el repo original del fixture de su worktree de ejecución.
- Procesos fijos confiables, argv sin shell, entorno mínimo sin credenciales ni variables de inyección, cwd/HOME/TEMP autorizados, límites de tiempo/salida y ausencia de peticiones de red/servicios externos. Ninguna base real, token, cuenta de proveedor o repositorio remoto. Cualquier excepción posterior exige decisión expresa, no se deriva de un plan de integración.
- La raíz y el entorno de proceso **no son un sandbox del SO**: Node puede acceder a recursos del usuario si se ejecuta código arbitrario. Por eso04 se limita al fixture y handler propios conocidos; no ejecutar agentes/código no confiable si no se puede demostrar el confinamiento requerido. Documentar el límite como dependencia, nunca garantizar aislamiento por worktree/cwd/HOME.
- Tests de aceptación futuros: sentinelas sintéticos fuera de cada subraíz concedida, denegaciones de escapes/enlaces/identidad/configuración, cero acceso/efecto fuera de la raíz permitida y cero solicitudes externas para las operaciones ensayadas. No usar otro proyecto para demostrar esas denegaciones. Estas pruebas observan casos concretos; no prueban sandbox universal.
- Éxito no habilita proyectos reales automáticamente. Antes de cualquier entorno real: nueva decisión expresa del propietario, evaluación de seguridad y autorización concreta de proyecto/operaciones. D-043 se mantiene en05 y demos posteriores; no crear una plataforma de gestión de entornos.

### Objetivo y demostración

Una tarea pública concreta corrige una suma defectuosa en un fixture TypeScript mínimo. Flujo observable: tarea → proyecto Git temporal registrado → worktree detached confirmado → selección tracked explícita/ContextPackage e instrucciones/ContextEnvelope → test rojo inequívoco → cambio determinista autorizado → test verde → diff/evidencias CAS → revisión humana → rollback inverso autorizado y verificado en el fixture.

La intervención es un handler confiable que aplica una corrección fija y revisable; **no simula un agente**, no genera código mediante Ollama y no demuestra capacidad de programación del modelo. La revisión puede permanecer pendiente hasta recibir decisión humana; el éxito técnico no equivale a aprobación/merge. El rollback se demuestra en el entorno temporal con autorización explícita, no como limpieza automática de un fallo.

### Entradas y salidas mínimas

- Entradas: fixture público versionado (package.json, .gitignore regular, src/add.ts, test/add.test.mjs), commit exacto; descripción del bug y test de regresión; raíces privadas autorizadas de proyecto/Git/común/ejecución/storage; grants vivos de workspace/contexto; runId y referencias CAS; autorización limitada del cambio fijo y del proceso de tests. No secretos, scripts de proyecto arbitrarios o repositorios reales ajenos.
- Salidas: ContextPackage/Envelope existentes, eventos/checkpoints del workflow y RunReport; artefactos de test rojo/verde, diff limitado y resumen JSON v1 de evidencia (runId, commit, referencias de intención/receipt/contexto, archivo y hashes anterior/posterior, comandos/exit codes, revisión pendiente/decisión humana si se aporta). Ninguna referencia concede permiso. No nuevo schema de dominio ni sistema de aprobaciones general.
- Evidencia de rollback: decisión explícita, preimagen del parche inverso verificada, bytes originales restaurados sólo en el archivo autorizado, resultado esperado del test nuevamente rojo y diff tracked vacío respecto al commit base. No git reset/clean/force ni borrado automático de worktrees.

### Reutilización y componentes previstos

| Disponible | Uso en M04.1 / límite |
|---|---|
| Fase01: executeWorkflow, Workflow/BlockManifest/BlockHandler/BlockResult, EventStore/ArtifactStore/checkpoints | DAG secuencial y evidencias reales, reabrir/reconocer resultados confirmados. Pending/uncertain bloquean; no reconstruir kernel/reconciliador. |
| Fase02: registerProject/inspectProject, prepareWorktree/createWorktree/inspectWorktree | Identidades/permisos y checkout nuevo aislado. Conservar receipt histórico y comprobar estado actual en cada paso sensible. |
| Fase02: build/readContextPackage y build/readContextEnvelope | Selección pública explícita desde commit clean, permisos propios de lectura/publicación, OID y CAS verificados. Contexto histórico no autoriza checkout vivo ni envío. |
| Fase03: probe/inferencia sintética/registry aceptados | Prerrequisito satisfecho; no se invocan ni conceden capacidad de código. La vertical no necesita otro modelo, inferencia ni acceso a Ollama. |
| Fase05: harness Codex/OpenCode, perfiles/contract tests | Reservado. La tarea con intervención de un agente externo aún no es ejecutable; requiere05 y autorizaciones/controles propios. |

Archivos previstos para la futura implementación: demo y fixture bajo `packages/runtime/examples/bugfix/`, tests de integración bajo `packages/runtime/test/` y documentación de la demo. Conectar las APIs existentes desde la demo/handlers del fixture; no importar proveedores al dominio ni workspace al núcleo genérico del runtime. Sólo enlaces workspace de desarrollo si los necesitan los ejemplos/tests, sin dependencias externas nuevas. No ampliar la CLI general para aceptar módulos o comandos arbitrarios. Formatos Workflow/BlockManifest/BlockResult existentes; resumen de evidencia local a la demo, sin catálogo, framework de patches ni nuevas APIs generales.

### Secuencia y límites de seguridad

1. Crear fixture Git público en temporal controlado; autorizar raíces exactas y comprobar commit/identidades. Preparar intención y crear worktree por B03, sin modificar checkout/índice/config original; se esperan sólo metadatos administrativos de Git compartidos.
2. Con worktree históricamente confirmado y actualmente clean, preparar contexto/envelope de archivos tracked seleccionados; conservar referencias. Coincidencia exacta de rutas/case/OID, raíces y permisos; no leer untracked/ignored, symlinks, junctions ni rutas privadas. Respetar límites existentes de contexto y árbol.
3. Ejecutar exclusivamente el test fijo del fixture mediante process.execPath con argv separados, sin shell ni npm scripts/hooks/filtros. Cwd y binario confiables, entorno mínimo sin credenciales, timeout/cancelación y salidas acotadas/saneadas. Debe fallar por la aserción esperada de suma, no por error de importación, sintaxis, timeout u otro fallo de infraestructura.
4. Autorizar handler externo concreto mediante los contratos existentes y una allowlist local del fixture; **RunOptions.external no es un sandbox ni permiso general de herramienta**. Revalidar identidad/rutas/estado y hash de preimagen; aplicar una única corrección fija a src/add.ts. Registrar el inicio durable antes del efecto; ante resultado incierto, bloquear sin retry ni rollback automático. No crear un motor genérico de edición.
5. Revalidar identidad y la postimagen exacta autorizada antes de tests/diff. El checkout puede estar modified por el único cambio esperado: eso no borra confirmación histórica ni concede nuevas operaciones. Drift HEAD/identidad, cambios inesperados u operación incierta bloquean. Test de regresión conservado sin editar; verde sólo si el proceso termina correctamente y la aserción original pasa.
6. Presentar diff de un único archivo y referencias/test reports para revisión humana, sin commits/merge/push. Rechazo/ensayo de rollback requiere decisión expresa sobre ese archivo temporal y coincidencia de postimagen; verificar parche inverso sin tocar archivos ajenos. Si hay drift o incertidumbre, sólo informar y detener.

Los worktrees **no aíslan procesos/red/credenciales**. Esta primera vertical sólo ejecuta código público de fixture controlado por BeonForge y procesos Node fijos; repositorios/tests no confiables, gestores de paquetes, ejecución de herramientas arbitrarias y egress requieren una frontera posterior antes de habilitarse. No afirmar sandbox ni hacer extensible ese permiso por datos del repo, contexto, registry o resultados del modelo.

### Aceptación y tests mínimos verificables

- Integración real temporal: registro → worktree → contexto/envelope → rojo por aserción concreta → parche conocido → verde → diff exacto y resumen verificable en CAS. Reapertura/segundo proceso recupera reportes y mismos artefactos; el original permanece intacto salvo metadatos comunes autorizados.
- Denegaciones sin efecto: grants ausentes/revocados, fuera de raíz/case incorrecto/symlink o identidad sustituida, worktree incierto/drift y preimagen diferente; no mutar archivo ni iniciar proceso. No se considera clean evidencia de ausencia de untracked/ignored.
- Fallos reales: test no reproducible o infraestructura rota impiden parche; timeout/cancelación/exit inesperado impiden declarar verde. Salidas limitadas y errores tipados sin valores privados; no procesos/red/inferencias/descargas inesperados.
- Corte entre efecto y confirmación: reabrir y constatar pending/uncertain bloqueado sin reejecutar cambio; reinicio tras resultado confirmado no repite el handler. Reutilizar protocolo existente, sin prometer atomicidad CAS/SQLite/filesystem o exactly-once.
- Revisión/rollback: resultado técnico no aprueba cambios; sin decisión no hay integración ni reversión. Inverso explícito en fixture confirmado restaura bytes/diff base y rojo esperado; postimagen alterada impide sobrescribir. Nada de limpieza destructiva automática.
- Gates completos oficiales Node24.19.0/pnpm12.15.0, suite anterior intacta más integraciones de vertical, diff/secretos y paquete de revisión independiente. Caso limpio reproducible, no sólo interfaces/mocks.

### Dependencias, bloqueos y rollback del nodo

Fases01–03 cerradas y autorización posterior para implementar la demo son los prerrequisitos. No existe dependencia técnica de05 para el cambio fijo del fixture. Bloqueantes reales en una ejecución futura: identidad/grants no verificables, falta de autorización del efecto/test/rollback, test rojo no reproducible, efectos inciertos o gate fallido. R-049/055/056/057/061/065/066 siguen aceptados dentro de su alcance; ninguno concede permisos operativos. R-061 pasa a bloqueo si se reproduce un fallo de gate.

Para ampliar a un agente real: Fase05 deberá aportar adaptador oficial, permisos de herramientas/proceso/red, autenticación compatible, control de efectos, cancelación y recuperación sin retry unknown, más autorización explícita de datos/destino. D-036 no autoriza envío de ContextPackage. No bloquear la demo determinista por exigir anticipadamente esos harness, ni afirmar que ya existen.

Rollback de implementación: commit inverso acotado de demo/tests, conservar evidencias y datos de usuario; no reset, eliminación o sobrescritura automática. Siguiente capacidad demostrable: un bugfix real pequeño con rojo/verde, contexto y diff inspeccionables, revisión/rollback humanos; siguiente gate tras implementarlo será su revisión independiente. No se crean otros nodos ni se inicia04 en este cierre documental.
