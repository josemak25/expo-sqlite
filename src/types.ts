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
}

/**
 * Interface for Storage Adapters.
 * Adapters are responsible for persisting jobs and retrieving them.
 */
export interface Adapter {
  /**
   * Initialize the storage (e.g., create tables).
   */
  init(): Promise<void>;

  /**
   * Add a new job to the storage.
   * @param job - The job to add.
   */
  addJob<T = unknown>(job: Job<T>): Promise<void>;

  /**
   * Retrieve a batch of jobs to process concurrently.
   */
  getConcurrentJobs(): Promise<Job<unknown>[]>;

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
   * Delete all jobs from the storage.
   */
  deleteAll(): Promise<void>;
}
