# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial implementation of react-native-task-queue
- SQLite adapter for persistent storage with atomic claiming
- AsyncStorage adapter for lightweight persistence
- In-memory adapter for testing
- Exponential backoff with jitter for retry logic
- Dead Letter Queue (DLQ) support for failed jobs
- Named queue control (pause/resume specific jobs)
- Network-aware processing with online/offline detection
- TypeScript support with full type safety and generics
- Comprehensive test suite with Jest
- Example app demonstrating usage patterns

### Features

- **Storage Agnostic**: Switch between In-Memory, AsyncStorage, SQLite, or Custom adapters
- **Modular Architecture**: Decoupled Registry, Processor, Executor, and Store
- **Strictly Type Safe**: First-class TypeScript support with Generics for payloads and events
- **Advanced Retry Logic**: Exponential Backoff + randomized Jitter + Dead Letter Queue (DLQ)
- **Granular Control**: Pause/Resume specific job types
- **Mobile Optimized**: Auto-recovery from crashes, network-aware processing, memory-efficient pagination

### Documentation

- README with architecture overview and quick start guide
- API reference documentation
- Custom adapter implementation guides (MMKV, WatermelonDB)
- Contributing guidelines
- Code of conduct
- NPM publishing guide

## [0.1.0] - 2026-02-06

### Added

- Initial release

[Unreleased]: https://github.com/josemak25/react-native-task-queue/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/josemak25/react-native-task-queue/releases/tag/v0.1.0
