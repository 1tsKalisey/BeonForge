# Diagnóstico B04-01c.1 — MXC y fronteras de seguridad
Fecha 2026-11-03. Diagnóstico local acotado conforme a la autorización del propietario.
Sin agentes, sin credenciales, sin inferencias, sin modificaciones funcionales.

---

## 1. Diagnóstico reproducible del bloqueo MXC

### Entorno verificado

| Hecho | Valor observado |
|---|---|
| SO | Windows 11 Pro, Build 26200 (25H2), UBR 9711 |
| Codex CLI | 0.166.0 (npm `@openai/codex-win32-x64`) |
| Sandbox activo en config | `[windows] sandbox = "elevated"` |
| Feature `prefer_mxc` | `under development / false` |
| Feature `windows_sandbox_service` | `under development / false` |
| Feature `elevated_windows_sandbox` | `removed / false` |
| Feature `experimental_windows_sandbox` | `removed / false` |

### Prueba oficial del sandbox `elevated` (autorizada por la tarea)

```
$ codex sandbox echo MXC_OK
windows sandbox failed: runner failed during SpawnChild:
CreateProcessAsUserW failed: 2 (ERROR_FILE_NOT_FOUND)
creation_flags=134743040 | si_flags=256 | cmd=echo MXC_OK
```

**Interpretación:**
- Este sandbox es el modo `elevated` (token restringido de Windows), **no MXC**.
- El error 2 (`ERROR_FILE_NOT_FOUND`) significa que `echo` es un built-in de shell, no un ejecutable con ruta. `CreateProcessAsUserW` necesita un binario real.
- Este resultado **no prueba incompatibilidad de MXC**; prueba que el sandbox `elevated` existe pero falla al invocar shell built-ins.
- Para reproducir correctamente: `codex sandbox cmd /c echo MXC_OK` usaría `cmd.exe` real. No probado porque requeriría activar el sandbox, lo que está fuera del alcance aprobado.

### Razón raíz del bloqueo MXC

1. **`prefer_mxc` = `under development / false`**: el routing a MXC no está activo. No es un parámetro estable ni configurable sin cambiar flags en desarrollo.
2. **Infraestructura confirmada no disponible (c.1b)**: el binario Codex emitió `native MXC is unavailable on this executor` directamente, independientemente de flags. Esto indica que las primitivas de Windows Container Infrastructure que MXC requiere (Server Silos o equivalente) no están activas en este equipo.
3. **Features Windows Container**: `Get-WindowsOptionalFeature` requiere elevación para leer el estado de `Containers`, `Hyper-V` y `VirtualMachinePlatform`. El estado efectivo de estas features no fue verificado en este diagnóstico (fuera del alcance autorizado sin admin).
4. **No existe `windows.allow_mxc`** en la configuración ni en las features listadas. No hay un flag de usuario que active MXC.

**Conclusión:** La disponibilidad de MXC no puede resolverse cambiando la configuración de usuario. Requiere o bien un cambio en la versión de Codex (que promueva `prefer_mxc` a stable) o bien la activación de features de Windows a nivel de administrador del sistema.

---

## 2. Capacidades verificadas frente a las no demostradas

### A — Control del árbol de procesos mediante Job Objects

| Estado | Hallazgo |
|---|---|
| PASS (sintético) | Job `KILL_ON_JOB_CLOSE` termina hijos normales ≤500 ms (c.1b) |
| PASS (sintético) | Cinco terminaciones forzadas verificadas (c.1b) |
| PASS (sintético) | Jobs anidados y muerte del launcher sintético (c.1b) |
| **BLOCKED** | **Supervivencia del launcher ante muerte del controlador real**: si el proceso Node.js de BeonForge se cuelga o muere antes de cerrar el handle del Job, la limpieza depende de que el OS recoja el handle. No hay watchdog ni handle en proceso separado demostrado. |
| **BLOCKED** | **Ejecutables auxiliares y DLL sin verificación completa**: `codex-command-runner.exe`, `codex-code-mode-host.exe` y helpers accedidos por el launcher no tienen pins de hash verificados en el flujo de producción. |

### B — Sandbox de comandos (MXC / token restringido)

| Estado | Hallazgo |
|---|---|
| **BLOCKED** | **MXC no arranca**: `native MXC is unavailable` (c.1b); `prefer_mxc` = under development |
| Existente pero no probado | `elevated` sandbox (token restringido) existe en este equipo; falla para built-ins de shell |
| **BLOCKED** | Compatibilidad MXC / Job Object combinados no demostrada |

### C — Permisos FS/red y credenciales del proceso anfitrión Codex

| Estado | Hallazgo |
|---|---|
| **BLOCKED** | El proceso Codex hereda las credenciales, FS y red del usuario BeonForge. Job Object no aísla FS ni red ni creación vía servicios/brokers externos. |
| **BLOCKED** | Confinamiento integral del anfitrión no demostrado. `readyForAgent: false` permanece. |

---

## 3. Corrección mínima propuesta por bloqueo

