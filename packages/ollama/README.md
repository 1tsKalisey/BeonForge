# Ollama: authorized local metadata probe

Use the approved Node.js 24.19.0 runtime and the repository pnpm gates.

`probeOllama({ endpoint, allowLocalProbe: true, timeoutMs?, signal? })` performs
only two sequential, bodyless GETs: `/api/version` and `/api/tags`. The permission
must be an explicit own data property and is checked before each request and
before returning. No endpoint discovery, retries, inference, model lifecycle,
filesystem, CAS, credentials or context integration exists in this probe.

Official contracts: [list models](https://docs.ollama.com/api/tags) and
[version](https://github.com/ollama/ollama/blob/main/docs/api.md#version).
Only `version` and each model's `name` are retained; additional upstream metadata
is ignored. The v1 report returns `available` or `available_no_models`. Availability
does not establish model capability, service authenticity or permission to infer.
No report is automatically persisted. Model names are untrusted display data.

## CLI

After building, an **explicitly authorized** invocation is:

```powershell
pnpm.cmd --filter @beonforge/ollama cli probe --endpoint http://127.0.0.1:11434 --allow-local-probe --timeout-ms 3000
```

Only literal `http://127.0.0.1:PORT` and `http://[::1]:PORT` are allowed. A port
is mandatory, decimal without leading zeroes, 1–65535. No trailing slash, DNS,
userinfo, query, fragment, HTTPS, IPv4 aliases or IPv4-mapped IPv6. Authorization
is limited to this exact endpoint's metadata. Any nonempty `HTTP_PROXY`,
`HTTPS_PROXY`, `ALL_PROXY` or lowercase equivalent causes rejection, even with
`NO_PROXY=*`; this is intentionally conservative. An explicit private native HTTP
agent with empty proxy configuration additionally avoids global/environment proxy
use. Redirects are rejected without following their Location. OS-level forwarding,
interception or an untrusted process listening locally are outside this control;
loopback is not authentication or a process sandbox.

Deadline covers both requests and their bodies (default 3000 ms, configurable
1–30000 ms). Cancellation destroys active network resources. Maximum per response:
256 KiB body and 8 KiB headers; maximum 1024 unique model names, 256 characters
each, version 128 characters. JSON media type, identity encoding, strict UTF-8,
object shapes and required fields are checked. Unknown upstream fields are not
returned. Excessive installations fail closed rather than return partial data.

HTTP upgrades (including 101) are rejected as `probe_invalid_response` and their
socket is destroyed. Premature request/response close rejects with a typed
transport/response error; normal close after a complete response remains valid.
The deadline/cancellation listener settles the pending promise directly, even if
destroying the transport emits no event. A single settlement guard arbitrates
errors, close, upgrade and abort; error guards remain until close to absorb late
destroy events. The HTTP parser is explicitly strict despite process defaults.

`OllamaProbeError.code` distinguishes `probe_denied`, `probe_invalid_options`,
`probe_unavailable`, `probe_invalid_response`, `probe_response_too_large`,
`probe_http_error`, `probe_redirect_denied`, `probe_timeout`, `probe_cancelled`.
Diagnostics never echo server bodies, endpoints, native causes or abort reasons.
CLI emits one JSON report on stdout (exit 0), or a code on stderr (exit 1; cancelled
130). An HTTP error is distinct from an unreachable service. Mid-body disconnects
are invalid responses. Timeout is not an inference result or durable run state.

## Tests and demonstration

`pnpm.cmd --filter @beonforge/ollama build` followed by
`pnpm.cmd --filter @beonforge/ollama test` tests **compiled exports** against real
temporary loopback HTTP servers, including a separate compiled CLI process. Its
representative response is `{schemaVersion:1,status:"available",version:"0.5.1",
models:["tiny:latest"]}`; the observed requests are exactly the two metadata GETs
with no body, cookies or authorization header. No installed Ollama is contacted.

Automatic tests preload a test-only socket guard in the runner and CLI children.
Only literal loopback sockets to their allocated mock ports are allowed; port
11434 is always blocked, before DNS/connect. Negative endpoint/CLI inputs use mock
ports instead of the real service port. The proxy regression starts Node with its
proxy environment enabled, proves global proxy requests reach a mock proxy even
after env removal, then observes the probe's two direct metadata requests.

Optional real-service smoke test: only after express operator authorization,
from this package directory after building:

```powershell
node test/real-probe.mjs --authorize-real-probe http://127.0.0.1:11434
```

It is deliberately outside the automatic suite, requires that explicit switch
and endpoint, and performs metadata GETs only. Not executed for B05-01.

## B05-02: one authorized synthetic inference

Use stable Node 24.19.0 and pnpm 12.15.0 installations, outside `%TEMP%`.
`prepareSyntheticInference({endpoint, model})` is pure and returns an immutable
v1 preview: fixed public prompt for `2+2`, canonical payload string, SHA-256 of
its actual UTF-8 bytes, classification `synthetic-public-v1` and byte limits.
It rejects arbitrary prompt/context fields, nonlocal origins, ambiguous/cloud
model identifiers and manipulated previews, even if their hashes are recomputed.
Preview/hash are data and do not authorize network access or inference.

`runSyntheticInference(preview, grant, {timeoutMs?, signal?})` requires live own
data properties `canInfer:true`, `allowLocalProbe:true`, `endpoint`, `model` and
`payloadSha256` matching the preview. Missing/false/inherited/mismatched grants
deny initial traffic. Accessors/Proxy/malformed policies fail typed without
invoking getters. Permissions stay separate: metadata access never implies
inference permission. Grants are revalidated before POST and before returning.
Revocation during dispatch can prevent reporting, not undo computation.

The existing protected probe checks the exact installed name. No selection,
fallback or download is performed. One POST `/api/generate` sends **only** the
authorized bytes: fixed prompt, `stream:false`, `format:"json"`, temperature 0,
num_predict 64, num_ctx 1024. Limits are 1 KiB prompt, 4 KiB request body, 8 KiB
headers, 64 KiB response body, 4 KiB generated text; a global deadline includes
preflight and generation (default 30000 ms, range 1–120000). Same private native
agent, no proxies/DNS/redirects, strict HTTP/UTF-8 and HTTP101/close/abort handling.
The token setting is not a substitute for client limits. No retries occur.

Response requires `done:true`, exact model and a parsed inner JSON object with
only numeric `answer:4`. Extra outer Ollama metadata/thinking are bounded but
discarded. Success returns only typed metadata, hash, classification and answer;
no raw response/thinking is logged, persisted or returned. Invalid output stays
an error, never an instruction or authority. No CAS or filesystem is used.

`SyntheticInferenceError` has a static code (inference validation/authorization,
model_not_installed, invalid output, timeout/cancel or the existing probe transport
code), `requestDispatched` and `outcome`. Handed-to-transport means **possibly**
dispatched, not receipt by the server. Before POST: not_dispatched; sent without
a matching done response: unknown; matching done response: confirmed even if
output is invalid or permissions were subsequently revoked. These are in-memory
call observations, not durable checkpoints or exactly-once guarantees. Cancellation,
timeout or RST after dispatch cannot establish that server computation stopped.

CLI (only after authorization; examples are not automatically executed):

```text
node dist/cli.js infer preview --endpoint http://127.0.0.1:PORT --model INSTALLED_MODEL
node dist/cli.js infer run --endpoint http://127.0.0.1:PORT --model INSTALLED_MODEL --payload-sha256 PREVIEW_HASH --allow-local-probe --allow-inference --timeout-ms 30000
```

Preview deliberately displays the public fixed payload, without network. Run
prints only a validated report. Error JSON includes code/dispatched/outcome;
exit 2 for unknown outcomes, otherwise 130 for cancellation or 1 for failure;
success is 0. Probe command behavior is preserved.

All automatic tests use protected mocks (11434 always denied). A separate real
smoke script, **never run by the suite**, requires express operator authorization:
`node test/real-inference.mjs --authorize-real-inference --local-only-confirmed ORIGIN INSTALLED_MODEL PREVIEW_HASH`.
The operator must verify local-only server configuration, trusted local model and
no concurrent alias/retag changes first. No installed model or loopback endpoint
proves service authenticity/local execution; aliases cannot be pinned atomically
by this API. The local-only flag attests operator checks, not automated proof.
No model downloads/configuration changes, cloud calls or real smoke are included
in B05-02 implementation/gates. Deterministic output bytes are not promised; the
synthetic result is evaluated against the fixed contract.

Phase 03 remains open pending independent review. D-036 does not implement
transforming redaction or authorize export; prior workspace/CAS limits and
RST/unexpected-error/OS SIGINT/R-061 follow-ups remain. No private context,
agents, routing, dashboard or another node is implemented here.
