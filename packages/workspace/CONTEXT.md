# ContextPackage — B03-04 (CTX-MIN)

API local, sin agentes, ejecución de código del proyecto ni exportación. Requiere un `ArtifactStore` confiable (el mismo CAS durable ya existente); no añade catálogo, tablas SQL ni dependencias. Implementado localmente, pendiente de revisión independiente.

```ts
import {
  buildContextPackage,
  readContextPackage,
  type ContextPolicy,
} from '@beonforge/workspace';

// workspacePolicy e intentRef proceden del registro/worktree ya autorizado.
const policy: ContextPolicy = {
  workspace: workspacePolicy,
  allowedIntents: [intentRef],
  allowedPaths: ['.gitignore', 'package.json', 'src/app.ts'],
  canRead: true,
  canPublish: true,
};
const ref = await buildContextPackage(intentRef, ['src/app.ts'], policy, store);
const snapshot = await readContextPackage(ref, policy, store);
```

Conservar SHA-256 **y byteLength** del paquete y abrir el mismo storage privado tras reiniciar. El consumidor decide su ubicación explícita, como las APIs de worktree; la CLI existente usa `projects.sqlite` y su CAS. No se incorpora una CLI de contexto en este nodo: el plan la deja futura. La demostración ejecutable inferior usa la API compilada y otro proceso.

## Autorización, fuente e identidad

- Publicar requiere permiso de lectura y publicación CAS, intención y rutas concedidas exactamente, y `WorktreePolicy` vigente. No se deducen permisos del manifest, descriptor o receipt. Leer requiere nuevos `canRead`, `allowedIntents` y `allowedPaths` explícitos en cada llamada; no reabre ni modifica el checkout.
- Capturar exige creación históricamente `confirmed`, receipt durable, identidad vigente y `current: clean`. La metadata pública/máquina `validationScope` v1 especifica `files: tracked`, baseline commit de creación, atributos desde commit y exclusión de **untracked e ignored**. No significa checkout estéril ni aprobación para ejecutar herramientas. Git debe soportar `--attr-source`; si no, falla cerrado. En unborn se utiliza el OID del árbol vacío sin escribir objetos.
- La validación existente verifica el conjunto tracked autorizado (incluidos bytes) para comprobar clean. Sólo la selección se recopila/publica como contexto; no se enumera contenido untracked/ignored. Se enumeran únicamente nombres de los ancestros solicitados para comprobar spelling exacto en Windows; no se recorre contenido de hermanos.
- Rutas relativas ASCII conservadoras, case exacto, sin traversal, aliases Windows/ADS, symlinks/junctions ni hardlinks. Se comparan identidades físicas y metadatos antes/después de lectura limitada; se revalida worktree/HEAD/índice/permisos y archivos antes de publicar. No hay snapshot atómico frente al propietario privilegiado que modifica y restaura datos entre observaciones. Requiere raíces/ancestros privados, ACL Windows y Git/PATH confiables, como workspace.

## Bytes, formato, privacidad y límites

Manifest JSON v1 canónico, ordenado por ruta, sin rutas absolutas ni timestamps. `contentSource: working-tree-bytes`: SHA-256/byteLength describen **bytes exactos del working tree**, no el identificador del blob Git, sin conversión CRLF/LF ni redacción. Incluye lineage CAS intención/receipt/descriptor del worktree/commit, alcance, hash de grants v1, perfil de privacidad, referencias y totales. Es integridad content-addressed, no una firma/autenticación del propietario del CAS. El hash de grants registra la política de captura; nunca sustituye la autorización de lectura actual.

Corrección P2: el snapshot autorizado conserva path/OID del árbol del commit de creación y consulta `--show-object-format=storage` mediante el runner Git aislado. Cada archivo capturado se vincula a ese OID calculando hash Git de `blob <longitud>\0` + bytes con SHA-1 o SHA-256 según el formato real. Discrepancia -> `context_changed` antes de cualquier put CAS. No se usa HEAD mutable para esta comparación; se conservan todos los checks de identidad/estado/permisos. Conversión legítima de bytes incompatible con el blob se rechaza, sin normalizar ni levantar restricciones de atributos. Manifest v1 permanece igual.

