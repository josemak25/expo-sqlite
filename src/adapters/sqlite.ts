import * as SQLite from 'expo-sqlite';
import type { Adapter, Job, JobRow, JobOptions } from '../types';
import { omit, pick } from '../utils/helpers';

export class SQLiteAdapter implements Adapter {
  private db: SQLite.SQLiteDatabase;
  private tableName: string;
  private initPromise: Promise<void>;

  constructor(dbName: string = 'queue.db', tableName: string = 'queue_jobs') {
    this.tableName = tableName;
    // Synchronously open the loop, standard for expo-sqlite now
    this.db = SQLite.openDatabaseSync(dbName);
    this.initPromise = this.init();
  }

  private async init(): Promise<void> {
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        payload TEXT NOT NULL,
        data TEXT,
        priority INTEGER DEFAULT 0,
        active INTEGER DEFAULT 0,
        timeout INTEGER DEFAULT 25000,
        created TEXT NOT NULL,
        failed TEXT
      );
    `);
  }

  async addJob<T = unknown>(job: Job<T>): Promise<void> {
    await this.initPromise;
    await this.db.runAsync(
      `INSERT OR REPLACE INTO ${this.tableName} (id, name, payload, data, priority, active, timeout, created, failed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        job.id,
        job.name,
        JSON.stringify(job.payload),
        JSON.stringify(
          pick(job, [
            'ttl',
            'metaData',
            'attempts',
            'workerName',
            'onlineOnly',
            'maxAttempts',
            'timeInterval',
          ])
        ),
        job.priority,
        job.active ? 1 : 0,
        job.timeout,
        job.created,
        job.failed || null,
      ]
    );
  }

  async getConcurrentJobs(limit: number = 1): Promise<Job<unknown>[]> {
    await this.initPromise;

    let jobs: Job<unknown>[] = [];

    // Use an EXCLUSIVE transaction.
    // 1. SELECT items that are currently idle (active=0).
    // 2. Immediately mark them as active=1 within the same transaction lock.
    // This guarantees that no other thread/process can read these same rows
    // before we have claimed them, preventing double-processing.
    await this.db.withExclusiveTransactionAsync(async (tx) => {
      const result = await tx.getAllAsync<JobRow>(
        `SELECT * FROM ${this.tableName} WHERE active = 0 ORDER BY priority DESC, created ASC LIMIT ?`,
        [limit]
      );

      const mappedJobs = result
        .map((row) => this.mapRowToJob(row))
        .filter((job) => job.attempts < job.maxAttempts);

      if (mappedJobs.length > 0) {
        // Mark all claimed jobs as active=1
        const ids = mappedJobs
          .map((j) => {
            j.active = true; // Update local reference for parity
            return `'${j.id}'`;
          })
          .join(',');
        await tx.runAsync(
          `UPDATE ${this.tableName} SET active = 1 WHERE id IN (${ids})`
        );
      }

      jobs = mappedJobs;
    });

    return jobs;
  }

  async updateJob<T = unknown>(job: Job<T>): Promise<void> {
    await this.initPromise;
    await this.db.runAsync(
      `UPDATE ${this.tableName} SET active = ?, failed = ?, data = ? WHERE id = ?`,
      [
        job.active ? 1 : 0,
        job.failed || null,
        JSON.stringify(
          pick(job, [
            'attempts',
            'maxAttempts',
            'timeInterval',
            'ttl',
            'onlineOnly',
            'workerName',
            'metaData',
          ])
        ),
        job.id,
      ]
    );
  }

  async removeJob<T = unknown>(job: Job<T>): Promise<void> {
    await this.initPromise;
    await this.db.runAsync(`DELETE FROM ${this.tableName} WHERE id = ?`, [
      job.id,
    ]);
  }

  async getJob(id: string): Promise<Job<unknown> | null> {
    await this.initPromise;
    const result = await this.db.getAllAsync<JobRow>(
      `SELECT * FROM ${this.tableName} WHERE id = ?`,
      [id]
    );

    const row = result[0];
    if (row) {
      return this.mapRowToJob(row);
    }
    return null;
  }

  async getJobs(): Promise<Job<unknown>[]> {
    await this.initPromise;
    const result = await this.db.getAllAsync<JobRow>(
      `SELECT * FROM ${this.tableName}`
    );
    return result.map((row) => this.mapRowToJob(row));
  }

  async deleteAll(): Promise<void> {
    await this.initPromise;
    await this.db.runAsync(`DELETE FROM ${this.tableName}`);
  }

  /**
   * Resets all active jobs to inactive state.
   */
  async recover(): Promise<void> {
    await this.initPromise;
    await this.db.runAsync(
      `UPDATE ${this.tableName} SET active = 0 WHERE active = 1`
    );
  }

  private mapRowToJob(row: JobRow): Job<unknown> {
    const data = JSON.parse(row.data || '{}') as JobOptions & {
      maxAttempts?: number;
      workerName?: string;
    };

    return {
      ...omit(row, ['data']),
      ...data,
      active: !!row.active,
      attempts: data.attempts ?? 0,
      payload: JSON.parse(row.payload),
      maxAttempts: data.maxAttempts || 1,
      timeInterval: data.timeInterval || 0,
      ttl: data.ttl || 1000 * 60 * 60 * 24 * 7, // Default 7 days
    } as Job<unknown>;
  }
}
