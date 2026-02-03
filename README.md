# Expo Queue

A robust, flexible, and persistent queue system designed for React Native and Expo applications. Built with a focus on "local-first" architecture, allowing you to easily queue tasks, persist them to storage (SQLite by default), and process them with concurrency support.

## Features

- 🚀 **Persistent**: Jobs are saved to storage (SQLite supported out-of-the-box), surviving app restarts.
- 🔌 **Pluggable Storage**: Use the provided `SQLiteAdapter`, `MemoryAdapter` (for testing), or write your own adapter for any storage engine (MMKV, Realm, WatermelonDB, etc.).
- ⚡ **Concurrency**: Process multiple jobs simultaneously.
- ↺ **Retries**: Automatic retry logic for failed jobs.
- 🔍 **Prioritization**: Support for job priority.
- 🧩 **Worker Pattern**: Clean separation of job definition and execution logic.
- 📱 **Expo Compatible**: Built with `expo-sqlite` and TypeScript.

## Installation

```sh
yarn add expo-queue expo-sqlite
```

> Note: `expo-sqlite` is required for the default persistence adapter. If you plan to implement your own adapter (e.g., using MMKV), you may skip this dependency.

## Usage

### 1. Initialize the Queue

Create a single instance of the Queue in your app, usually in a provider or singleton service. You **must** pass a Storage Adapter to the queue.

```typescript
import { Queue, SQLiteAdapter } from 'expo-queue';

// Initialize the adapter (creates tables, etc.)
const adapter = new SQLiteAdapter({ dbName: 'my_app_queue.db' });

// Create the queue instance
const queue = new Queue(adapter, {
  concurrency: 4, // Process up to 4 jobs at once
});

// Initialize the queue (loads persisted jobs)
await queue.init();
```

### 2. Register Workers

Workers are functions responsible for processing specific job types. You should register them _before_ starting the queue processing.

```typescript
queue.addWorker('sync-access-log', async (id, payload) => {
  const { logId, timestamp } = payload;

  // Perform async operation
  await api.uploadAccessLog(logId, timestamp);

  // If this function throws, the job is marked as failed and will be retried (if configured).
  // If it returns successfully, the job is removed from the queue.
});

queue.addWorker('update-wallet', async (id, payload) => {
  await api.updateWalletBalance(payload.userId, payload.amount);
});
```

### 3. Add Jobs

Enqueue jobs from anywhere in your application.

```typescript
await queue.addJob(
  'sync-access-log',
  {
    logId: '123-abc',
    timestamp: Date.now(),
  },
  {
    priority: 1, // Higher runs sooner
    attempts: 3, // Retry 3 times on failure
    timeout: 5000, // Fail if takes longer than 5s
  }
);
```

### 4. Lifecycle Events

Listen to queue events to update your UI or log errors.

```typescript
queue.on('start', (job) => {
  console.log(`Job ${job.id} started`);
});

queue.on('success', (job) => {
  console.log(`Job ${job.id} completed successfully`);
});

queue.on('failure', (job, error) => {
  console.error(`Job ${job.id} failed:`, error);
});
```

## Custom Storage Adapters

The power of `expo-queue` lies in its storage-agnostic design. You can swap `SQLiteAdapter` for any other storage mechanism by implementing the `Adapter` interface.

### The Adapter Interface

```typescript
export interface Adapter {
  init(): Promise<void>;
  addJob(job: Job): Promise<void>;
  getConcurrentJobs(queueLifespanRemaining: number): Promise<Job[]>;
  updateJob(job: Job): Promise<void>;
  removeJob(job: Job): Promise<void>;
  getJob(id: string): Promise<Job | null>;
  getJobs(): Promise<Job[]>;
  deleteAll(): Promise<void>;
}
```

### Example: In-Memory Adapter

You can use the built-in `MemoryAdapter` for testing or non-persistent queues.

```typescript
import { Queue, MemoryAdapter } from 'expo-queue';

const queue = new Queue(new MemoryAdapter());
```

### Example: MMKV Adapter (Hypothetical)

```typescript
import { Adapter, Job } from 'expo-queue';
import { MMKV } from 'react-native-mmkv';

class MMKVAdapter implements Adapter {
  storage = new MMKV({ id: 'queue-storage' });

  async addJob(job: Job) {
    this.storage.set(job.id, JSON.stringify(job));
  }

  // ... implement other methods
}

const queue = new Queue(new MMKVAdapter());
```

## API Reference

### `Queue`

| Method | Description |
|Args|
|---|---|---|
| `constructor(adapter, options)` | Creates a new queue instance. | `adapter`: Storage Adapter, `options`: { concurrency: number } |
| `init()` | Initializes the adapter. Must be called before use. | |
| `addWorker(name, fn, options)` | Registers a worker function for a job name. | `name`: string, `fn`: async function, `options`: WorkerOptions |
| `addJob(name, payload, options)` | Adds a job to the queue. | `name`: string, `payload`: any, `options`: { priority, timeout, attempts } |
| `start()` | Starts processing the queue. | |
| `stop()` | Stops processing the queue (current jobs finish). | |

### `Job` Interface

| Property   | Type    | Description                 |
| ---------- | ------- | --------------------------- |
| `id`       | string  | Unique UUID                 |
| `name`     | string  | Job name                    |
| `payload`  | any     | Data passed to worker       |
| `priority` | number  | Priority level (default 0)  |
| `active`   | boolean | Is currently running        |
| `created`  | string  | ISO Date string             |
| `failed`   | string  | ISO Date string (if failed) |

## License

MIT
