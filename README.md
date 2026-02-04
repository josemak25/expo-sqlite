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

## ↻ Job Lifecycle & Reliability

To prevent infinite retry loops and maintain a clean database, `expo-queue` implements robust lifecycle management.

### Max Attempts & Backoff

By default, jobs are attempted **once**. If they fail, they stop. You can enable retries with a backoff delay:

```typescript
queue.addJob('upload', payload, {
  attempts: 5, // Retry up to 5 times total
  timeInterval: 5000, // Wait 5 seconds between retries
});
```

### Auto-Cleanup (TTL)

To prevent "zombie jobs" from growing your database indefinitely, `expo-queue` enforces a **Time-To-Live (TTL)**.

- **Default**: **7 days**. Jobs older than 7 days are automatically removed, regardless of their state.
- **Custom**: You can increase or decrease this duration.
- **Infinite**: Set `ttl: 0` to never expire a job.

```typescript
// Keep for 30 days
queue.addJob('sync', payload, { ttl: 2592000000 });

// Keep forever (only deleted when completed)
queue.addJob('critical', payload, { ttl: 0 });
```

### Network Awareness

For jobs that require internet connectivity (e.g., API calls, uploads), you can mark them with `onlineOnly: true`.

1. **Install NetInfo**:

   ```bash
   npx expo install @react-native-community/netinfo
   ```

2. **Mark Network-Dependent Jobs**:

   ```typescript
   // This job requires network - will be skipped if offline
   queue.addJob('upload', payload, { onlineOnly: true });

   // This job runs regardless of network (e.g., local file operations)
   queue.addJob('processLocal', data); // onlineOnly is optional
   ```

**How it works:**

- **On-Demand Check**: Network status is checked **only when** a job with `onlineOnly: true` is about to run.
- **Skip if Offline**: If the device is offline, the job is skipped (not failed) and will be retried in the next processing cycle.
- **No Subscription**: The queue doesn't subscribe to network events globally. It checks on-demand, keeping resource usage minimal.
- **Default**: Jobs run regardless of connectivity unless explicitly marked with `onlineOnly: true`.

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

**QueueOptions:**

- `concurrency?: number` - Max concurrent jobs (default: 1).

#### Methods

| Method      | Signature                                                       | Description                                                                       |
| :---------- | :-------------------------------------------------------------- | :-------------------------------------------------------------------------------- |
| `addWorker` | `(name: string, fn: WorkerFn, options?: WorkerOptions) => void` | Registers a worker for a job type.                                                |
| `addJob`    | `<T>(name, payload, options?: JobOptions) => Promise<string>`   | Adds a job. Options: `priority`, `attempts`, `ttl`, `timeInterval`, `onlineOnly`. |
| `start`     | `() => Promise<void>`                                           | Starts processing the queue (auto-started by addJob).                             |
| `stop`      | `() => void`                                                    | Stops processing after current jobs finish.                                       |
| `on`        | `(event: Event, callback: Function) => void`                    | Listen for lifecycle events.                                                      |

#### Events

| Event        | Callback Signature                 | Description                                  |
| :----------- | :--------------------------------- | :------------------------------------------- |
| `'start'`    | `(job: Job) => void`               | Fired when a worker starts a job.            |
| `'success'`  | `(job: Job, result: any) => void`  | Fired when a job completes successfully.     |
| `'failure'`  | `(job: Job, error: Error) => void` | Fired when a job throws an error.            |
| `'complete'` | `(job: Job) => void`               | Fired when a job finishes (success or fail). |

### `Job` Interface

| Property       | Type             | Description                                       |
| :------------- | :--------------- | :------------------------------------------------ |
| `id`           | `string`         | Unique UUID.                                      |
| `name`         | `string`         | Worker name to match.                             |
| `payload`      | `T`              | Data passed to the worker.                        |
| `priority`     | `number`         | Higher numbers run first. Default `0`.            |
| `attempts`     | `number`         | Number of times tried.                            |
| `maxAttempts`  | `number`         | Max retries allowed. Default `1`.                 |
| `timeInterval` | `number`         | Delay between retries (ms). Default `0`.          |
| `ttl`          | `number`         | Time To Live (ms). Hard expiry. Default `7 days`. |
| `active`       | `boolean`        | `true` if currently running.                      |
| `timeout`      | `number`         | Max run time (ms). Default `25000`.               |
| `created`      | `string`         | ISO Date string.                                  |
| `failed`       | `string \| null` | ISO Date string if failed.                        |
| `metaData`     | `object`         | Custom metadata (e.g. error logs).                |

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
