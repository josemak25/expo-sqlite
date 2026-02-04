import type {
  Adapter,
  Job,
  QueueEvents,
  QueueOptions,
  WorkerOptions,
} from './types';
import { MemoryAdapter } from './adapters/memory';
import { v4 as uuidv4 } from 'uuid';
import EventEmitter from 'eventemitter3';
import { JobRegistry } from './registry';
import { JobExecutor } from './executor';
import { JobProcessor } from './processor';

/**
 * The main Queue class responsible for managing jobs and workers.
 * Extends EventEmitter to provide lifecycle events (start, success, failure).
 *
 * This class now acts as a Facade, delegating responsibilities to:
 * - JobRegistry: Worker management
 * - JobProcessor: Processing loop and scheduling
 * - JobExecutor: Execution details
 * - Adapter: Storage
 */
export class Queue extends EventEmitter<QueueEvents> {
  private adapter: Adapter;
  private registry: JobRegistry;
  private executor: JobExecutor;
  private processor: JobProcessor;

  /**
   * Creates a new Queue instance.
   * @param adapter - The storage adapter to use. Defaults to MemoryAdapter (non-persistent).
   * @param options - Configuration options for the queue.
   */
  constructor(adapter?: Adapter, options: QueueOptions = {}) {
    super();
    this.adapter = adapter || new MemoryAdapter();
    this.registry = new JobRegistry();
    this.executor = new JobExecutor(this.adapter, this);

    this.processor = new JobProcessor(
      this.adapter,
      this.registry,
      this.executor,
      options.concurrency || 1
    );
  }

  /**
   * Registers a worker function to handle a specific job name.
   */
  addWorker<T = unknown>(
    name: string,
    workerFn: (id: string, payload: T) => Promise<void>,
    options: WorkerOptions<T> = {}
  ) {
    this.registry.addWorker(name, workerFn, options);
  }

  /**
   * Removes a registered worker.
   */
  removeWorker(name: string) {
    this.registry.removeWorker(name);
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
   * On first start, recovers any ghost jobs (jobs stuck in active state from previous crash).
   */
  async start() {
    // Recover ghost jobs on startup
    await this.adapter.recover?.();

    this.processor.start();
  }

  /**
   * Stops processing the queue.
   */
  stop() {
    this.processor.stop();
  }

  /**
   * Pauses execution of jobs with the given name.
   */
  pauseJob(name: string) {
    this.processor.pauseJob(name);
  }

  /**
   * Resumes execution of jobs with the given name.
   */
  resumeJob(name: string) {
    this.processor.resumeJob(name);
  }
}
