import EventEmitter from 'eventemitter3';
import type { Adapter, Job, JobExecutorOptions } from './types';
import { Worker } from './worker';
import { prepareJobFailure } from './utils/helpers';

/**
 * Handles the execution of a single job.
 * Manages lifecycle events (start, success, failure) and persistence updates.
 */
export class JobExecutor {
  private adapter: Adapter;
  private emitter: EventEmitter;

  constructor(options: JobExecutorOptions) {
    this.adapter = options.adapter;
    this.emitter = options.emitter;
  }

  /**
   * Executes a job using the provided worker.
   * @param job - The job to execute.
   * @param worker - The worker that handles this job type.
   */
  async execute<T>(job: Job<T>, worker: Worker<T>): Promise<void> {
    job.active = true;
    job.failed = null;
    await this.adapter.updateJob(job);

    this.emitter.emit('start', job);

    try {
      await worker.execute(job);
      await this.adapter.removeJob(job);
      this.emitter.emit('success', job);
    } catch (error) {
      // Use helper to prepare job state after failure
      const updatedJob = prepareJobFailure(job, error as Error);

      // Sync back properties to the object we have (or update local reference)
      Object.assign(job, updatedJob);

      // Check if max attempts reached
      if (job.attempts >= job.maxAttempts) {
        this.emitter.emit('failed', job, error as Error);

        // Move to DLQ if adapter supports it
        if (this.adapter.moveToDLQ) {
          await this.adapter.moveToDLQ(job);
        }

        if (worker.options.onFailed) {
          worker.options.onFailed(job, error as Error);
        }
      } else {
        // Just a retry failure, not final
        this.emitter.emit('failure', job, error as Error);
      }

      await this.adapter.updateJob(job);
    }
  }
}
