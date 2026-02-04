# WatermelonDB Adapter Guide

[WatermelonDB](https://github.com/Nozbe/WatermelonDB) is a reactive database for React Native. Using WatermelonDB as an adapter allows you to store jobs in your existing reactive schema, enabling features like real-time UI updates for job progress.

## 1. Schema Definition

First, add a `jobs` table to your WatermelonDB schema. Ensure you include all necessary job properties:

```typescript
// schema.ts
import { appSchema, tableSchema } from '@nozbe/watermelondb';

export default appSchema({
  version: 1,
  tables: [
    tableSchema({
      name: 'jobs',
      columns: [
        { name: 'name', type: 'string' },
        { name: 'payload', type: 'string' }, // Stringified JSON
        { name: 'data', type: 'string' }, // Stringified JobOptions JSON
        { name: 'priority', type: 'number' },
        { name: 'active', type: 'boolean' },
        { name: 'timeout', type: 'number' },
        { name: 'created', type: 'string' },
        { name: 'failed', type: 'string', isOptional: true },
      ],
    }),
  ],
});
```

## 2. Model Setup

Create a `JobModel.ts` to represent the job in WatermelonDB:

```typescript
// JobModel.ts
import { Model } from '@nozbe/watermelondb';
import { field, text } from '@nozbe/watermelondb/decorators';

export default class JobModel extends Model {
  static table = 'jobs';

  @text('name') name!: string;
  @text('payload') payload!: string;
  @text('data') data!: string;
  @field('priority') priority!: number;
  @field('active') active!: boolean;
  @field('timeout') timeout!: number;
  @text('created') created!: string;
  @text('failed') failed?: string | null;
}
```

## 3. Adapter Implementation

Create `WatermelonAdapter.ts`. This adapter handles the mapping between the `expo-queue` `Job` interface and the WatermelonDB `JobModel`.

```typescript
import { Database, Q } from '@nozbe/watermelondb';
import { Adapter, Job, omit, pick, JobOptions } from 'expo-queue';
import JobModel from './JobModel'; // Path to your model

/**
 * A reactive WatermelonDB adapter for expo-queue.
 */
export class WatermelonAdapter implements Adapter {
  constructor(private db: Database) {}

  /**
   * Adds a new job to the WatermelonDB store.
   * @param job - The job to persist.
   */
  async addJob<T = unknown>(job: Job<T>): Promise<void> {
    await this.db.write(async () => {
      await this.db.get<JobModel>('jobs').create((entry) => {
        entry._raw.id = job.id; // Preserve original UUID
        entry.name = job.name;
        entry.payload = JSON.stringify(job.payload);
        entry.data = JSON.stringify(
          pick(job, [
            'attempts',
            'maxAttempts',
            'timeInterval',
            'ttl',
            'onlineOnly',
            'metaData',
          ])
        );
        entry.priority = job.priority;
        entry.active = job.active;
        entry.timeout = job.timeout;
        entry.created = job.created;
        entry.failed = job.failed || null;
      });
    });
  }

  /**
   * Retrieves a batch of jobs that are ready for processing.
   * Atomic within a database transaction.
   * @param limit - Maximum number of jobs to fetch.
   */
  async getConcurrentJobs(limit: number = 1): Promise<Job<unknown>[]> {
    const entries = await this.db
      .get<JobModel>('jobs')
      .query(
        Q.where('active', false),
        Q.where('failed', Q.eq(null)),
        Q.sortBy('priority', Q.desc),
        Q.sortBy('created', Q.asc),
        Q.take(limit)
      )
      .fetch();

    // Mark as active atomically within a transaction
    await this.db.write(async () => {
      await this.db.batch(
        entries.map((entry) =>
          entry.prepareUpdate((e) => {
            e.active = true;
          })
        )
      );
    });

    return entries.map(this.mapEntryToJob);
  }

  /**
   * Updates an existing job's state in the database.
   * @param job - The job with updated properties.
   */
  async updateJob<T = unknown>(job: Job<T>): Promise<void> {
    const entry = await this.db.get<JobModel>('jobs').find(job.id);
    await this.db.write(async () => {
      await entry.update((e) => {
        e.active = job.active;
        e.failed = job.failed || null;
        e.data = JSON.stringify(
          pick(job, [
            'attempts',
            'maxAttempts',
            'timeInterval',
            'ttl',
            'onlineOnly',
            'metaData',
          ])
        );
      });
    });
  }

  /**
   * Permanently removes a job from the database.
   * @param job - The job to delete.
   */
  async removeJob<T = unknown>(job: Job<T>): Promise<void> {
    const entry = await this.db.get<JobModel>('jobs').find(job.id);
    await this.db.write(async () => {
      await entry.destroyPermanently();
    });
  }

  /**
   * Retrieves a specific job by its UUID.
   * @param id - The job identifier.
   */
  async getJob(id: string): Promise<Job<unknown> | null> {
    try {
      const entry = await this.db.get<JobModel>('jobs').find(id);
      return this.mapEntryToJob(entry);
    } catch {
      return null;
    }
  }

  /**
   * Retrieves all jobs currently in the list.
   */
  async getJobs(): Promise<Job<unknown>[]> {
    const entries = await this.db.get<JobModel>('jobs').query().fetch();
    return entries.map(this.mapEntryToJob);
  }

  /**
   * Clears the entire jobs table.
   */
  async deleteAll(): Promise<void> {
    await this.db.write(async () => {
      const entries = await this.db.get<JobModel>('jobs').query().fetch();
      await this.db.batch(entries.map((e) => e.prepareDestroyPermanently()));
    });
  }

  /**
   * Crash Recovery: Resets all stuck 'active' jobs to an inactive state.
   */
  async recover(): Promise<void> {
    const entries = await this.db
      .get<JobModel>('jobs')
      .query(Q.where('active', true))
      .fetch();
    await this.db.write(async () => {
      await this.db.batch(
        entries.map((e) =>
          e.prepareUpdate((j) => {
            j.active = false;
          })
        )
      );
    });
  }

  /**
   * Internal mapper that converts a WatermelonDB model to a clean Job object.
   * Uses modern spread and omit patterns to reduce boilerplate.
   */
  private mapEntryToJob(entry: JobModel): Job<unknown> {
    const data = JSON.parse(entry.data || '{}') as JobOptions & {
      maxAttempts?: number;
    };

    return {
      ...omit(entry, ['data']),
      ...data,
      id: entry.id, // Explicitly map UUID
      payload: JSON.parse(entry.payload),
      active: !!entry.active,
      attempts: data.attempts ?? 0,
      maxAttempts: data.maxAttempts || 1,
      timeInterval: data.timeInterval || 0,
      ttl: data.ttl || 1000 * 60 * 60 * 24 * 7,
    } as Job<unknown>;
  }
}
```

## Setup & Usage

Pass your WatermelonDB `Database` instance to the adapter:

```typescript
import { Queue } from 'expo-queue';
import { database } from './your-watermelondb-setup';
import { WatermelonAdapter } from './WatermelonAdapter';

const adapter = new WatermelonAdapter(database);
const queue = new Queue(adapter);
```
