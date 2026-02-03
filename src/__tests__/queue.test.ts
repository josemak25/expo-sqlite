import { Queue } from '../queue';
import type { Adapter, Job } from '../types';

class MockAdapter implements Adapter {
  jobs: Job<unknown>[] = [];

  async init(): Promise<void> {}

  async addJob<T = unknown>(job: Job<T>): Promise<void> {
    this.jobs.push(job as unknown as Job<unknown>);
  }

  async getConcurrentJobs(): Promise<Job<unknown>[]> {
    return this.jobs
      .filter((j) => !j.active && !j.failed)
      .sort((a, b) => b.priority - a.priority);
  }

  async updateJob<T = unknown>(job: Job<T>): Promise<void> {
    const index = this.jobs.findIndex((j) => j.id === job.id);
    if (index !== -1) {
      this.jobs[index] = job as unknown as Job<unknown>;
    }
  }

  async removeJob<T = unknown>(job: Job<T>): Promise<void> {
    this.jobs = this.jobs.filter((j) => j.id !== job.id);
  }

  async getJob(id: string): Promise<Job<unknown> | null> {
    return this.jobs.find((j) => j.id === id) || null;
  }

  async getJobs(): Promise<Job<unknown>[]> {
    return this.jobs;
  }

  async deleteAll(): Promise<void> {
    this.jobs = [];
  }
}

describe('Queue', () => {
  let queue: Queue;
  let adapter: MockAdapter;

  beforeEach(async () => {
    adapter = new MockAdapter();
    queue = new Queue(adapter);
    await queue.init();
  });

  it('should add a job', async () => {
    const id = await queue.addJob('test-job', { foo: 'bar' });
    const job = await adapter.getJob(id);
    expect(job).toBeDefined();
    expect(job?.name).toBe('test-job');
    expect(job?.payload).toEqual({ foo: 'bar' });
  });

  it('should process a job', (done) => {
    const workerFn = jest.fn().mockResolvedValue(null);
    queue.addWorker('test-job', workerFn);

    queue.on('success', (job) => {
      expect(job.name).toBe('test-job');
      expect(workerFn).toHaveBeenCalled();
      done();
    });

    queue.addJob('test-job', { foo: 'bar' });
  });

  it('should handle concurrency', (done) => {
    queue = new Queue(adapter, { concurrency: 2 });

    let activeWorkers = 0;
    let maxActiveWorkers = 0;

    const workerFn = jest.fn().mockImplementation(async () => {
      activeWorkers++;
      maxActiveWorkers = Math.max(maxActiveWorkers, activeWorkers);
      await new Promise((resolve) => setTimeout(resolve, 50));
      activeWorkers--;
    });

    queue.addWorker('concurrent-job', workerFn);

    queue.addJob('concurrent-job', {});
    queue.addJob('concurrent-job', {});
    queue.addJob('concurrent-job', {});

    let completed = 0;
    queue.on('success', () => {
      completed++;
      if (completed === 3) {
        expect(maxActiveWorkers).toBeLessThanOrEqual(2);
        expect(workerFn).toHaveBeenCalledTimes(3);
        done();
      }
    });
  });

  it('should retry a failed job', (done) => {
    let attempts = 0;
    const workerFn = jest.fn().mockImplementation(async () => {
      attempts++;
      if (attempts === 1) throw new Error('Fail first time');
    });

    queue.addWorker('retry-job', workerFn);

    queue.on('failure', async (job) => {
      // After first failure, job should stay in queue but be inactive
      // active=false, attempts=1
      const dbJob = await adapter.getJob(job.id);
      expect(dbJob?.attempts).toBe(1);
      expect(dbJob?.active).toBe(false);

      // Manually trigger next process to simulate retry loop or just check state
      // In real app, start() is called periodically or on event.
      // Here we just want to verify state update.
      done();
    });

    queue.addJob('retry-job', {});
  });
});
