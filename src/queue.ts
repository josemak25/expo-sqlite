import type { Adapter, Job, QueueOptions, WorkerOptions } from './types';
import { Worker } from './worker';
import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'eventemitter3';

/**
 * The main Queue class responsible for managing jobs and workers.
 * Extends EventEmitter to provide lifecycle events (start, success, failure).
 */
export class Queue extends EventEmitter {
  private adapter: Adapter;
  private concurrency: number;
  private workers: { [name: string]: Worker<unknown> } = {};
  private status: 'active' | 'inactive' = 'inactive';
  private runningJobs: number = 0;

  /**
   * Creates a new Queue instance.
   * @param adapter - The storage adapter to use for persisting jobs.
   * @param options - Configuration options for the queue.
   */
  constructor(adapter: Adapter, options: QueueOptions = {}) {
    super();
    this.adapter = adapter;
    this.concurrency = options.concurrency || 1;
  }

  /**
   * Initializes the queue. Must be called before adding jobs or starting processing.
   * This delegates initialization to the storage adapter (e.g., creating tables).
   */
  async init() {
    await this.adapter.init();
  }

  /**
   * Registers a worker function to handle a specific job name.
   * @template T - The type of the job payload this worker expects.
   * @param name - The name of the job associated with this worker.
   * @param workerFn - The async function to execute when processing the job.
   * @param options - Options for the worker (concurrency, callbacks).
   */
  addWorker<T = unknown>(
    name: string,
    workerFn: (id: string, payload: T) => Promise<void>,
    options: WorkerOptions<T> = {}
  ) {
    // Cast to unknown to store in the generic workers map
    this.workers[name] = new Worker(name, workerFn, options) as Worker<unknown>;
  }

  /**
   * Removes a registered worker.
   * @param name - The name of the job/worker to remove.
   */
  removeWorker(name: string) {
    delete this.workers[name];
  }

  /**
   * Adds a new job to the queue.
   * @template T - The type of the job payload.
   * @param name - The name of the job. Must match a registered worker to be processed.
   * @param payload - The data required for the job.
   * @param options - Job-specific options (priority, timeout, metadata).
   * @returns The UUID of the created job.
   */
  async addJob<T = unknown>(
    name: string,
    payload: T = {} as T,
    options: {
      priority?: number;
      timeout?: number;
      metaData?: Record<string, unknown>;
    } = {}
  ): Promise<string> {
    const job: Job<T> = {
      id: uuidv4(),
      name,
      payload,
      metaData: options.metaData || {},
      priority: options.priority || 0,
      attempts: 0,
      active: false,
      timeout: options.timeout || 25000,
      created: new Date().toISOString(),
    };

    await this.adapter.addJob(job);
    this.start(); // Auto-start
    return job.id;
  }

  /**
   * Starts processing the queue.
   * If already active, this method does nothing.
   */
  async start() {
    if (this.status === 'active') return;
    this.status = 'active';
    this.process();
  }

  /**
   * Stops processing the queue.
   * The queue will finish currently running jobs but will not pick up new ones.
   */
  stop() {
    this.status = 'inactive';
  }

  /**
   * Internal method to process the next batch of jobs.
   * Respects concurrency limits and status.
   */
  private async process() {
    if (this.status === 'inactive') return;

    // Check global concurrency
    if (this.runningJobs >= this.concurrency) return;

    // Fetch next batch of jobs
    // We only fetch what we can process
    // We only fetch what we can process
    const jobs = await this.adapter.getConcurrentJobs();

    if (jobs.length === 0) {
      if (this.runningJobs === 0) {
        this.status = 'inactive';
      }
      // If no jobs found, stop recursively calling process until new jobs are added via addJob or start is called again
      return;
    }

    jobs.forEach(async (job) => {
      // Re-check concurrency before starting each job in the batch
      if (this.runningJobs >= this.concurrency) return;

      const worker = this.workers[job.name];
      if (!worker) {
        // No worker found for this job, mark failed? or skip?
        // For now, let's mark failed
        job.failed = new Date().toISOString();
        await this.adapter.updateJob(job); // Mark failed in DB
        return;
      }

      this.runningJobs++;
      job.active = true;
      await this.adapter.updateJob(job); // Mark active in DB

      this.emit('start', job);

      try {
        await worker.execute(job);
        await this.adapter.removeJob(job); // Remove on success
        this.emit('success', job);
      } catch (error) {
        job.attempts++;
        job.active = false;
        // Simple retry logic check (can be enhanced)
        // Check if max attempts reached?
        // For now, let's assume infinite retries logic or better:
        // Let's default max retries to 3 if not specified?
        // We will improve retry logic later.

        // Log failure
        job.metaData = {
          ...job.metaData,
          lastError: (error as Error).message,
        };
        await this.adapter.updateJob(job);
        this.emit('failure', job, error);
      } finally {
        this.runningJobs--;
        this.process(); // Trigger next processing cycle
      }
    });
  }
}
