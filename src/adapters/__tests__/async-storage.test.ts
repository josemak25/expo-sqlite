import { AsyncStorageAdapter } from '../async-storage';
import { createJob } from '../../utils/helpers';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

describe('AsyncStorageAdapter', () => {
  let adapter: AsyncStorageAdapter;

  beforeEach(async () => {
    adapter = new AsyncStorageAdapter();
    await adapter.deleteAll();
  });

  it('should add and retrieve a job', async () => {
    const job = createJob('test', { foo: 'bar' });
    await adapter.addJob(job);

    const retrieved = await adapter.getJob(job.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.id).toBe(job.id);
    expect(retrieved?.name).toBe(job.name);
    expect(retrieved?.payload).toEqual(job.payload);
  });

  it('should return all jobs', async () => {
    const job1 = createJob('test1', {});
    const job2 = createJob('test2', {});
    await adapter.addJob(job1);
    await adapter.addJob(job2);

    const all = await adapter.getJobs();
    expect(all).toHaveLength(2);
  });

  it('should update a job', async () => {
    const job = createJob('test', {});
    await adapter.addJob(job);

    job.active = true;
    job.attempts = 1;
    await adapter.updateJob(job);

    const updated = await adapter.getJob(job.id);
    expect(updated?.active).toBe(true);
    expect(updated?.attempts).toBe(1);
  });

  it('should remove a job', async () => {
    const job = createJob('test', {});
    await adapter.addJob(job);
    await adapter.removeJob(job);

    const retrieved = await adapter.getJob(job.id);
    expect(retrieved).toBeNull();
  });

  it('should fetch concurrent jobs and mark them active', async () => {
    const job1 = createJob('test', {}, { priority: 10 });
    const job2 = createJob('test', {}, { priority: 5 });
    await adapter.addJob(job1);
    await adapter.addJob(job2);

    const batch = await adapter.getConcurrentJobs(1);
    expect(batch).toHaveLength(1);
    if (batch[0]) {
      expect(batch[0].id).toBe(job1.id);
      expect(batch[0].active).toBe(true);
    }

    const nextBatch = await adapter.getConcurrentJobs(1);
    expect(nextBatch).toHaveLength(1);
    if (nextBatch[0]) {
      expect(nextBatch[0].id).toBe(job2.id);
    }
  });

  it('should clear all jobs', async () => {
    await adapter.addJob(createJob('test', {}));
    await adapter.deleteAll();
    const all = await adapter.getJobs();
    expect(all).toHaveLength(0);
  });

  it('should handle recover (reset active jobs)', async () => {
    const job = createJob('test', {});
    job.active = true;
    await adapter.addJob(job);

    await adapter.recover();
    const recovered = await adapter.getJob(job.id);
    expect(recovered?.active).toBe(false);
  });
});
