import { Worker } from '../worker';
import { createJob } from '../utils/helpers';

describe('Worker', () => {
  it('should set busy flag during execution', async () => {
    let resolveWorker: (value: void | PromiseLike<void>) => void;
    const workerFn = jest.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveWorker = resolve;
        })
    );

    const worker = new Worker('test', workerFn);
    const job = createJob('test', {});

    const executionPromise = worker.execute(job);
    expect(worker.isBusy).toBe(true);

    // @ts-ignore
    resolveWorker();
    await executionPromise;
    expect(worker.isBusy).toBe(false);
  });

  it('should call lifecycle callbacks on success', async () => {
    const onStart = jest.fn();
    const onSuccess = jest.fn();
    const onFailure = jest.fn();
    const onComplete = jest.fn();

    const workerFn = jest.fn().mockResolvedValue(undefined);
    const worker = new Worker('test', workerFn, {
      onStart,
      onSuccess,
      onFailure,
      onComplete,
    });

    const job = createJob('test', { data: 123 });
    await worker.execute(job);

    expect(onStart).toHaveBeenCalledWith(job);
    expect(onSuccess).toHaveBeenCalledWith(job, null);
    expect(onFailure).not.toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalledWith(job);
    expect(workerFn).toHaveBeenCalledWith(job.id, job.payload);
  });

  it('should call lifecycle callbacks on failure', async () => {
    const onStart = jest.fn();
    const onSuccess = jest.fn();
    const onFailure = jest.fn();
    const onComplete = jest.fn();

    const error = new Error('Fail');
    const workerFn = jest.fn().mockRejectedValue(error);
    const worker = new Worker('test', workerFn, {
      onStart,
      onSuccess,
      onFailure,
      onComplete,
    });

    const job = createJob('test', {});
    await expect(worker.execute(job)).rejects.toThrow('Fail');

    expect(onStart).toHaveBeenCalledWith(job);
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onFailure).toHaveBeenCalledWith(job, error);
    expect(onComplete).toHaveBeenCalledWith(job);
  });
});
