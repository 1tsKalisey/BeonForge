# Paquete de revisión: B04-01c.2 — Adaptador simulado Codex

**Resultado (2026-11-03): APPROVE_WITH_FOLLOWUPS — B04-01c.2 CLOSED / ACCEPTED.** F1/F3 cerrados; F2 obligatorio antes de bytes externos; F4 informacional. Ver status.md.

Revisión requerida antes de cualquier cierre de c.2. No cerrar automáticamente.

## Alcance

B04-01c.2 implementa un adaptador estrecho para representar una futura ejecución de Codex. **El ejecutor es exclusivamente simulado en proceso**: ningún binario externo, ningún subprocess, ninguna red, ninguna credencial. D-043 intacta.

Commits en rama `phase/02-project-inspection` desde b9c61c3:

| Hash | Descripción |
|---|---|
| 5810a43 | docs(c.1b): cierre B04-01c.1b APPROVE_WITH_FOLLOWUPS; registro D-047 |
| fac980a | feat(c.2): implementación adaptador + tests |
| 3668620 | fix(c.2): errores ESLint/typecheck |
| af205c3 | fix(c.2): external blockId grant + fix test concurrent-store |

## Archivos nuevos

- `packages/runtime/examples/codex/jsonl-parser.ts` — parser JSONL estricto, fail-closed
- `packages/runtime/examples/codex/adapter.ts` — adaptador simulado con WeakMap privado
- `packages/runtime/test/codex-adapter.test.ts` — ~43 tests (parser, grant, execute, recuperación, seguridad negativa)

## Archivos modificados (documentales)

- `docs/execution/status.md`, `docs/execution/phases/phase-05.md`, `docs/execution/decisions.md`

## Gates

| Gate | Resultado |
|---|---|
| `pnpm.cmd install --frozen-lockfile` | EXIT:0 |
| `pnpm.cmd peers check` | EXIT:0 |
| `pnpm.cmd check` (format+lint+typecheck+build+test) | EXIT:0 |
| runtime 210/210 | verde |

## Restricciones verificables

El tipo/perfil `simulated` no acepta y el código lo rechaza con error explícito:

| Campo prohibido | Código de error |
|---|---|
| binary, codexBinary | adapter_real_dispatch_rejected |
| codexHome, credentials, apiKey, token | adapter_real_dispatch_rejected |
| providerConfig, provider, networkTarget, endpoint | adapter_real_dispatch_rejected |
| Campos adicionales desconocidos | adapter_invalid |
| Getters/accessors | adapter_invalid |
| Proxy | adapter_invalid |
| mode no en SIMULATION_MODES | adapter_invalid |
| path distinto de 'src/add.ts' | adapter_invalid |
| baseCommit no hex-40 | adapter_invalid |

Los tests negativos demuestran que no existe camino accidental de despacho real (`REAL_DISPATCH_FIELDS = new Set([...])` en adapter.ts).

## Riesgos abiertos (heredados de c.1b, no resueltos aquí)

- P2-1: controlador puede morir antes del launcher dejando árbol activo
- P2-2: executables no pinneados (no aplica a c.2 simulado, pero sigue en c.1)
- P3-1/P3-2: atribución MXC / handle Job dup
- R-057/061/065/066/067: riesgos vigentes de fases anteriores

## Qué requiere revisión independiente

1. **Ausencia de camino de despacho real**: confirmar que ninguna combinación de inputs puede alcanzar un subprocess o socket.
2. **Integridad del WeakMap privado**: el payload del grant no es accesible desde fuera del módulo.
3. **Parser fail-closed**: BOM, truncado, UTF-8 inválido, eventos fuera de orden, campos extra — todos rechazan con ParseError.
4. **Evidencia persistida**: la inspección lee desde EventStore sin conferir autoridad de re-despacho.
5. **Recuperación**: estado uncertain no se redespacha; segundo proceso lee la misma evidencia.
6. **Límites de concurrencia**: active=false global previene ejecución simultánea.

## Lo que este cierre NO autoriza

- c.3 (primera generación real): sigue BLOQUEADO
- Ejecución de Codex CLI como agente
- Credenciales, tráfico a proveedores, red
- Modificar main, push o merge
- Transición a entornos reales (D-043 intacta)

Siguiente acción exclusiva: revisión independiente suministrada por propietario.
