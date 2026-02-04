import type { Adapter, Job, QueueOptions, WorkerOptions } from './types';
import { Worker } from './worker';
import { MemoryAdapter } from './adapters/memory';
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
   * @param adapter - The storage adapter to use. Defaults to MemoryAdapter (non-persistent).
   * @param options - Configuration options for the queue.
   */
  constructor(adapter?: Adapter, options: QueueOptions = {}) {
    super();
    this.adapter = adapter || new MemoryAdapter();
    this.concurrency = options.concurrency || 1;
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
      attempts?: number;
      retries?: number;
      timeInterval?: number;
      ttl?: number;
      onlineOnly?: boolean;
      autoStart?: boolean;
      metaData?: Record<string, unknown>;
    } = {}
  ): Promise<string> {
    const autoStart = options.autoStart !== false;
    const job: Job<T> = {
      id: uuidv4(),
      name,
      payload,
      metaData: options.metaData || {},
      priority: options.priority || 0,
      attempts: 0,
      maxAttempts:
        options.attempts || (options.retries ? options.retries + 1 : 1),
      timeInterval: options.timeInterval || 0,
      ttl: options.ttl || 1000 * 60 * 60 * 24 * 7, // Default 7 days
      onlineOnly: options.onlineOnly,
      active: false,
      timeout: options.timeout || 25000,
      created: new Date().toISOString(),
    };

    await this.adapter.addJob(job);
    if (autoStart) {
      this.start();
    }
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
    const jobs = await this.adapter.getConcurrentJobs();

    if (jobs.length === 0) {
      if (this.runningJobs === 0) {
        this.status = 'inactive';
      }
      return;
    }

    let jobsStartedThisBatch = 0;
    let hasSkippedBackoff = false;
    let nextBackoffDelay = Infinity;

    for (const job of jobs) {
      if (this.runningJobs >= this.concurrency) break;

      // 1. Check TTL (Hard Expiry)
      if (job.ttl > 0) {
        const created = new Date(job.created).getTime();
        const now = Date.now();
        if (now - created > job.ttl) {
          await this.adapter.removeJob(job);
          continue;
        }
      }

      // 2. Check TimeInterval (Backoff)
      if (job.failed && job.attempts < job.maxAttempts) {
        const lastFailed = new Date(job.failed).getTime();
        const now = Date.now();
        const elapsed = now - lastFailed;
        if (elapsed < job.timeInterval) {
          hasSkippedBackoff = true;
          nextBackoffDelay = Math.min(
            nextBackoffDelay,
            job.timeInterval - elapsed
          );
          continue;
        }
      }

      // 3. Network Check (Per-Job)
      if (job.onlineOnly === true) {
        let isConnected = true;
        try {
          const NetInfo = require('@react-native-community/netinfo');
          const networkState = await NetInfo.fetch();
          isConnected = networkState.isConnected !== false;
        } catch {
          console.warn(
            `expo-queue: Job "${job.name}" requires network but @react-native-community/netinfo is not installed.`
          );
          isConnected = false;
        }

        if (!isConnected) {
          continue;
        }
      }

      // 4. Max Attempts Check
      if (job.attempts >= job.maxAttempts) {
        continue;
      }

      const worker = this.workers[job.name];
      if (!worker) {
        job.failed = new Date().toISOString();
        await this.adapter.updateJob(job);
        continue;
      }

      // Start the job execution
      jobsStartedThisBatch++;
      this.executeJob(job, worker);
    }

    // Handle backoff wakeup
    if (
      jobsStartedThisBatch === 0 &&
      this.runningJobs === 0 &&
      hasSkippedBackoff
    ) {
      // Wake up after the shortest backoff delay
      setTimeout(() => this.process(), nextBackoffDelay + 10);
      // Keep state active so we can trigger again
      this.status = 'active';
    } else if (
      jobsStartedThisBatch === 0 &&
      this.runningJobs === 0 &&
      !hasSkippedBackoff
    ) {
      this.status = 'inactive';
    }
  }

  /**
   * Executes a single job.
   */
  private async executeJob(job: Job<any>, worker: Worker<any>) {
    this.runningJobs++;
    job.active = true;
    job.failed = null;
    await this.adapter.updateJob(job);

    this.emit('start', job);

    try {
      await worker.execute(job);
      await this.adapter.removeJob(job);
      this.emit('success', job);
    } catch (error) {
      job.attempts++;
      job.active = false;
      job.failed = new Date().toISOString();
      job.metaData = {
        ...job.metaData,
        lastError: (error as Error).message,
      };

      if (job.attempts >= job.maxAttempts) {
        this.emit('failure', job, error);
        if (worker.options.onFailed) {
          worker.options.onFailed(job, error as Error);
        }
      } else {
        this.emit('failure', job, error);
      }

      await this.adapter.updateJob(job);
    } finally {
      this.runningJobs--;
      this.process();
    }
  }
}
