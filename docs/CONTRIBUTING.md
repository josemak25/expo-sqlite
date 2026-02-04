# Contributing to Expo Queue

First off, thank you for considering contributing to `expo-queue`! It's people like you that make this a great tool for the React Native community.

## How to Contribute

To ensure a smooth process for everyone, we follow a simple workflow centered around our [Backlog](./BACKLOG.md).

### 1. Pick a Task

Go to the [Backlog](./BACKLOG.md) and find a task that isn't checked off. If you have a new idea that isn't on the list, please open an issue first to discuss it!

### 2. Set Up Your Environment

- Clone the repository.
- Run `yarn install` at the root.
- Ensure you have the `expo-queue-example` running to verify your changes in a real app.

### 3. Implement Your Changes

- **Modular Design**: Follow the [Architecture Blueprint](./ARCHITECTURE.md). Decouple logic into specialized modules instead of bloating the main `Queue` class.
- **SOLID Principles**: Keep code functional and respect the single-responsibility principle.
- **Tests**: Every new feature or fix MUST include tests. Add or update tests in `src/__tests__/queue.test.ts`.

### 4. Open a Pull Request (PR)

When your changes are ready:

- Open a PR with a clear description of what you've done.
- Reference the Task ID from the backlog (e.g., `Ref: Task 001`).
- Ensure all tests pass by running `yarn test`.

### 5. Finalize the Backlog

Once your PR is merged, update the [Backlog](./BACKLOG.md) by checking off the corresponding task.

## Code Style & Principles

- Use TypeScript for everything.
- Prefer functional patterns over heavy class-based inheritance where possible.
- Adhere to the DRY (Don't Repeat Yourself) principle.
- Keep the `Adapter` interface clean; performance happens in the adapter, but logic stays in the core.

Thank you for helping us make `expo-queue` robust and performant!
