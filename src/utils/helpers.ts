import { v4 as uuidv4 } from 'uuid';
import type { Job, JobOptions } from '../types';

/**
 * Checks if a job has exceeded its programmed Time-To-Live (TTL).
 * @param job - The job to check.
 * @returns True if the job is expired and should be discarded.
 */
export function isJobExpired<T>(job: Job<T>): boolean {
  if (job.ttl <= 0) return false;

  const created = new Date(job.created).getTime();
  const now = Date.now();

  return now - created > job.ttl;
}

/**
 * Calculates the delay for the next retry attempt using
 * Exponential Backoff and randomized Jitter.
 *
 * Formula: (baseInterval * 2^attempts) + (Math.random() * baseInterval)
 *
 * @param job - The failing job.
 * @returns Delay in milliseconds.
 */
export function calculateRetryDelay<T>(job: Job<T>): number {
  // exponential backoff: baseDelay * 2^attempts
  const exponentialDelay = job.timeInterval * Math.pow(2, job.attempts);

  // jitter: randomized variance between 0 and base interval
  const jitter = Math.random() * job.timeInterval;

  return exponentialDelay + jitter;
}

/**
 * Determines if a job is still within its retry backoff window.
 * @param job - The job to check.
 * @returns Object containing whether to skip and the remaining delay.
 */
export function shouldSkipByBackoff<T>(job: Job<T>): {
  shouldSkip: boolean;
  remaining: number;
} {
  if (!job.failed || job.attempts >= job.maxAttempts) {
    return { shouldSkip: false, remaining: 0 };
  }

  const lastFailed = new Date(job.failed).getTime();
  const now = Date.now();
  const elapsed = now - lastFailed;
  const totalDelay = calculateRetryDelay(job);

  if (elapsed < totalDelay) {
    return { shouldSkip: true, remaining: totalDelay - elapsed };
  }

  return { shouldSkip: false, remaining: 0 };
}

/**
 * Updates a job object after a failed attempt.
 * Increments attempts and populates metadata with error details.
 *
 * @param job - The job that failed.
 * @param error - The error encountered.
 * @returns The updated job object.
 */
export function prepareJobFailure<T>(job: Job<T>, error: Error): Job<T> {
  const updatedJob = { ...job };

  updatedJob.attempts++;
  updatedJob.active = false;
  updatedJob.failed = new Date().toISOString();
  updatedJob.metaData = {
    ...job.metaData,
    lastError: error.message,
  };

  return updatedJob;
}

/**
 * Factory function to create a new Job object with validated defaults.
 *
 * @template T - Payload type.
 * @param name - Job name.
 * @param payload - Data payload.
 * @param options - Custom configuration options.
 * @returns A fully initialized Job object.
 */
export function createJob<T>(
  name: string,
  payload: T,
  options: JobOptions = {}
): Job<T> {
  return {
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
}

/**
 * Creates a new object by picking specified properties from a source object.
 *
 * @template T - Source object type.
 * @template K - Keys to pick.
 * @param obj - The source object.
 * @param keys - Array of keys to pick.
 */
export function pick<T extends object, K extends keyof T>(
  obj: T,
  keys: K[]
): Pick<T, K> {
  const result = {} as Pick<T, K>;
  keys.forEach((key) => {
    if (key in obj) {
      result[key] = obj[key];
    }
  });
  return result;
}

/**
 * Creates a new object by omitting specified properties from a source object.
 *
 * @template T - Source object type.
 * @template K - Keys to omit.
 * @param obj - The source object.
 * @param keys - Array of keys to omit.
 */
export function omit<T extends object, K extends keyof T>(
  obj: T,
  keys: K[]
): Omit<T, K> {
  const result = { ...obj };
  keys.forEach((key) => {
    delete result[key];
  });
  return result as Omit<T, K>;
}
