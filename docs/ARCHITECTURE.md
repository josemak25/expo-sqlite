# System Architecture: Expo Queue

This document outlines the architectural philosophy and structural design of `expo-queue`, drawing inspiration from industrial messaging systems like Kafka and RabbitMQ while optimizing for the mobile environment.

## 🏛️ Design Philosophy

`expo-queue` is moving from a monolithic structure to a **modular, decoupled architecture**. This approach ensures code quality, maintainability, and high performance.

### Core Principles

- **Separation of Concerns**: Each component has a single, well-defined responsibility.
- **SOLID Design**:
  - _Single Responsibility_: Classes are split into Logic, Storage, and Execution.
  - _Open/Closed_: Adapters allow extending storage backends without modifying core logic.
  - _Dependency Inversion_: The queue depends on an `Adapter` interface, not a concrete implementation.
- **Atomic Operations**: Critical state changes (like "claiming" a job) are designed to be atomic at the storage layer to prevent race conditions.

## 🏗️ Modular Component Breakdown

The system is organized into specialized functional units:

### 1. Job Registry

- **Responsibility**: Manages the mapping of job names to worker functions.
- **Key Logic**: Registration (`addWorker`) and lookups.

### 2. Job Store (Adapters)

- **Responsibility**: Pure persistence and retrieval.
- **Key Logic**: CRUD operations, atomic "claiming" of jobs, and memory-efficient fetching (LIMIT).
- **Backends**: SQLite, AsyncStorage, Memory.

### 3. Job Processor (Orchestrator)

- **Responsibility**: Handles the overall processing loop, concurrency limits, and scheduling.
- **Key Logic**: TTL checks, online-only checks, and backoff timing.

### 4. Job Executor

- **Responsibility**: Manages the lifecycle of a single job execution.
- **Key Logic**: Success/Failure handling, retry incrementing, and event emission (`start`, `success`, `failure`).

## 🚀 Comparison with Industrial Systems

| Feature                 | Kafka / RabbitMQ                    | `expo-queue` (New Modular Design)     |
| :---------------------- | :---------------------------------- | :------------------------------------ |
| **Logic/Storage Split** | Decoupled Brokers and Workers.      | Decoupled Store and Processor.        |
| **Atomic Claiming**     | Consumer group offsets / basic.ack. | Atomic `active=1` updates via Store.  |
| **Visibility**          | Consumer lag monitoring.            | Real-time events + SQLite inspection. |
| **Failure Handling**    | Dead Letter Exchanges (DLX).        | Max attempts + Retry lifecycle.       |

## 🔋 Mobile Optimizations

- **Battery Performance**: Use of exponential backoff to avoid aggressive polling during failures.
- **Memory Footprint**: Strict use of `LIMIT` in database queries to keep the process memory small.
- **Crash Recovery**: "Ghost Job Cleanup" on startup to reset jobs stuck in an `active` state due to app crashes.

---

> [!TIP]
> This modular structure makes `expo-queue` not just a utility, but a scalable framework for background task management in React Native.
