# expo-queue

A robust, flexible job queue system for Expo and React Native apps.

## Features

- 🎯 **Storage Agnostic**: switch between In-Memory, AsyncStorage, SQLite, or Custom adapters.
- 🔄 **Lifecycle Events**: `start`, `success`, `failure`, `complete` events.
- 🚦 **Concurrency**: Global and per-worker concurrency limits.
- 🏗 **Type Safe**: First-class TypeScript support with Generics.
- 📱 **Expo Compatible**: Works seamlessly with Expo and standard React Native.

## Installation

### Core Package

```bash
yarn add expo-queue
```

## Quick Start (In-Memory)

By default, `expo-queue` uses an **In-Memory Adapter**. This is perfect for testing or jobs that don't need to persist across app restarts.

```typescript
import { Queue } from 'expo-queue';

// 1. Create the Queue (defaults to memory)
const queue = new Queue();

// 2. Add a Worker
queue.addWorker('upload', async (id, payload) => {
  console.log('Uploading:', payload.uri);
});

// 3. Add a Job
await queue.addJob('upload', { uri: 'image.jpg' });
```

---

## 💾 Persistent Storage Options

If you need jobs to survive app restarts, you must choose a persistent adapter.

### Level 1: Lightweight Persistence (AsyncStorage)

Good for general use cases. Uses `@react-native-async-storage/async-storage`.

1. **Install Dependency**:

   ```bash
   yarn add @react-native-async-storage/async-storage
   ```

2. **Usage**:

   ```typescript
   import { Queue } from 'expo-queue';
   import { AsyncStorageAdapter } from 'expo-queue/async-storage';

   const queue = new Queue(new AsyncStorageAdapter());

   queue.addWorker('sync', async (id, payload) => {
     /* ... */
   });
   ```

### Level 2: Heavyweight Persistence (SQLite)

Recommended for heavy background processing, large job lists, or where atomicity is critical. Uses `expo-sqlite`.

1. **Install Peer Dependency**:

   ```bash
   npx expo install expo-sqlite
   ```

2. **Usage**:
   Import from the `sqlite` subpath.

   ```typescript
   import { Queue } from 'expo-queue';
   import { SQLiteAdapter } from 'expo-queue/sqlite';

   // Create the adapter (opens/creates 'worker.db')
   const adapter = new SQLiteAdapter('worker.db');

   // Initialize Queue
   const queue = new Queue(adapter);

   queue.addWorker('worker', async (id, payload) => { ... });
   ```

### Level 3: High-Performance / Custom

For ultra-fast synchronous storage (`MMKV`) or reactive databases (`WatermelonDB`).

- **MMKV**: [Read the MMKV Adapter Guide](./docs/adapter-mmkv.md)
- **WatermelonDB**: [Read the WatermelonDB Adapter Guide](./docs/adapter-watermelondb.md)

---

## API

### `Queue` Class

```typescript
import { Queue } from 'expo-queue';
const queue = new Queue(adapter, options);
```

| Parameter | Type           | Default         | Description                          |
| :-------- | :------------- | :-------------- | :----------------------------------- |
| `adapter` | `Adapter`      | `MemoryAdapter` | (Optional) Storage adapter instance. |
| `options` | `QueueOptions` | `{}`            | (Optional) Configuration options.    |

#### Methods

| Method      | Signature                                                                | Description                                           |
| :---------- | :----------------------------------------------------------------------- | :---------------------------------------------------- |
| `addWorker` | `(name: string, fn: WorkerFn, options?: WorkerOptions) => void`          | Registers a worker for a job type.                    |
| `addJob`    | `<T>(name: string, payload: T, options?: JobOptions) => Promise<string>` | Adds a job to the queue. Returns Job ID.              |
| `start`     | `() => Promise<void>`                                                    | Starts processing the queue (auto-started by addJob). |
| `stop`      | `() => void`                                                             | Stops processing after current jobs finish.           |
| `on`        | `(event: Event, callback: Function) => void`                             | Listen for lifecycle events.                          |

#### Events

| Event        | Callback Signature                 | Description                                  |
| :----------- | :--------------------------------- | :------------------------------------------- |
| `'start'`    | `(job: Job) => void`               | Fired when a worker starts a job.            |
| `'success'`  | `(job: Job, result: any) => void`  | Fired when a job completes successfully.     |
| `'failure'`  | `(job: Job, error: Error) => void` | Fired when a job throws an error.            |
| `'complete'` | `(job: Job) => void`               | Fired when a job finishes (success or fail). |

### `Job` Interface

| Property   | Type             | Description                            |
| :--------- | :--------------- | :------------------------------------- |
| `id`       | `string`         | Unique UUID.                           |
| `name`     | `string`         | Worker name to match.                  |
| `payload`  | `T`              | Data passed to the worker.             |
| `priority` | `number`         | Higher numbers run first. Default `0`. |
| `attempts` | `number`         | Number of times tried.                 |
| `active`   | `boolean`        | `true` if currently running.           |
| `timeout`  | `number`         | Max run time (ms). Default `25000`.    |
| `created`  | `string`         | ISO Date string.                       |
| `failed`   | `string \| null` | ISO Date string if failed.             |
| `metaData` | `object`         | Custom metadata (e.g. error logs).     |

### `WorkerOptions`

| Property      | Type                 | Default | Description                            |
| :------------ | :------------------- | :------ | :------------------------------------- |
| `concurrency` | `number`             | `1`     | Max concurrent jobs for _this_ worker. |
| `onStart`     | `(job) => void`      | -       | Worker-specific start hook.            |
| `onSuccess`   | `(job, res) => void` | -       | Worker-specific success hook.          |
| `onFailure`   | `(job, err) => void` | -       | Worker-specific failure hook.          |

## Contributing

See the [contributing guide](CONTRIBUTING.md).

## License

MIT
