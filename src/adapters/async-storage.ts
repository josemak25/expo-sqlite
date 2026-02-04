import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Adapter, Job } from '../types';

/**
 * Adapter for using AsyncStorage as the backend.
 * Suitable for generic React Native apps without native SQLite dependency.
 */
export class AsyncStorageAdapter implements Adapter {
  private key: string;

  constructor(key: string = 'expo-queue-jobs') {
    this.key = key;
  }

  async addJob<T = unknown>(job: Job<T>): Promise<void> {
    const jobs = await this.getJobsFromStorage();
    jobs.push(job);
    await this.saveJobsToStorage(jobs);
  }

  async getConcurrentJobs(): Promise<Job<unknown>[]> {
    const jobs = await this.getJobsFromStorage();

    // Filter active=false, failed=null
    // Sort by priority DESC, created ASC
    return jobs
      .filter((job) => !job.active && !job.failed)
      .sort((a, b) => {
        if (a.priority !== b.priority) {
          return b.priority - a.priority;
        }
        return new Date(a.created).getTime() - new Date(b.created).getTime();
      });
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
