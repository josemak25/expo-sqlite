import { Queue } from '../queue';
import type { Adapter, Job } from '../types';
import NetInfo from '@react-native-community/netinfo';

// Mock NetInfo at the top level
jest.mock('@react-native-community/netinfo', () => ({
  fetch: jest.fn().mockResolvedValue({ isConnected: true }),
}));

class MockAdapter implements Adapter {
  jobs: Job<unknown>[] = [];

  async addJob<T = unknown>(job: Job<T>): Promise<void> {
    this.jobs.push(job as unknown as Job<unknown>);
  }

  async getConcurrentJobs(): Promise<Job<unknown>[]> {
    return this.jobs
      .filter((j) => !j.active && j.attempts < j.maxAttempts)
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

  beforeEach(() => {
    adapter = new MockAdapter();
    queue = new Queue(adapter);
    jest.clearAllMocks();
  });

  afterEach(() => {
    queue.stop();
  });

  describe('Basic functionality', () => {
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
  });

  describe('Max Attempts & Retries', () => {
    it('should retry a failed job up to maxAttempts', (done) => {
      let attempts = 0;
      const workerFn = jest.fn().mockImplementation(async () => {
        attempts++;
        if (attempts < 3) throw new Error('Fail');
      });

      queue.addWorker('retry-job', workerFn);

      let failureCount = 0;
      queue.on('failure', () => {
        failureCount++;
      });

      queue.on('success', (job) => {
        try {
          expect(attempts).toBe(3);
          expect(failureCount).toBe(2);
          expect(job.attempts).toBe(2); // In my logic, attempts is updated AFTER fail
          done();
        } catch (e) {
          done(e);
        }
      });

      queue.addJob('retry-job', {}, { attempts: 3 });
    }, 10000);

    it('should stop retrying after maxAttempts exceeded', (done) => {
      let attempts = 0;
      const workerFn = jest.fn().mockImplementation(async () => {
        attempts++;
        throw new Error('Always fail');
      });

      queue.addWorker('fail-job', workerFn);

      queue.on('failure', async (job) => {
        if (job.attempts >= 2) {
          // After 2 attempts, job should be marked as failed permanently
          expect(attempts).toBe(2);
          expect(job.attempts).toBe(2);
          expect(job.failed).toBeTruthy();
          done();
        }
      });

      queue.addJob('fail-job', {}, { attempts: 2 });
    }, 10000);

    it('should use retries alias for attempts', async () => {
      const id = await queue.addJob('test', {}, { retries: 3 });
      const job = await adapter.getJob(id);
      expect(job?.maxAttempts).toBe(4); // retries + 1
    });
  });

  describe('Time Interval (Backoff)', () => {
    it('should wait timeInterval between retries', (done) => {
      jest.setTimeout(20000);

      let attempts = 0;
      let lastAttemptTime = Date.now();

      const workerFn = jest.fn().mockImplementation(async () => {
        const now = Date.now();
        if (attempts > 0) {
          const elapsed = now - lastAttemptTime;
          // Allow some tolerance (900ms minimum instead of strict 1000ms)
          expect(elapsed).toBeGreaterThanOrEqual(900);
        }
        lastAttemptTime = now;
        attempts++;
        if (attempts < 3) throw new Error('Fail');
      });

      queue.addWorker('backoff-job', workerFn);

      queue.on('success', () => {
        expect(attempts).toBe(3);
        done();
      });

      queue.addJob(
        'backoff-job',
        {},
        {
          attempts: 3,
          timeInterval: 1000, // 1 second between retries
        }
      );
    }, 20000);
  });

  describe('TTL (Time To Live)', () => {
    it('should delete job after TTL expires', async () => {
      const workerFn = jest.fn().mockResolvedValue(null);
      queue.addWorker('ttl-job', workerFn);

      // Stop queue to prevent immediate processing
      queue.stop();

      const id = await queue.addJob(
        'ttl-job',
        {},
        { ttl: 100, autoStart: false }
      );

      // Wait for TTL to expire
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Now start queue - job should be expired and deleted
      await queue.start();
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Worker should not have been called (job expired)
      expect(workerFn).not.toHaveBeenCalled();

      // Job should be removed
      const job = await adapter.getJob(id);
      expect(job).toBeNull();
    }, 1000);

    it('should process job before TTL expires', (done) => {
      const workerFn = jest.fn().mockResolvedValue(null);
      queue.addWorker('quick-job', workerFn);

      queue.on('success', () => {
        expect(workerFn).toHaveBeenCalled();
        done();
      });

      queue.addJob('quick-job', {}, { ttl: 5000 }); // 5 seconds
    });
  });

  describe('Network Awareness (onlineOnly)', () => {
    beforeEach(() => {
      // Reset mocks
      (NetInfo.fetch as jest.Mock).mockClear();
    });

    it('should skip job when offline and onlineOnly is true', async () => {
      (NetInfo.fetch as jest.Mock).mockResolvedValueOnce({
        isConnected: false,
      });

      const workerFn = jest.fn();
      queue.addWorker('upload-job', workerFn);

      await queue.addJob('upload-job', {}, { onlineOnly: true });

      // Give it time to try processing
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Worker should not have been called (job skipped)
      expect(workerFn).not.toHaveBeenCalled();
    });

    it('should process job when online and onlineOnly is true', (done) => {
      (NetInfo.fetch as jest.Mock).mockResolvedValueOnce({ isConnected: true });

      const workerFn = jest.fn().mockResolvedValue(null);
      queue.addWorker('upload-job', workerFn);

      queue.on('success', () => {
        expect(workerFn).toHaveBeenCalled();
        done();
      });

      queue.addJob('upload-job', {}, { onlineOnly: true });
    });

    it('should process job regardless of network when onlineOnly is undefined', (done) => {
      (NetInfo.fetch as jest.Mock).mockResolvedValueOnce({
        isConnected: false,
      });

      const workerFn = jest.fn().mockResolvedValue(null);
      queue.addWorker('local-job', workerFn);

      queue.on('success', () => {
        expect(workerFn).toHaveBeenCalled();
        // NetInfo should not have been called
        expect(NetInfo.fetch).not.toHaveBeenCalled();
        done();
      });

      // onlineOnly defaults to undefined (runs regardless)
      queue.addJob('local-job', {});
    });
  });

  describe('Job Properties Persistence', () => {
    it('should persist all job options', async () => {
      const id = await queue.addJob(
        'test-job',
        { data: 'test' },
        {
          priority: 5,
          attempts: 3,
          timeInterval: 1000,
          ttl: 60000,
          onlineOnly: true,
        }
      );

      const job = await adapter.getJob(id);
      expect(job?.priority).toBe(5);
      expect(job?.maxAttempts).toBe(3);
      expect(job?.timeInterval).toBe(1000);
      expect(job?.ttl).toBe(60000);
      expect(job?.onlineOnly).toBe(true);
    });
  });
});
