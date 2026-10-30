# Ollama: authorized local metadata probe

Use the approved Node.js 24.19.0 runtime and the repository pnpm gates.

`probeOllama({ endpoint, allowLocalProbe: true, timeoutMs?, signal? })` performs
only two sequential, bodyless GETs: `/api/version` and `/api/tags`. The permission
must be an explicit own data property and is checked before each request and
before returning. No endpoint discovery, retries, inference, model lifecycle,
filesystem, CAS, credentials or context integration exists in this module.

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

Phase 03 remains open. Before any model consumption: authorize/classify payload
and destination, define policy/evals/limits and cancellation. D-036 does not
implement transforming redaction or authorize export; prior workspace/CAS privacy
and authenticity limits remain. B05-02 and agents are not implemented here.
