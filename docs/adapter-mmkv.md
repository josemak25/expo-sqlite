# MMKV Adapter (Custom Implementation)

If you prefer `react-native-mmkv` for ultra-fast synchronous storage, you can easily implement your own adapter. `expo-queue` does not include MMKV by default to keep the package lightweight.

## Implementation

Create a file `MMKVAdapter.ts` in your project:

```typescript
import { MMKV } from 'react-native-mmkv';
import type { Adapter, Job } from 'expo-queue';

export class MMKVAdapter implements Adapter {
  private storage: MMKV;
  private key = 'queue-jobs';

  constructor() {
    this.storage = new MMKV({ id: 'worker-storage' });
  }

  async addJob<T = unknown>(job: Job<T>): Promise<void> {
    const jobs = this.getJobsFromStorage();
    jobs.push(job);
    this.storage.set(this.key, JSON.stringify(jobs));
  }

  async getConcurrentJobs(): Promise<Job<unknown>[]> {
    const jobs = this.getJobsFromStorage();
    return jobs
      .filter((job) => !job.active && !job.failed)
      .sort((a, b) => b.priority - a.priority); // Simple sort
  }

  async updateJob<T = unknown>(job: Job<T>): Promise<void> {
    const jobs = this.getJobsFromStorage();
    const index = jobs.findIndex((j) => j.id === job.id);
    if (index !== -1) {
      jobs[index] = job as Job<unknown>;
      this.storage.set(this.key, JSON.stringify(jobs));
    }
  }

  async removeJob<T = unknown>(job: Job<T>): Promise<void> {
    const jobs = this.getJobsFromStorage();
    const newJobs = jobs.filter((j) => j.id !== job.id);
    this.storage.set(this.key, JSON.stringify(newJobs));
  }

  async getJob(id: string): Promise<Job<unknown> | null> {
    const jobs = this.getJobsFromStorage();
    return jobs.find((j) => j.id === id) || null;
  }

  async getJobs(): Promise<Job<unknown>[]> {
    return this.getJobsFromStorage();
  }

  async deleteAll(): Promise<void> {
    this.storage.delete(this.key);
  }

  private getJobsFromStorage(): Job<unknown>[] {
    const json = this.storage.getString(this.key);
    return json ? JSON.parse(json) : [];
  }
}
```

## Usage

```typescript
import { Queue } from 'expo-queue';
import { MMKVAdapter } from './MMKVAdapter';

const queue = new Queue(new MMKVAdapter());
```
