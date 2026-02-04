import type {
  Adapter,
  JobOptions,
  QueueEvents,
  QueueOptions,
  WorkerOptions,
} from './types';
import { MemoryAdapter } from './adapters/memory';
import EventEmitter from 'eventemitter3';
import { JobRegistry } from './registry';
import { JobExecutor } from './executor';
import { JobProcessor } from './processor';
import { createJob } from './utils/helpers';

/**
 * The main Queue class responsible for managing jobs and workers.
 * Extends EventEmitter to provide lifecycle events (start, success, failure).
 */
export class Queue extends EventEmitter<QueueEvents> {
  private adapter: Adapter;
  private registry: JobRegistry;
  private executor: JobExecutor;
  private processor: JobProcessor;
  private isStarting: boolean = false;

  /**
   * Creates a new Queue instance.
   * @param adapter - The storage adapter to use. Defaults to MemoryAdapter (non-persistent).
   * @param options - Configuration options for the queue.
   */
  constructor(adapter?: Adapter, options: QueueOptions = {}) {
    super();
    this.adapter = adapter || new MemoryAdapter();
    this.registry = new JobRegistry();
    this.executor = new JobExecutor({
      adapter: this.adapter,
      emitter: this,
    });

    this.processor = new JobProcessor({
      adapter: this.adapter,
      registry: this.registry,
      executor: this.executor,
      concurrency: options.concurrency || 1,
      monitorNetwork: !!options.monitorNetwork,
    });
  }

  /**
   * Registers a worker function to handle a specific job name.
   */
  addWorker<T = unknown>(
    name: string,
    workerFn: (id: string, payload: T) => Promise<void>,
    options: WorkerOptions<T> = {}
  ) {
    this.registry.addWorker({
      name,
      workerFn,
      options,
    });
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
    options: JobOptions = {}
  ): Promise<string> {
    const autoStart = options.autoStart !== false;
    const job = createJob(name, payload, options);

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
    if ((this.processor as any).status === 'active') return;

    this.isStarting = true;

    // Recover ghost jobs on startup
    await this.adapter.recover?.();

    // Check if we were stopped during recovery
    if (!this.isStarting) return;

    await this.processor.start();
  }

  /**
   * Stops processing the queue.
   */
  stop() {
    this.isStarting = false;
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
