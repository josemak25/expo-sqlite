# Project Backlog

This backlog contains actionable tasks to improve `expo-queue`. Tasks are prioritized to guide development. Use this list to pick your next contribution!

## 🔴 High Priority: Core & Reliability

_Critical improvements to ensure data integrity and system stability._

- [ ] **Task 001: Modular Architecture Refactor**
  - **Goal**: Decompose `Queue.ts` into specialized units.
  - **Scope**: Create `Registry`, `Store`, `Processor`, and `Executor`.
  - **Status**: Ready for implementation.
- [ ] **Task 002: Atomic Job Claiming (SQLite)**
  - **Goal**: Prevent race conditions where multiple processes pick the same job.
  - **Scope**: Update `SQLiteAdapter` to use transactions or `UPDATE ... RETURNING`.
- [ ] **Task 003: Memory-Efficient Fetching (Pagination)**
  - **Goal**: Prevent OOM crashes on large queues.
  - **Scope**: Add `LIMIT` support to all adapter `getConcurrentJobs` implementations.
- [ ] **Task 004: Ghost Job Cleanup**
  - **Goal**: Recover from app crashes where jobs were left in an `active` state.
  - **Scope**: Add a startup routine to reset interrupted jobs.

## 🟡 Medium Priority: Efficiency & Resilience

_Optimizations for battery life, network, and system health._

- [ ] **Task 005: Exponential Backoff**
  - **Goal**: Avoid draining battery and hammering servers during failures.
  - **Scope**: Implement $2^n$ wait times between retries.
- [ ] **Task 006: Jitter Implementation**
  - **Goal**: Prevent "thundering herd" effect on backend services.
  - **Scope**: Add randomized variance to retry intervals.
- [ ] **Task 007: Reactive Network State**
  - **Goal**: Respond immediately to network changes.
  - **Scope**: Move from polling `NetInfo.fetch()` to subscribing via `NetInfo.addEventListener`.

## 🟢 Low Priority: Developer Experience (DX)

_Improving the library's usability and feature richness._

- [ ] **Task 008: Strict Generic Typing**
  - **Goal**: Type safety from job creation to callback.
  - **Scope**: Flow payload generics through all events and worker options.
- [ ] **Task 009: Dead Letter Queue (DLQ)**
  - **Goal**: Separate persistence for permanently failed jobs.
  - **Scope**: Add a storage layer for jobs that exhaust all `maxAttempts`.
- [ ] **Task 010: Named Queue Control (Pause/Resume)**
  - **Goal**: Granular control over job processing.
  - **Scope**: Allow pausing specific job names while others proceed.

---

> [!NOTE]
> When starting a task, please open a PR and reference the Task ID. See [CONTRIBUTING.md](./CONTRIBUTING.md) for details.
