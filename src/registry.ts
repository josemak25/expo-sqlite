import { Worker } from './worker';
import type { RegisterWorkerOptions } from './types';

/**
 * Registry to manage worker implementations.
 */
export class JobRegistry {
  private workers: { [name: string]: Worker<unknown> } = {};

  /**
   * Registers a worker function to handle a specific job name.
   */
  addWorker<T = unknown>(params: RegisterWorkerOptions<T>) {
    const { name, workerFn, options = {} } = params;
    this.workers[name] = new Worker(name, workerFn, options) as Worker<unknown>;
  }

  /**
   * Removes a registered worker.
   */
  removeWorker(name: string) {
    delete this.workers[name];
  }

  /**
   * Retrieves a worker by name.
   */
  getWorker(name: string): Worker<unknown> | undefined {
    return this.workers[name];
  }

  /**
   * Checks if a worker exists.
   */
  hasWorker(name: string): boolean {
    return !!this.workers[name];
  }
}
