import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Adapter, Job } from '../types';

/**
 * Adapter for using AsyncStorage as the backend.
 * Suitable for generic React Native apps without native SQLite dependency.
 */
export class AsyncStorageAdapter implements Adapter {
  private key: string;

  constructor(key: string = 'react-native-task-queue-jobs') {
    this.key = key;
  }

  async addJob<T = unknown>(job: Job<T>): Promise<void> {
    const jobs = await this.getJobsFromStorage();
    jobs.push(job);
    await this.saveJobsToStorage(jobs);
  }

  async getConcurrentJobs(limit: number = 1): Promise<Job<unknown>[]> {
    const allJobs = await this.getJobsFromStorage();

    // Filter active=false, failed=null
    // Sort by priority DESC, created ASC
    const candidateJobs = allJobs
      .filter((job) => !job.active && job.attempts < job.maxAttempts)
      .sort((a, b) => {
        if (a.priority !== b.priority) {
          return b.priority - a.priority;
        }
        return new Date(a.created).getTime() - new Date(b.created).getTime();
      })
      .slice(0, limit);

    // Perform a Read-Modify-Write cycle to claim the jobs.
    // While AsyncStorage is not transactional, updating the source array immediately
    // and saving it back reduces the window for race conditions in a single JS process.
    if (candidateJobs.length > 0) {
      candidateJobs.forEach((job) => {
        job.active = true;
        // Update reference in the source array
        const idx = allJobs.findIndex((j) => j.id === job.id);
        if (idx !== -1) allJobs[idx] = job;
      });
      await this.saveJobsToStorage(allJobs);
    }

    return candidateJobs;
  }

  async updateJob<T = unknown>(job: Job<T>): Promise<void> {
    let jobs = await this.getJobsFromStorage();
    const index = jobs.findIndex((j) => j.id === job.id);

    if (index !== -1) {
      jobs[index] = job as Job<unknown>;
      await this.saveJobsToStorage(jobs);
    }
  }

  async removeJob<T = unknown>(job: Job<T>): Promise<void> {
    let jobs = await this.getJobsFromStorage();
    jobs = jobs.filter((j) => j.id !== job.id);
    await this.saveJobsToStorage(jobs);
  }

  async getJob(id: string): Promise<Job<unknown> | null> {
    const jobs = await this.getJobsFromStorage();
    return jobs.find((j) => j.id === id) || null;
  }

  async getJobs(): Promise<Job<unknown>[]> {
    return this.getJobsFromStorage();
  }

  async deleteAll(): Promise<void> {
    await AsyncStorage.removeItem(this.key);
  }

  /**
   * Resets all active jobs to inactive state.
   */
  async recover(): Promise<void> {
    const jobs = await this.getJobsFromStorage();
    let hasChanges = false;
    jobs.forEach((job) => {
      if (job.active) {
        job.active = false;
        hasChanges = true;
      }
    });

    if (hasChanges) {
      await this.saveJobsToStorage(jobs);
    }
  }

  // Helper methods
  private async getJobsFromStorage(): Promise<Job<unknown>[]> {
    try {
      const json = await AsyncStorage.getItem(this.key);
      return json != null ? JSON.parse(json) : [];
    } catch (e) {
      console.error('AsyncStorageAdapter: Error reading jobs', e);
      return [];
    }
  }

  private async saveJobsToStorage(jobs: Job<unknown>[]): Promise<void> {
    try {
      await AsyncStorage.setItem(this.key, JSON.stringify(jobs));
    } catch (e) {
      console.error('AsyncStorageAdapter: Error saving jobs', e);
    }
  }
}
