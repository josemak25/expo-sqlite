import EventEmitter from 'eventemitter3';
import { JobExecutor } from '../executor';
import { Worker } from '../worker';
import { createJob } from '../utils/helpers';
import type { Adapter } from '../types';
import { MemoryAdapter } from '../jest/mock';

describe('JobExecutor', () => {
  let executor: JobExecutor;
  let adapter: jest.Mocked<Adapter>;
  let emitter: EventEmitter;

  beforeEach(() => {
    adapter = new MemoryAdapter() as jest.Mocked<Adapter>;
    emitter = new EventEmitter();
    executor = new JobExecutor({ adapter, emitter });
  });

  it('should execute job successfully', async () => {
    const job = createJob('test', { foo: 'bar' });
    const workerFn = jest.fn().mockResolvedValue(undefined);
    const worker = new Worker('test', workerFn);

    const startSpy = jest.fn();
    const successSpy = jest.fn();
    emitter.on('start', startSpy);
    emitter.on('success', successSpy);

    await executor.execute(job, worker);

    expect(job.active).toBe(true);
    expect(adapter.updateJob).toHaveBeenCalledWith(job);
    expect(workerFn).toHaveBeenCalledWith(job.id, job.payload);
    expect(adapter.removeJob).toHaveBeenCalledWith(job);
    expect(startSpy).toHaveBeenCalledWith(job);
    expect(successSpy).toHaveBeenCalledWith(job);
  });

  it('should handle job failure and retry', async () => {
    const job = createJob('test', {}, { attempts: 3 }); // 3 max attempts
    const error = new Error('Worker crash');
    const workerFn = jest.fn().mockRejectedValue(error);
    const worker = new Worker('test', workerFn);

    const failureSpy = jest.fn();
    emitter.on('failure', failureSpy);

    await executor.execute(job, worker);

    expect(job.attempts).toBe(1);
    expect(job.active).toBe(false);
    expect(job.failed).toBeDefined();
    expect(job.metaData?.lastError).toBe('Worker crash');
    expect(adapter.updateJob).toHaveBeenCalledTimes(2); // Start and Fail
    expect(failureSpy).toHaveBeenCalledWith(job, error);
    expect(adapter.moveToDLQ).not.toHaveBeenCalled();
  });

  it('should move to DLQ when max attempts exceeded', async () => {
    const job = createJob('test', {}, { attempts: 1 }); // 1 max attempt
    const error = new Error('Fatal crash');
    const workerFn = jest.fn().mockRejectedValue(error);
    const worker = new Worker('test', workerFn);

    const failedSpy = jest.fn();
    emitter.on('failed', failedSpy);

    await executor.execute(job, worker);

    expect(job.attempts).toBe(1);
    expect(failedSpy).toHaveBeenCalledWith(job, error);
    expect(adapter.moveToDLQ).toHaveBeenCalledWith(job);
  });

  it('should call onFailed worker callback', async () => {
    const onFailed = jest.fn();
    const job = createJob('test', {}, { attempts: 1 });
    const error = new Error('Fatal');
    const worker = new Worker('test', jest.fn().mockRejectedValue(error), {
      onFailed,
    });

    await executor.execute(job, worker);

    expect(onFailed).toHaveBeenCalledWith(job, error);
  });
});
