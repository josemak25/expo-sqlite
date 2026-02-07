import { EventEmitter } from 'eventemitter3';
import type { Adapter } from '../types';

// Use official NetInfo mock
jest.mock('@react-native-community/netinfo', () =>
  require('@react-native-community/netinfo/jest/netinfo-mock.js')
);

export class Queue extends EventEmitter {
  constructor(_adapter?: Adapter, _options?: unknown) {
    super();
  }

  stop = jest.fn();

  pauseJob = jest.fn();

  addWorker = jest.fn();

  resumeJob = jest.fn();

  removeWorker = jest.fn();

  start = jest.fn().mockResolvedValue(undefined);

  addJob = jest.fn().mockResolvedValue('mock-job-id');
}

class BaseMockAdapter implements Adapter {
  getJobs = jest.fn().mockResolvedValue([]);

  getJob = jest.fn().mockResolvedValue(null);

  addJob = jest.fn().mockResolvedValue(undefined);

  recover = jest.fn().mockResolvedValue(undefined);

  updateJob = jest.fn().mockResolvedValue(undefined);

  removeJob = jest.fn().mockResolvedValue(undefined);

  deleteAll = jest.fn().mockResolvedValue(undefined);

  moveToDLQ = jest.fn().mockResolvedValue(undefined);

  getConcurrentJobs = jest.fn().mockResolvedValue([]);
}

export class MemoryAdapter extends BaseMockAdapter {}

export class SQLiteAdapter extends BaseMockAdapter {
  constructor(_dbName?: string, _tableName?: string) {
    super();
  }
}

export class AsyncStorageAdapter extends BaseMockAdapter {
  constructor(_key?: string) {
    super();
  }
}