Endurecimiento heurístico: prefijos sk-ant-api03-/sk-proj-/github_pat_, claves AWS y asignaciones reconocibles de tokens, incluidos campos JSON entrecomillados; nombres credentials/secrets con extensiones, .htpasswd y sufijos .env también se excluyen. No se registran valores, ni siquiera al rechazar. Se permiten documentación de prefijos incompletos y placeholders cortos; aún hay falsos positivos/negativos. La política actual se aplica al leer CAS histórico: un paquete antes admitido puede ser rechazado por privacidad. Permiso workspace revocado produce `context_denied`; fuente inválida conserva `context_source_invalid`.

Máximo **16 archivos, 16 KiB por archivo, 32 KiB total**; manifest <=32 KiB y lineage acotado. Fallo sin truncar/omitir. Texto UTF-8 válido sin NUL. Perfil conservador `conservative-text-v1` rechaza `.git*` salvo `.gitignore` regular final, `.claude`, `knowledge`, `.env*`, directorios privados/credenciales, claves/certificados y ubicaciones comunes de credenciales, incluso tracked y explícitamente concedidos. Patrones acotados de secretos en memoria rechazan toda la selección antes de CAS; **no es DLP ni detector infalible**. Revisar datos antes de cualquier exportación futura. Diagnósticos fijos sin paths/contenidos/causas privadas.

`tokenEstimate.algorithm: utf8-byte-units-v1`, `value = byteLength`, `approximate: true`, `provider: null`: estimación conservadora basada en bytes, no conteo exacto ni garantía universal de tokens/cuota. Un futuro adaptador debe recalcular con tokenizer oficial e incluir instrucciones/overhead. No SDK/modelo ni mecanismo de envío aquí.

## Publicación y lectura histórica

Validar selección completa y límites en memoria antes del primer put. Publicar blobs primero, manifest al final; cada escritura se verifica por hash/longitud y relectura CAS. Una interrupción puede dejar blobs huérfanos; no se devuelve paquete parcial ni se hace rollback/GC/retry automático. No se promete transacción distribuida filesystem/CAS/Git.

Leer verifica hash/longitud del manifest, versión, estructura canónica, rutas/límites/totales, receipt y referencias de intención/descriptor, y bytes/privacidad de cada blob. Requiere permisos nuevos. Devuelve `sourceValidation: historical-not-revalidated`: una edición posterior no invalida el snapshot; tampoco lo habilita para operar sobre un worktree con drift/modificado/incierto. Cualquier uso vivo futuro necesita revalidación independiente.

## Demostración reproducible

Pruebas de enlaces: hardlinks y junctions reales; para symlink de archivo se intenta crear uno real. Windows sin el privilegio correspondiente devuelve EPERM: en ese caso se verifica una entrada symlink real 120000 del índice Git, sin afirmar cobertura del reparse point nativo. Esa rama requiere host con permiso de symlinks; no se eleva privilegio ni se altera configuración del usuario.

Con Node 24.19.0 aprobado, ejecutar primero `pnpm.cmd build`, después:

```powershell
pnpm.cmd --filter @beonforge/workspace exec vitest run test/context.test.ts -t 'TypeScript demo'
```

Repositorio TypeScript temporal real (.gitignore/package.json/tsconfig/src), registro → worktree confirmado → selección explícita → CAS → cierre del store → proceso nuevo → mismos hashes y bytes base64. CLI worktree inspect compilada confirma el alcance tracked-only sobre ese proyecto. No se instala ni ejecuta código del fixture. La suite adicional prueba límites, privacidad, modificaciones/índice/HEAD/identidad, case, junction, concurrencia, corrupción/lineage y publicación interrumpida; todos los tests importan exports desde dist recién compilado.
