# WatermelonDB Adapter (Custom Implementation)

If your app uses [WatermelonDB](https://github.com/Nozbe/WatermelonDB) for reactive persistence, you can implement an adapter to store jobs in your existing database.

## Prerequisites

1.  A WatermelonDB setup (`Database`, `Collection`, etc.).
2.  A `Job` schema/model.

## Schema Definition

Define a table for jobs in your `schema.ts`:

```typescript
tableSchema({
  name: 'jobs',
  columns: [
    { name: 'name', type: 'string' },
    { name: 'payload', type: 'string' }, // JSON stringified
    { name: 'priority', type: 'number' },
    { name: 'active', type: 'boolean' },
    { name: 'failed', type: 'string', isOptional: true },
    { name: 'created_at', type: 'number' },
    // ... job meta data
  ],
});
```

## Adapter Implementation

Create `WatermelonAdapter.ts`:

```typescript
import { Database } from '@nozbe/watermelondb';
import type { Adapter, Job } from 'expo-queue';

export class WatermelonAdapter implements Adapter {
  constructor(private db: Database) {}

  async addJob<T>(job: Job<T>) {
    await this.db.write(async () => {
      await this.db.get('jobs').create((entry: any) => {
        entry.id = job.id;
        entry.name = job.name;
        entry.payload = JSON.stringify(job.payload);
        entry.priority = job.priority;
        entry.active = job.active;
        entry.created_at = new Date(job.created).getTime();
      });
    });
  }

  async getConcurrentJobs() {
    // Implement query: active=false, failed=null, sort by priority
    const entries = await this.db.get('jobs').query().fetch();
    return entries.map(this.mapEntryToJob);
  }

  // Implement updateJob, removeJob, etc. using this.db.write()
  // ...

  private mapEntryToJob(entry: any): Job<any> {
    return {
      id: entry.id,
      name: entry.name,
      payload: JSON.parse(entry.payload),
      // ... map other fields
    };
  }
}
```

## Usage

```typescript
import { Queue } from 'expo-queue';
import { database } from './your-db-setup';
import { WatermelonAdapter } from './WatermelonAdapter';

const queue = new Queue(new WatermelonAdapter(database));
```
