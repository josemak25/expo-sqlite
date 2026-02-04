import EventEmitter from 'eventemitter3';
import type { Adapter, Job } from './types';
import { Worker } from './worker';

/**
 * Handles the execution of a single job.
 * Manages lifecycle events (start, success, failure) and persistence updates.
 */
export class JobExecutor {
  constructor(private adapter: Adapter, private emitter: EventEmitter) {}

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
      job.attempts++;
      job.active = false;
      job.failed = new Date().toISOString();
      job.metaData = {
        ...job.metaData,
        lastError: (error as Error).message,
      };

      // Check if max attempts reached
      if (job.attempts >= job.maxAttempts) {
        this.emitter.emit('failed', job, error);

        // Move to DLQ if adapter supports it
        if (this.adapter.moveToDLQ) {
          await this.adapter.moveToDLQ(job);
        }

        if (worker.options.onFailed) {
          worker.options.onFailed(job, error as Error);
        }
      } else {
        // Just a retry failure, not final
        this.emitter.emit('failure', job, error);
      }

      await this.adapter.updateJob(job);
    }
  }
}
