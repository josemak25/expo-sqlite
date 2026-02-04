# expo-queue

A robust, flexible, and type-safe job queue system for Expo and React Native apps. Designed for reliability, memory efficiency, and high developer experience.

## ✨ Features

- 🎯 **Storage Agnostic**: switch between In-Memory, AsyncStorage, SQLite, or Custom adapters.
- 🏗 **Modular Architecture**: Decoupled Registry, Processor, Executor, and Store.
- 🏗 **Strictly Type Safe**: First-class TypeScript support with Generics for payloads and events.
- � **Advanced Retry Logic**: Exponential Backoff + randomized Jitter + Dead Letter Queue (DLQ).
- 🚦 **Granular Control**: Pause/Resume specific job types (Named Queue Control).
- 📱 **Mobile Optimized**: Auto-recovery from crashes, network-aware processing, and memory-efficient pagination.

---

## 🏗 Architecture Overview

`expo-queue` follows a modular design inspired by industrial messaging systems, optimized for the mobile environment.

- **Job Registry**: Manages worker registrations and job-to-worker mapping.
- **Job Processor**: The central orchestrator handling concurrency, backoff windows, and scheduling loops.
- **Job Executor**: Manages the lifecycle of a single job attempt (Timeout, Success, Failure).
- **Storage Adapters**: A lean persistence layer. Customizing storage is as simple as implementing the `Adapter` interface.

---

## 🚀 Quick Start

### 1. Installation

```bash
yarn add expo-queue uuid
npx expo install expo-sqlite # Optional: for SQLite persistence
```

### 2. Basic Setup (In-Memory)

```typescript
import { Queue } from 'expo-queue';

// 1. Initialize the Queue
const queue = new Queue();

// 2. Register a Worker
queue.addWorker('email-sync', async (id, payload) => {
  console.log(`Syncing email for ${payload.userEmail}`);
  // Return value is stored in the 'success' event
});

// 3. Add a Job
await queue.addJob('email-sync', { userEmail: 'hi@example.com' });
```

---

## 💾 Storage & Persistence

Choose the persistence layer that fits your app's needs.

### SQLite (Recommended)

Atomic, reliable, and highly performant. Best for critical background tasks.

```typescript
import { Queue } from 'expo-queue';
import { SQLiteAdapter } from 'expo-queue/sqlite';

const adapter = new SQLiteAdapter('app-queue.db');
const queue = new Queue(adapter);
```

### AsyncStorage

Good for lightweight, non-critical persistence.

```typescript
import { AsyncStorageAdapter } from 'expo-queue/async-storage';
const queue = new Queue(new AsyncStorageAdapter());
```

---

## 🛠 Advanced Features

### 1. Exponential Backoff & Jitter

Prevent overwhelming your backend during outages.

```typescript
queue.addJob('sync', data, {
  attempts: 5,
  timeInterval: 2000, // Bases delay: 2s, 4s, 8s, 16s... + Jitter
});
```

### 2. Dead Letter Queue (DLQ)

Move terminally failed jobs to a DLQ for later inspection.

```typescript
// If the adapter supports moveToDLQ, it happens automatically after maxAttempts
queue.on('failed', (job, error) => {
  console.error(`Job ${job.id} permanently failed:`, error);
});
```

### 3. Named Queue Control

Pause or resume execution for specific job types without stopping the whole queue.

```typescript
queue.pauseJob('heavy-sync');
// Later...
queue.resumeJob('heavy-sync');
```

---

## 🧪 Custom Adapters

`expo-queue` is designed to be easily extensible. All core logic (retries, backoff, TTL, concurrency) is decoupled from storage, so you only need to implement a "dumb" persistence layer.

### Implementation Guides

For full, production-ready implementations of custom adapters, see our detailed guides:

- [**MMKV Adapter Guide**](./docs/adapter-mmkv.md) - Ultra-fast synchronous key-value storage.
- [**WatermelonDB Adapter Guide**](./docs/adapter-watermelondb.md) - Reactive SQLite-based persistence.

---

## 🔧 API Reference

### `Queue<T = unknown>`

Main entry point.

| Method                             | Description                            |
| :--------------------------------- | :------------------------------------- |
| `addJob(name, payload, options)`   | Adds a job with custom `JobOptions`.   |
| `addWorker(name, fn, options)`     | Registers a worker.                    |
| `pauseJob(name) / resumeJob(name)` | Pauses/Resumes execution per job name. |
| `on(event, callback)`              | Strictly typed event listeners.        |

### `JobOptions`

| Property       | Default  | Description                        |
| :------------- | :------- | :--------------------------------- |
| `priority`     | `0`      | Higher numbers run first.          |
| `attempts`     | `1`      | Max attempts before moving to DLQ. |
| `timeInterval` | `0`      | Base retry delay in ms.            |
| `ttl`          | `7 days` | Hard expiry (ms).                  |
| `onlineOnly`   | `false`  | Only run when device is connected. |

---

## 🔋 Performance & Reliability

- **Atomic Claiming**: SQLite and other adapters use row-level locking or transactions to prevent duplicate processing.
- **Memory Safety**: Uses memory-efficient pagination even if you have 10,000 jobs in the queue.
- **Crash Recovery**: Auto-resets "ghost jobs" (active jobs from a previous session) on startup.

## License

MIT

---

Built with ❤️ by [Amakiri Joseph](https://github.com/josemak25)
