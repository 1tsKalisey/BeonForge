import { Component, computed, OnDestroy, OnInit, signal } from '@angular/core';
import {
  Api,
  ApiError,
  type Executor,
  type ExecutorId,
  type Task,
} from './api';
import {
  STATE_LABEL,
  canReview,
  canRun,
  isActive,
  panels,
  reviewBody,
  reviewLabel,
  runBody,
  shortHash,
} from './view';

@Component({
  selector: 'bf-root',
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit, OnDestroy {
  readonly #api = new Api();
  #timer: ReturnType<typeof setTimeout> | null = null;

  protected readonly executors = signal<Executor[]>([]);
  protected readonly tasks = signal<Task[]>([]);
  protected readonly busy = signal<string | null>(null);
  protected readonly selectedId = signal<string | null>(null);
  protected readonly chosen = signal<ExecutorId>('synthetic-bugfix');
  protected readonly error = signal<string | null>(null);
  protected readonly pending = signal(false);
  protected readonly selected = computed(
    () => this.tasks().find((t) => t.id === this.selectedId()) ?? null,
  );

  protected readonly label = STATE_LABEL;
  protected readonly panels = panels;
  protected readonly canRun = canRun;
  protected readonly canReview = canReview;
  protected readonly reviewLabel = reviewLabel;
  protected readonly short = shortHash;

  ngOnInit(): void {
    void this.#load();
  }

  async #load(): Promise<void> {
    try {
      this.executors.set((await this.#api.executors()).executors);
    } catch (error) {
      this.#fail(error);
    }
    await this.refresh();
  }

  ngOnDestroy(): void {
    if (this.#timer !== null) clearTimeout(this.#timer);
  }

  protected executorLabel(id: ExecutorId): string {
    return this.executors().find((e) => e.id === id)?.label ?? id;
  }

  protected select(id: string): void {
    this.selectedId.set(id);
  }

  protected choose(value: string): void {
    const match = this.executors().find((e) => e.id === value);
    if (match) this.chosen.set(match.id);
  }

  async refresh(): Promise<void> {
    if (this.#timer !== null) clearTimeout(this.#timer);
    this.#timer = null;
    try {
      const data = await this.#api.tasks();
      this.tasks.set(data.tasks);
      this.busy.set(data.busy);
      if (this.selectedId() === null && data.tasks[0])
        this.selectedId.set(data.tasks[0].id);
    } catch (error) {
      this.#fail(error);
    }
    // Poll only while the server reports work in progress.
    if (isActive(this.tasks(), this.busy()))
      this.#timer = setTimeout(() => void this.refresh(), 750);
  }

  protected async create(): Promise<void> {
    await this.#act(async () => {
      const task = await this.#api.create(this.chosen());
      this.selectedId.set(task.id);
    });
  }

  protected async run(task: Task): Promise<void> {
    await this.#act(() => this.#api.run(task.id, runBody(task)));
  }

  protected async review(
    task: Task,
    decision: 'approve' | 'discard',
  ): Promise<void> {
    await this.#act(() =>
      this.#api.review(task.id, reviewBody(task, decision)),
    );
  }

  async #act(fn: () => Promise<unknown>): Promise<void> {
    this.pending.set(true);
    this.error.set(null);
    try {
      await fn();
    } catch (error) {
      this.#fail(error);
    } finally {
      this.pending.set(false);
      await this.refresh();
    }
  }

  #fail(error: unknown): void {
    this.error.set(
      error instanceof ApiError
        ? `${error.status} ${error.message}`
        : 'Error de comunicación con la API local',
    );
  }
}
