import { JobProcessor } from '../processor';
import { JobRegistry } from '../registry';
import { JobExecutor } from '../executor';
import { createJob } from '../utils/helpers';
import type { Adapter } from '../types';
import EventEmitter from 'eventemitter3';
import NetInfo from '@react-native-community/netinfo';

// Mock NetInfo directly in the factory
jest.mock('@react-native-community/netinfo', () => ({
  fetch: jest.fn().mockResolvedValue({ isConnected: true }),
  addEventListener: jest.fn().mockReturnValue(jest.fn()),
  default: {
    fetch: jest.fn().mockResolvedValue({ isConnected: true }),
    addEventListener: jest.fn().mockReturnValue(jest.fn()),
  },
}));

describe('JobProcessor', () => {
  let processor: JobProcessor;
  let adapter: jest.Mocked<Adapter>;
  let registry: JobRegistry;
  let executor: JobExecutor;
  let emitter: EventEmitter;

  beforeEach(() => {
    jest.useFakeTimers();
    adapter = {
      getConcurrentJobs: jest.fn().mockResolvedValue([]),
      updateJob: jest.fn().mockResolvedValue(undefined),
      removeJob: jest.fn().mockResolvedValue(undefined),
      deleteAll: jest.fn().mockResolvedValue(undefined),
    } as any;
    registry = new JobRegistry();
    emitter = new EventEmitter();
    executor = new JobExecutor({ adapter, emitter });
    // Spy on executor.execute to prevent it from actually running
    jest.spyOn(executor, 'execute').mockResolvedValue(undefined);

    processor = new JobProcessor({
      adapter,
      registry,
      executor,
      concurrency: 2,
      monitorNetwork: true,
    }); // concurrency 2, monitorNetwork true

    // Reset NetInfo mocks via the imported module to avoid hoisting issues
    (NetInfo.fetch as jest.Mock).mockClear();
    (NetInfo.fetch as jest.Mock).mockResolvedValue({ isConnected: true });
    (NetInfo.addEventListener as jest.Mock).mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should process jobs when started', async () => {
    const job = createJob('test', {});
    adapter.getConcurrentJobs
      .mockResolvedValueOnce([job])
      .mockResolvedValue([]);
    registry.addWorker({ name: 'test', workerFn: jest.fn() });

    processor.start();
    await jest.runAllTimersAsync();

    expect(adapter.getConcurrentJobs).toHaveBeenCalled();
    expect(executor.execute).toHaveBeenCalled();
  });

  it('should respect global concurrency', async () => {
    const job1 = createJob('test', {});
    const job2 = createJob('test', {});

    // Concurrency is 2, so it should fetch 2 jobs initially
    adapter.getConcurrentJobs
      .mockResolvedValueOnce([job1, job2])
      .mockResolvedValue([]);
    registry.addWorker({ name: 'test', workerFn: jest.fn() });

    processor.start();
    await jest.runAllTimersAsync();

    expect(adapter.getConcurrentJobs).toHaveBeenCalledWith(2);
    expect(executor.execute).toHaveBeenCalledTimes(2);
  });

  it('should skip paused job names', async () => {
    const job = createJob('paused-job', {});
    adapter.getConcurrentJobs
      .mockResolvedValueOnce([job])
      .mockResolvedValue([]);
    registry.addWorker({ name: 'paused-job', workerFn: jest.fn() });

    processor.pauseJob('paused-job');
    processor.start();
    await jest.runAllTimersAsync();

    expect(executor.execute).not.toHaveBeenCalled();
    // Verification: it should have been unclaimed
    expect(adapter.updateJob).toHaveBeenCalled();
  });

  it('should resume jobs when resumeJob is called', async () => {
    const job = createJob('test', {});
    adapter.getConcurrentJobs.mockResolvedValue([job]).mockResolvedValue([]);
    registry.addWorker({ name: 'test', workerFn: jest.fn() });

    processor.pauseJob('test');
    processor.start();
    await jest.runAllTimersAsync();
    expect(executor.execute).not.toHaveBeenCalled();

    adapter.getConcurrentJobs
      .mockResolvedValueOnce([job])
      .mockResolvedValue([]);
    processor.resumeJob('test');
    await jest.runAllTimersAsync();

    expect(executor.execute).toHaveBeenCalled();
  });

  it('should skip jobs if offline and onlineOnly is true', async () => {
    const job = createJob('test', {}, { onlineOnly: true });
    adapter.getConcurrentJobs
      .mockResolvedValueOnce([job])
      .mockResolvedValue([]);
    registry.addWorker({ name: 'test', workerFn: jest.fn() });

    // Mock offline
    (NetInfo.fetch as jest.Mock).mockResolvedValueOnce({ isConnected: false });

    processor.start();
    await jest.runAllTimersAsync();

    expect(executor.execute).not.toHaveBeenCalled();
  });

  it('should remove expired jobs via TTL', async () => {
    const job = createJob('test', {});
    job.ttl = 1000;
    job.created = new Date(Date.now() - 2000).toISOString();

    adapter.getConcurrentJobs
      .mockResolvedValueOnce([job])
      .mockResolvedValue([]);
    registry.addWorker({ name: 'test', workerFn: jest.fn() });

    processor.start();
    await jest.runAllTimersAsync();

    expect(adapter.removeJob).toHaveBeenCalledWith(job);
    expect(executor.execute).not.toHaveBeenCalled();
  });

  it('should handle backoff retries with setTimeout', async () => {
    const now = Date.now();
    const job = createJob('test', {});
    job.failed = new Date(now - 1000).toISOString();
    job.attempts = 1;
    job.maxAttempts = 3;
    job.timeInterval = 5000;

    adapter.getConcurrentJobs
      .mockResolvedValueOnce([job])
      .mockResolvedValue([]);
    registry.addWorker({ name: 'test', workerFn: jest.fn() });

    processor.start();
    await jest.runAllTimersAsync();

    // Should skip execution but schedule next process
    expect(executor.execute).not.toHaveBeenCalled();

    // Move time forward past the backoff
    jest.advanceTimersByTime(10000);
    // After timer fires, it should try processing again
    expect(adapter.getConcurrentJobs).toHaveBeenCalledTimes(2);
  });

  it('should not require NetInfo if monitorNetwork is false', async () => {
    const localProcessor = new JobProcessor({
      adapter,
      registry,
      executor,
      concurrency: 1,
      monitorNetwork: false,
    });
    const job = createJob('test', {}, { onlineOnly: true });
    adapter.getConcurrentJobs
      .mockResolvedValueOnce([job])
      .mockResolvedValue([]);
    registry.addWorker({ name: 'test', workerFn: jest.fn() });

    await localProcessor.start();
    await jest.runAllTimersAsync();

    // isConnected should be true by default, so it should process onlineOnly job
    expect(executor.execute).toHaveBeenCalled();
    const NI = require('@react-native-community/netinfo');
    expect(NI.fetch).not.toHaveBeenCalled();
  });
});
