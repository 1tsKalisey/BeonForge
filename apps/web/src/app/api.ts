// Client view of the B06-01 API (/api/v1). Mirrors
// packages/runtime/examples/api/tasks.ts; drift is caught by the e2e flow.
// The client never sends executable, path, command or provider fields.

export type ExecutorId = 'synthetic-bugfix' | 'codex-simulated';
export interface Executor {
  readonly id: ExecutorId;
  readonly label: string;
  readonly simulated: true;
  readonly evidence: readonly ('tests' | 'diff' | 'proposal')[];
  readonly review: boolean;
}
export type TaskState =
  | 'prepared'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'blocked'
  | 'invalid';
export interface TestEvidence {
  readonly phase: 'red' | 'green';
  readonly assertion: string;
  readonly exitCode: number;
  readonly command: string;
  readonly evidenceSha256: string;
}
export interface ProposalEvidence {
  readonly baseCommit: string;
  readonly path: string;
  readonly preimageSha256: string;
  readonly contentSha256: string;
  readonly matchesKnownPostimage: boolean;
  readonly evidenceSha256: string;
}
export type Review =
  | { readonly status: 'not_available' }
  | { readonly status: 'pending' }
  | {
      readonly status: 'confirmed' | 'uncertain' | 'unconfirmed';
      readonly decision: 'approve' | 'discard';
    };
export interface Task {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly executor: ExecutorId;
  readonly simulated: true;
  readonly createdAt: string;
  readonly state: TaskState;
  readonly preview: {
    readonly baseCommit: string;
    readonly path: string;
    readonly beforeSha256: string;
    readonly afterSha256: string;
    readonly patchSha256: string;
  } | null;
  readonly steps: readonly {
    readonly blockId: string;
    readonly status: string;
  }[];
  readonly tests: readonly TestEvidence[];
  readonly diff: {
    readonly text: string;
    readonly evidenceSha256: string;
  } | null;
  readonly proposal: ProposalEvidence | null;
  readonly review: Review;
  readonly integration: 'not_performed';
  readonly lastError: string | null;
}

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, code: string) {
    super(code);
    this.status = status;
  }
}

/** Same-origin fetch client. The session token is anti-CSRF, not a login. */
export class Api {
  #token: string | null = null;
  readonly #fetch: typeof fetch;

  constructor(fetcher: typeof fetch = (...args) => fetch(...args)) {
    this.#fetch = fetcher;
  }

  async #request<T>(method: 'GET' | 'POST', path: string, body?: unknown) {
    if (this.#token === null) {
      const session = await this.#fetch('/api/v1/session');
      const data = (await session.json()) as { token?: unknown };
      if (!session.ok || typeof data.token !== 'string')
        throw new ApiError(session.status, 'session_unavailable');
      this.#token = data.token;
    }
    const headers: Record<string, string> = {
      'X-BeonForge-Token': this.#token,
    };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await this.#fetch(`/api/v1${path}`, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const data = (await response.json()) as unknown;
    if (response.status === 401) this.#token = null;
    if (!response.ok) {
      const error =
        data && typeof data === 'object' && 'error' in data
          ? String(data.error)
          : 'request_failed';
      throw new ApiError(response.status, error);
    }
    return data as T;
  }

  executors() {
    return this.#request<{ executors: Executor[] }>('GET', '/executors');
  }
  tasks() {
    return this.#request<{ busy: string | null; tasks: Task[] }>(
      'GET',
      '/tasks',
    );
  }
  create(executor: ExecutorId) {
    return this.#request<Task>('POST', '/tasks', {
      schemaVersion: 1,
      executor,
    });
  }
  run(id: string, body: object) {
    return this.#request<Task>(
      'POST',
      `/tasks/${encodeURIComponent(id)}/run`,
      body,
    );
  }
  review(id: string, body: object) {
    return this.#request<Task>(
      'POST',
      `/tasks/${encodeURIComponent(id)}/review`,
      body,
    );
  }
}
