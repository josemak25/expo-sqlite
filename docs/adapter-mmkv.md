# MMKV Adapter Guide

[MMKV](https://github.com/mrousavy/react-native-mmkv) is an ultra-fast, synchronous key-value storage framework. Using MMKV as an adapter for `react-native-task-queue` is ideal for apps that require high-performance job persistence with minimal overhead.

## Implementation

Create a file named `MMKVAdapter.ts` in your project and paste the following implementation:

```typescript
import { MMKV } from 'react-native-mmkv';
import { Adapter, Job } from 'react-native-task-queue';

/**
 * A high-performance MMKV adapter for react-native-task-queue.
 * This adapter persists jobs synchronously but handles the Adapter interface's
 * async signatures to remain compatible with the core engine.
 */
export class MMKVAdapter implements Adapter {
  private storage: MMKV;
  private STORAGE_KEY = 'expo_queue_jobs';

  constructor(id: string = 'app-queue') {
    this.storage = new MMKV({ id });
  }

  /**
   * Persists a new job.
   */
  async addJob<T = unknown>(job: Job<T>): Promise<void> {
    const jobs = this.getJobsFromStorage();
    jobs.push(job as Job<unknown>);
    this.saveJobs(jobs);
  }

  /**
   * Retrieves a batch of jobs that are ready for processing.
   * Filters by !active, !failed and sorts by priority.
   */
  async getConcurrentJobs(limit: number = 1): Promise<Job<unknown>[]> {
    const jobs = this.getJobsFromStorage();
    const readyJobs = jobs
      .filter((j) => !j.active && !j.failed)
      .sort((a, b) => b.priority - a.priority)
      .slice(0, limit);

    // Mark as active in storage immediately to prevent double-claiming
    readyJobs.forEach((j) => (j.active = true));
    this.saveJobs(jobs);

    return readyJobs;
  }

  /**
   * Updates an existing job's state.
   */
  async updateJob<T = unknown>(job: Job<T>): Promise<void> {
    const jobs = this.getJobsFromStorage();
    const index = jobs.findIndex((j) => j.id === job.id);
    if (index !== -1) {
      jobs[index] = job as Job<unknown>;
      this.saveJobs(jobs);
    }
  }

  /**
   * Removes a job (typically after successful completion).
   */
  async removeJob<T = unknown>(job: Job<T>): Promise<void> {
    const jobs = this.getJobsFromStorage();
    const filtered = jobs.filter((j) => j.id !== job.id);
    this.saveJobs(filtered);
  }

  /**
   * Finds a specific job by ID.
   */
  async getJob(id: string): Promise<Job<unknown> | null> {
    const jobs = this.getJobsFromStorage();
    return jobs.find((j) => j.id === id) || null;
  }

  /**
   * Returns all stored jobs.
   */
  async getJobs(): Promise<Job<unknown>[]> {
    return this.getJobsFromStorage();
  }

  /**
   * Clears the entire queue.
   */
  async deleteAll(): Promise<void> {
    this.storage.delete(this.STORAGE_KEY);
  }

  /**
   * (Optional) Crash Recovery: Resets active jobs to idle on startup.
   */
  async recover(): Promise<void> {
    const jobs = this.getJobsFromStorage();
    jobs.forEach((job) => {
      if (job.active) job.active = false;
    });
    this.saveJobs(jobs);
  }

  // --- Internals ---

  private getJobsFromStorage(): Job<unknown>[] {
    const data = this.storage.getString(this.STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  }

  private saveJobs(jobs: Job<unknown>[]): void {
    this.storage.set(this.STORAGE_KEY, JSON.stringify(jobs));
  }
}
```

## Setup & Usage

To use the adapter, simply pass it to the `Queue` constructor:

```typescript
import { Queue } from 'react-native-task-queue';
import { MMKVAdapter } from './MMKVAdapter';

// Create the adapter with a unique namespace
const adapter = new MMKVAdapter('worker-storage');

// Initialize the queue
const queue = new Queue(adapter);

// Add your workers and jobs as usual
queue.addWorker('sync', async (id, payload) => {
  console.log('Syncing data...', payload);
});

await queue.addJob('sync', { some: 'data' });
```

## Performance Tips

1. **Serialization Overhead**: Since MMKV stores strings, large job lists require constant `JSON.parse` and `JSON.stringify`. For queues with thousands of jobs, consider using the **SQLite Adapter** instead, which handles row-level updates natively.
2. **Context Separation**: Use a dedicated MMKV instance (as shown with `new MMKV({ id })`) for the queue to prevent storage conflicts with other parts of your app.
