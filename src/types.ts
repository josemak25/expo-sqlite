/**
 * Represents a job in the queue.
 * @template T - The type of the job payload.
 */
export interface Job<T = unknown> {
  /** Unique identifier for the job (UUID). */
  id: string;
  /** Name of the job, used to match with a worker. */
  name: string;
  /** Data payload for the job. */
  payload: T;
  /** Arbitrary metadata for the job (e.g., attempt counts, custom flags). */
  metaData?: Record<string, unknown>;
  /** Job priority. Higher values are processed first. Default is 0. */
  priority: number;
  /** Number of times the job has been attempted. */
  attempts: number;
  /** Whether the job is currently being processed. */
  active: boolean;
  /** Maximum time in milliseconds the job is allowed to run before timing out. */
  timeout: number;
  /** ISO date string of when the job was created. */
  created: string;
  /** ISO date string of when the job failed, if applicable. */
  failed?: string | null;
  /** Name of the worker that processed this job (optional). */
  workerName?: string;
  /** Maximum number of attempts allowed for this job. Default 1. */
  maxAttempts: number;
  /** Delay in milliseconds between retry attempts. Default 0. */
  timeInterval: number;
  /** Time To Live in milliseconds. If (now - created) > ttl, job is discarded. Default 7 days. */
  ttl: number;
  /** Whether this job requires internet connectivity. If true and offline, job is skipped. */
  onlineOnly?: boolean;
}

/**
 * Options for configuring a Worker.
 * @template T - The type of the job payload.
 */
export interface WorkerOptions<T = unknown> {
  /** Number of concurrent jobs this worker can process. Default is 1. */
  concurrency?: number;
  /** Callback fired when a job starts. */
  onStart?: (job: Job<T>) => void;
  /** Callback fired when a job completes successfully. */
  onSuccess?: (job: Job<T>, result: unknown) => void;
  /** Callback fired when a job throws an error. */
  onFailure?: (job: Job<T>, error: Error) => void;
  /** Callback fired when a job has failed all retries. */
  onFailed?: (job: Job<T>, error: Error) => void;
  /** Callback fired when a job finishes (success or failure). */
  onComplete?: (job: Job<T>) => void;
}

/**
 * Options for configuring the Queue.
 */
export interface QueueOptions {
  /** Maximum number of concurrent jobs the queue can process globally. Default is 1. */
  concurrency?: number;
  /** Whether to monitor network status for onlineOnly jobs. Requires @react-native-community/netinfo. Default is false. */
  monitorNetwork?: boolean;
}

/**
 * Options for adding a job to the queue.
 */
export interface JobOptions {
  /** Job priority. Higher values are processed first. Default is 0. */
  priority?: number;
  /** Maximum time in milliseconds the job is allowed to run before timing out. Default is 25000. */
  timeout?: number;
  /** Maximum number of attempts allowed for this job. Default 1. */
  attempts?: number;
  /** Alias for attempts (maxAttempts = retries + 1). */
  retries?: number;
  /** Delay in milliseconds between retry attempts. Default 0. */
  timeInterval?: number;
  /** Time To Live in milliseconds. Default 7 days. */
  ttl?: number;
  /** Whether this job requires internet connectivity. */
  onlineOnly?: boolean;
  /** Whether the queue should start immediately after adding this job. Default is true. */
  autoStart?: boolean;
  /** Arbitrary metadata for the job. */
  metaData?: Record<string, unknown>;
}

/**
 * Events emitted by the Queue.
 * @template T - The type of the job payload.
 */
export interface QueueEvents<T = unknown> {
  /** Fired when a job execution starts. */
  start: [job: Job<T>];
  /** Fired when a job completes successfully. */
  success: [job: Job<T>, result?: unknown];
  /** Fired when a job fails (might be retried). */
  failure: [job: Job<T>, error: Error];
  /** Fired when a job has exhausted all retries. */
  failed: [job: Job<T>, error: Error];
}

/**
 * Interface for Storage Adapters.
 * Adapters are responsible for persisting jobs and retrieving them.
 */
export interface Adapter {
  /**
   * Add a new job to the storage.
   * @param job - The job to add.
   */

  addJob<T = unknown>(job: Job<T>): Promise<void>;

  /**
   * Retrieve a batch of jobs to process concurrently.
   */
  getConcurrentJobs(limit?: number): Promise<Job<unknown>[]>;

  /**
   * Update an existing job in the storage.
   * @param job - The job with updated properties.
   */
  updateJob<T = unknown>(job: Job<T>): Promise<void>;

  /**
   * Remove a job from the storage (usually upon success).
   * @param job - The job to remove.
   */
  removeJob<T = unknown>(job: Job<T>): Promise<void>;

  /**
   * Retrieve a specific job by ID.
   * @param id - The UUID of the job.
   */
  getJob(id: string): Promise<Job<unknown> | null>;

  /**
   * Retrieve all jobs in the storage.
   */
  getJobs(): Promise<Job<unknown>[]>;

  /**
   * Optional: Move a job to the Dead Letter Queue.
   * Fired when a job exceeds maxAttempts.
   * @param job - The job to move to DLQ.
   */
  moveToDLQ?<T = unknown>(job: Job<T>): Promise<void>;

  /**
   * Delete all jobs from the storage.
   */
  deleteAll(): Promise<void>;

  /**
   * Optional crash recovery method.
   * Resets all active jobs to inactive state to handle app crashes.
   * This prevents "ghost jobs" (jobs stuck in active state after crash).
   */
  recover?(): Promise<void>;
}

/**
 * Represents the raw database row structure for a job in SQLite.
 * This matches the schema defined in the SQL CREATE TABLE statement.
 */
export interface JobRow {
  /** The UUID of the job. */
  id: string;
  /** The job name/type. */
  name: string;
  /** The job payload (serialized JSON). */
  payload: string;
  /** Additional metadata (attempts, settings) (serialized JSON). */
  data: string;
  /** Priority level. */
  priority: number;
  /** Active status (0 or 1). */
  active: number;
  /** Timeout in milliseconds. */
  timeout: number;
  /** Creation timestamp (ISO string). */
  created: string;
  /** Failure timestamp (ISO string) or null. */
  failed: string | null;
}

/**
 * Options for the JobProcessor constructor.
 */
export interface JobProcessorOptions {
  adapter: Adapter;
  registry: JobRegistry;
  executor: JobExecutor;
  concurrency?: number;
  monitorNetwork?: boolean;
}

/**
 * Options for the JobExecutor constructor.
 */
export interface JobExecutorOptions {
  adapter: Adapter;
  emitter: EventEmitter;
}

/**
 * Options for registering a worker in the JobRegistry.
 */
export interface RegisterWorkerOptions<T = unknown> {
  name: string;
  options?: WorkerOptions<T>;
  workerFn: (id: string, payload: T) => Promise<void>;
}

// Circular dependency fix: Import Registry and Executor types if needed,
// or define them as any if purely for typing in this file.
// Given the current structure, we might need to be careful with imports.
type JobRegistry = any;
type JobExecutor = any;
type EventEmitter = any;
