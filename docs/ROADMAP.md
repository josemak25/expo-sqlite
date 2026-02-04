This document outlines the planned improvements for `expo-queue`, prioritized by impact on reliability, performance, and developer experience.

For a detailed analysis of the current architecture and its comparison to industrial systems, see [ARCHITECTURE.md](./ARCHITECTURE.md).

## 🏗️ High Priority: Reliability & Core Performance

- [ ] **Atomic Job Claiming**: Move from "check then act" to atomic "claim" operations in adapters to prevent race conditions.
- [ ] **Memory-Efficient Fetching**: Implement `LIMIT` in all `getConcurrentJobs` calls to prevent OOM (Out of Memory) issues with large queues.
- [ ] **Ghost Job Cleanup**: Automatically reset "active" jobs that were interrupted by an app crash or hard kill on startup.
- [ ] **Modular Architecture**: Decouple the `Queue` class into specialized, functional components (Scheduler, Executor, Store) to improve testability and readability.
- [ ] **SOLID & DRY Principles**: Refactor the codebase to ensure separation of concerns, making it easier for developers to contribute and extend.
- [ ] **Industrial Architecture Patterns**: Adopt patterns from robust systems (Kafka/RabbitMQ) for job lifecycles and state management.

## 🔋 Medium Priority: Efficiency & Resilience

- [ ] **Exponential Backoff**: Implement increasing wait times between retries ($2^n$) to preserve battery and server health.
- [ ] **Jitter**: Add randomized delay to retries to prevent "thundering herd" scenarios on backends.
- [ ] **Visibility Timeouts**: Allow jobs to be "re-queued" if they take too long without reporting success or failure.
- [ ] **Network State Streaming**: Instead of polling `NetInfo.fetch()`, subscribe to connectivity changes for reactive processing.

## 🛠️ Low Priority: DX & Features

- [ ] **Enhanced Generic Typing**: Ensure strict type flow from `addWorker` to success/failure callbacks.
- [ ] **Dead Letter Queue (DLQ)**: Add a specific event/storage for jobs that have exhausted all retries.
- [ ] **Pause/Resume by Name**: Allow pausing specific types of jobs while others continue.
- [ ] **Persistence for MemoryAdapter**: (Optional) Allow serializing MemoryAdapter state to a local file for lightweight persistence.
