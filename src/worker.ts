import type { Job, WorkerOptions } from './types';

/**
 * Worker class responsible for executing jobs.
 * @template T - The type of the job payload.
 */
export class Worker<T = unknown> {
  /** Name of the worker, essentially the job name it handles. */
  name: string;
  /** The function to execute for the job. */
  workerFn: (id: string, payload: T) => Promise<void>;
  /** Options for the worker. */
  options: WorkerOptions<T>;
  /** Whether the worker is currently executing a job. */
  isBusy: boolean = false;

  /**
   * Creates a new Worker instance.
   * @param name - The name of the job this worker handles.
   * @param workerFn - The async function to execute.
   * @param options - Worker options (concurrency, callbacks).
   */
  constructor(
    name: string,
    workerFn: (id: string, payload: T) => Promise<void>,
    options: WorkerOptions<T> = {}
  ) {
    this.name = name;
    this.workerFn = workerFn;
    this.options = options;
  }

  /**
   * Executes a job using the worker function.
   * Handles lifecycle callbacks (onStart, onSuccess, onFailure, onComplete).
   * @param job - The job to execute.
   */
  async execute(job: Job<T>): Promise<void> {
    this.isBusy = true;

    try {
      if (this.options.onStart) {
        this.options.onStart(job);
      }

      await this.workerFn(job.id, job.payload);

      if (this.options.onSuccess) {
        this.options.onSuccess(job, null);
      }
    } catch (error) {
      if (this.options.onFailure) {
        this.options.onFailure(job, error as Error);
      }
      throw error;
    } finally {
      if (this.options.onComplete) {
        this.options.onComplete(job);
      }
      this.isBusy = false;
    }
  }
}
