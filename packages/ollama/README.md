# Ollama: authorized local metadata probe

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
