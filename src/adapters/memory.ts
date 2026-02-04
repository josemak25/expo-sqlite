import type { Adapter, Job } from '../types';

/**
 * An in-memory storage adapter for the queue.
 * Useful for testing and non-persistent queues.
 * @implements {Adapter}
 */
export class MemoryAdapter implements Adapter {
  /** Map to store jobs in memory. */
  private jobs: Map<string, Job<unknown>> = new Map();

  async addJob<T = unknown>(job: Job<T>): Promise<void> {
    // Cast to Job<unknown> to store in the generic map
    this.jobs.set(job.id, job as unknown as Job<unknown>);
  }

  /**
   * Retrieves concurrent jobs from memory.
   * Filters for inactive and non-failed jobs, sorted by priority and creation time.
   */
  async getConcurrentJobs(limit: number = 1): Promise<Job<unknown>[]> {
    const jobs = Array.from(this.jobs.values())
      .filter((job) => !job.active && job.attempts < job.maxAttempts)
      .sort((a, b) => {
        // Sort by priority DESC, then created ASC
        if (a.priority !== b.priority) {
          return b.priority - a.priority;
        }
        return new Date(a.created).getTime() - new Date(b.created).getTime();
      })
      .slice(0, limit);

    // In a single-threaded environment (JS Loop), this operation is effectively atomic.
    // We mark the selected jobs as active immediately so subsequent calls in the same tick
    // (or after await) will see them as taken.
    for (const job of jobs) {
      job.active = true;
      this.jobs.set(job.id, job);
    }

    return jobs;
  }

  async updateJob<T = unknown>(job: Job<T>): Promise<void> {
    if (this.jobs.has(job.id)) {
      this.jobs.set(job.id, job as unknown as Job<unknown>);
    }
  }

  async removeJob<T = unknown>(job: Job<T>): Promise<void> {
    this.jobs.delete(job.id);
  }

  async getJob(id: string): Promise<Job<unknown> | null> {
    return this.jobs.get(id) || null;
  }

  async getJobs(): Promise<Job<unknown>[]> {
    return Array.from(this.jobs.values());
  }

  async deleteAll(): Promise<void> {
    this.jobs.clear();
  }
}