| Bloqueo | Corrección mínima |
|---|---|
| MXC no disponible | Esperar que `prefer_mxc` pase a `stable` en versión Codex posterior; OR evaluar WSL2 (ver §5). No instalar features de SO sin autorización del propietario. |
| Launcher sin watchdog | Antes de c.3: implementar un proceso guardián separado que mantenga el Job handle y cierre el Job si el controlador desaparece. Fuera del alcance actual; registrar como requisito previo a c.3. |
| Auxiliares sin pins | Antes de c.3: extender el modelo de pins de c.1b a los ejecutables auxiliares de Codex que participen en el flujo de ejecución. |
| Host no confinado | Antes de c.3: documentar como riesgo R-nuevo con severidad conocida; el lanzamiento real de agente requiere sandbox SO (MXC o WSL2). |
| `elevated` sandbox / built-ins | Diagnóstico: no bloquea c.3 directamente. Si se usa este sandbox, pasar `cmd.exe /c <cmd>` en lugar de built-ins de shell. |

---

## 4. Seguimiento F2 del adaptador — `missing_done`

### Confirmación en el código

El parser `jsonl-parser.ts:108–183` rastrea `doneSeen` pero **no exige `done` al final del stream**. No existe comprobación post-bucle equivalente a:

```ts
if (!doneSeen) throw new ParseError('missing_done');
```

**Caso que pasa actualmente sin error y no debería:**

```
{"schemaVersion":1,"type":"started"}\n
{"schemaVersion":1,"type":"message","role":"assistant","content":"ok"}\n
```

Este input satisface el requisito de `\n` final (`truncated_output` no se lanza), contiene `started`, y el parser devuelve 2 eventos con `status: succeeded` sin ninguna objeción.

### Por qué no afecta al adaptador sintético actual

`generateEvents()` (`adapter.ts:176–212`) siempre incluye `done` en los modos `success` y `force_uncertain`. Los modos de error `truncated`, `malformed_json` y `unknown_event` fallan antes de llegar a un stream terminado sin `done`. Los tests actuales **nunca ejercen** el camino "stream válido sin `done`".

### Corrección requerida (obligatoria antes de bytes externos)

**En `jsonl-parser.ts`**, añadir tras el bucle `for (const line of lines)`:

```ts
if (!doneSeen) throw new ParseError('missing_done');
```

**Test requerido (nuevo):**

```ts
it('parser: rejects valid sequence without done event', () => {
  const s = JSON.stringify({ schemaVersion: 1, type: 'started' });
  const m = JSON.stringify({
    schemaVersion: 1, type: 'message', role: 'assistant', content: 'ok',
  });
  const bytes = Buffer.from(`${s}\n${m}\n`);
  expect(() => parseCodexJsonl(bytes)).toThrow(ParseError);
  try { parseCodexJsonl(bytes); } catch (e) {
    expect((e as ParseError).code).toBe('missing_done');
  }
});
```

Este test y la corrección deben gates-pass antes de procesar cualquier byte externo (salida real de `codex exec --json`).

### Nota sobre el protocolo oficial

El formato JSONL sintético de BeonForge (`started/message/proposal/done`, `schemaVersion: 1`) **no equivale** al formato oficial completo de `codex exec --json`. Antes de c.3, el output real de `codex exec --json` de la versión fijada debe contrastarse contra el parser para verificar compatibilidad. No asumir equivalencia.

---

## 5. Recomendación: sandbox nativo (MXC) vs WSL2

### MXC (sandbox nativo)

**A favor:** integración nativa con Codex CLI Windows; sin capa adicional; alineado con la dirección de desarrollo de Codex.

**En contra:**
- `prefer_mxc` es `under development / false`; no hay ETA para `stable`.
- La infraestructura de Windows Container subyacente no estaba disponible en c.1b.
- No hay corrección de usuario; requiere actualización de Codex o configuración de admin de SO.
- El tiempo de desbloqueo es externo (OpenAI / Windows).

### WSL2 como alternativa

**A favor:**
- Aislamiento real de proceso/FS/red por instancia de distro.
- `codex exec` dentro de WSL2 usa el kernel Linux con namespaces/bwrap nativos.
- Estado de la feature WSL2 es verificable y activable.
- Independiente de las features de contenedores de Windows que bloquean MXC.

**En contra:**
- Requiere WSL2 instalado y una distro Linux.
- Codex CLI debe ejecutarse dentro de WSL2 (no el binario win32).
- Introduce traducción de rutas Windows↔Linux.
- BeonForge kernel (Node.js en Windows) necesita spawnear un proceso WSL2: añade complejidad de IPC.

### Recomendación

**Evaluar WSL2 como ruta primaria para c.3.** El bloqueo MXC es estructural (infraestructura SO no disponible + feature en desarrollo), sin fecha de resolución conocida. WSL2 ofrece un modelo de aislamiento verificable y activable en este equipo. La decisión final requiere autorización del propietario antes de cualquier implementación.

---

## Requisitos restantes para c.3 (resumen)

1. **F2 / `missing_done`**: corrección en `jsonl-parser.ts` + test nuevo → gates pass. **Obligatorio.**
2. **Decisión del propietario**: MXC (esperar versión Codex) vs WSL2 (activación y configuración). **Bloqueante.**
3. **Contraste del formato real**: `codex exec --json` de la versión fijada vs parser. **Obligatorio.**
4. **`attemptId: '1'`**: `inspectSimulatedCodexRun` asume `attemptId: '1'`; habilitar reintentos exige revisar. **Registrar como prerequisito.**
5. **Watchdog de Job**: proceso guardián separado para el Job handle antes de lanzamiento real. **Obligatorio para `readyForAgent: true`.**
6. **Pins de auxiliares**: extender verificación de hashes a ejecutables auxiliares de Codex en el flujo real.

---

*Redactado por Claude Code a solicitud directa del propietario. Sin agentes ejecutados, sin credenciales, sin inferencias, sin cambios funcionales.*
