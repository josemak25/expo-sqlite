import {
  isJobExpired,
  calculateRetryDelay,
  shouldSkipByBackoff,
  prepareJobFailure,
  createJob,
  pick,
  omit,
} from '../helpers';

describe('Helpers', () => {
  describe('isJobExpired', () => {
    it('should return false if ttl is 0', () => {
      const job = createJob('test', {});
      job.ttl = 0;
      expect(isJobExpired(job)).toBe(false);
    });

    it('should return false if job is not expired', () => {
      const job = createJob('test', {});
      job.ttl = 10000;
      expect(isJobExpired(job)).toBe(false);
    });

    it('should return true if job is expired', () => {
      const job = createJob('test', {});
      job.ttl = 1000;
      job.created = new Date(Date.now() - 2000).toISOString();
      expect(isJobExpired(job)).toBe(true);
    });
  });

  describe('calculateRetryDelay', () => {
    it('should calculate exponential delay with jitter', () => {
      const job = createJob('test', {});
      job.attempts = 2;
      job.timeInterval = 1000;

      // (1000 * 2^2) = 4000
      // jitter is between 0 and 1000
      // delay should be between 4000 and 5000
      const delay = calculateRetryDelay(job);
      expect(delay).toBeGreaterThanOrEqual(4000);
      expect(delay).toBeLessThanOrEqual(5000);
    });
  });

  describe('shouldSkipByBackoff', () => {
    it('should not skip if job never failed', () => {
      const job = createJob('test', {});
      job.failed = null;
      const result = shouldSkipByBackoff(job);
      expect(result.shouldSkip).toBe(false);
    });

    it('should not skip if max attempts reached', () => {
      const job = createJob('test', {});
      job.failed = new Date().toISOString();
      job.attempts = 3;
      job.maxAttempts = 3;
      const result = shouldSkipByBackoff(job);
      expect(result.shouldSkip).toBe(false);
    });

    it('should skip if within backoff window', () => {
      const now = Date.now();
      const job = createJob('test', {});
      job.failed = new Date(now - 1000).toISOString();
      job.attempts = 1;
      job.maxAttempts = 3;
      job.timeInterval = 10000;

      const result = shouldSkipByBackoff(job);
      expect(result.shouldSkip).toBe(true);
      expect(result.remaining).toBeGreaterThan(0);
    });

    it('should not skip if backoff window passed', () => {
      const now = Date.now();
      const job = createJob('test', {});
      job.failed = new Date(now - 60000).toISOString();
      job.attempts = 1;
      job.maxAttempts = 3;
      job.timeInterval = 1000;

      const result = shouldSkipByBackoff(job);
      expect(result.shouldSkip).toBe(false);
    });
  });

  describe('prepareJobFailure', () => {
    it('should update job on failure', () => {
      const job = createJob('test', {});
      job.attempts = 1;
      job.active = true;
      job.metaData = { existing: 'data' };
      const error = new Error('Test Error');

      const updated = prepareJobFailure(job, error);

      expect(updated.attempts).toBe(2);
      expect(updated.active).toBe(false);
      expect(updated.failed).toBeDefined();
      expect(updated.metaData).toEqual({
        existing: 'data',
        lastError: 'Test Error',
      });
    });
  });

  describe('createJob', () => {
    it('should create job with defaults', () => {
      const job = createJob('test', { foo: 'bar' });
      expect(job.id).toBeDefined();
      expect(job.name).toBe('test');
      expect(job.payload).toEqual({ foo: 'bar' });
      expect(job.attempts).toBe(0);
      expect(job.maxAttempts).toBe(1);
      expect(job.active).toBe(false);
    });

    it('should respect custom options', () => {
      const job = createJob(
        'test',
        {},
        {
          attempts: 5,
          priority: 10,
          timeout: 5000,
          onlineOnly: true,
        }
      );
      expect(job.maxAttempts).toBe(5);
      expect(job.priority).toBe(10);
      expect(job.timeout).toBe(5000);
      expect(job.onlineOnly).toBe(true);
    });

    it('should use retries alias', () => {
      const job = createJob('test', {}, { retries: 2 });
      expect(job.maxAttempts).toBe(3);
    });
  });

  describe('pick and omit', () => {
    const obj = { a: 1, b: 2, c: 3 };

    it('pick should select keys', () => {
      expect(pick(obj, ['a', 'c'])).toEqual({ a: 1, c: 3 });
    });

    it('omit should exclude keys', () => {
      expect(omit(obj, ['b'])).toEqual({ a: 1, c: 3 });
    });
  });
});
