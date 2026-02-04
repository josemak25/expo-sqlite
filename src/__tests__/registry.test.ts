import { JobRegistry } from '../registry';
import { Worker } from '../worker';

describe('JobRegistry', () => {
  let registry: JobRegistry;

  beforeEach(() => {
    registry = new JobRegistry();
  });

  it('should register a worker', () => {
    const workerFn = jest.fn();
    registry.addWorker('test', workerFn);

    expect(registry.hasWorker('test')).toBe(true);
    const worker = registry.getWorker('test');
    expect(worker).toBeInstanceOf(Worker);
    expect(worker?.name).toBe('test');
  });

  it('should remove a worker', () => {
    registry.addWorker('test', jest.fn());
    expect(registry.hasWorker('test')).toBe(true);

    registry.removeWorker('test');
    expect(registry.hasWorker('test')).toBe(false);
    expect(registry.getWorker('test')).toBeUndefined();
  });

  it('should return undefined if worker does not exist', () => {
    expect(registry.getWorker('non-existent')).toBeUndefined();
    expect(registry.hasWorker('non-existent')).toBe(false);
  });

  it('should register worker with custom options', () => {
    const workerFn = jest.fn();
    const options = { concurrency: 5 };
    registry.addWorker('test', workerFn, options);

    const worker = registry.getWorker('test');
    expect(worker?.options.concurrency).toBe(5);
  });
});
