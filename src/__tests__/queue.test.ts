import { Queue } from '../queue';
import { MemoryAdapter } from '../adapters/memory';
import { createJob } from '../utils/helpers';
import '../jest/mock';

describe('Queue Integration', () => {
  let queue: Queue;
  let adapter: MemoryAdapter;

  beforeEach(() => {
    jest.useFakeTimers();
    adapter = new MemoryAdapter();
    queue = new Queue(adapter, { concurrency: 2 });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should process a job end-to-end', async () => {
    const workerFn = jest.fn().mockResolvedValue(undefined);
    queue.addWorker('test-job', workerFn);

    const successSpy = jest.fn();
    queue.on('success', successSpy);

    const jobId = await queue.addJob('test-job', { foo: 'bar' });

    // Allow process loop to run
    await jest.advanceTimersByTimeAsync(0);

    expect(workerFn).toHaveBeenCalledWith(jobId, { foo: 'bar' });
    expect(successSpy).toHaveBeenCalled();

    const job = await adapter.getJob(jobId);
    expect(job).toBeNull();
  });

  it('should handle retries on failure', async () => {
    const error = new Error('Transient failure');
    const workerFn = jest
      .fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce(undefined);

    queue.addWorker('retry-job', workerFn);

    const failureSpy = jest.fn();
    const successSpy = jest.fn();
    queue.on('failure', failureSpy);
    queue.on('success', successSpy);

    await queue.addJob(
      'retry-job',
      {},
      {
        attempts: 2,
        timeInterval: 1000,
      }
    );

    // 1. First attempt fails.
    await jest.advanceTimersByTimeAsync(0);
    expect(failureSpy).toHaveBeenCalled();
    expect(successSpy).not.toHaveBeenCalled();

    // 2. Advance time for retry. Delay is 1000 * 2^1 + jitter (0-1000).
    // Max delay is 3000. Use 5000 to be safe.
    await jest.advanceTimersByTimeAsync(5000);

    expect(successSpy).toHaveBeenCalled();
    expect(workerFn).toHaveBeenCalledTimes(2);
  });

  it('should respect pause and resume', async () => {
    const workerFn = jest.fn().mockResolvedValue(undefined);
    queue.addWorker('paused-job', workerFn);

    queue.pauseJob('paused-job');
    await queue.addJob('paused-job', {});

    await jest.advanceTimersByTimeAsync(0);
    expect(workerFn).not.toHaveBeenCalled();

    queue.resumeJob('paused-job');
    await jest.advanceTimersByTimeAsync(0);
    expect(workerFn).toHaveBeenCalled();
  });

  it('should recover ghost jobs on start', async () => {
    const stuckJob = createJob('stuck', {});
    stuckJob.active = true;
    await adapter.addJob(stuckJob);

    const workerFn = jest.fn().mockResolvedValue(undefined);
    queue.addWorker('stuck', workerFn);

    await queue.start();
    await jest.advanceTimersByTimeAsync(0);

    expect(workerFn).toHaveBeenCalled();
    const job = await adapter.getJob(stuckJob.id);
    expect(job).toBeNull();
  });

  it('should stop processing when stop is called', async () => {
    const workerFn = jest.fn().mockResolvedValue(undefined);
    queue.addWorker('test', workerFn);

    // Test that synchronous start/stop cancels processing
    await queue.addJob('test', {}, { autoStart: false });
    queue.start();
    queue.stop();

    await jest.advanceTimersByTimeAsync(500);
    expect(workerFn).not.toHaveBeenCalled();
  });
});
