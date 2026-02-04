import * as SQLite from 'expo-sqlite';
import type { Adapter, Job } from '../types';

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
        JSON.stringify({
          attempts: job.attempts,
          maxAttempts: job.maxAttempts,
          timeInterval: job.timeInterval,
          ttl: job.ttl,
          onlineOnly: job.onlineOnly,
          workerName: job.workerName,
          metaData: job.metaData,
        }),
        job.priority,
        job.active ? 1 : 0,
        job.timeout,
        job.created,
        job.failed || null,
      ]
    );
  }

  async getConcurrentJobs(): Promise<Job<unknown>[]> {
    await this.initPromise;
    // Logic similar to react-native-queue to fetch concurrent jobs
    // We prioritize by priority DESC, then created ASC
    const result = await this.db.getAllAsync<any>(
      `SELECT * FROM ${this.tableName} WHERE active = 0 AND failed IS NULL ORDER BY priority DESC, created ASC`
    );

    return result.map(this.mapRowToJob);
  }

  async updateJob<T = unknown>(job: Job<T>): Promise<void> {
    await this.initPromise;
    await this.db.runAsync(
      `UPDATE ${this.tableName} SET active = ?, failed = ?, data = ? WHERE id = ?`,
      [
        job.active ? 1 : 0,
        job.failed || null,
        JSON.stringify({
          attempts: job.attempts,
          maxAttempts: job.maxAttempts,
          timeInterval: job.timeInterval,
          ttl: job.ttl,
          onlineOnly: job.onlineOnly,
          workerName: job.workerName,
          metaData: job.metaData,
        }),
        job.id,
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
    const result = await this.db.getAllAsync<any>(
      `SELECT * FROM ${this.tableName} WHERE id = ?`,
      [id]
    );

    if (result.length > 0) {
      return this.mapRowToJob(result[0]);
    }
    return null;
  }

  async getJobs(): Promise<Job<unknown>[]> {
    await this.initPromise;
    const result = await this.db.getAllAsync<any>(
      `SELECT * FROM ${this.tableName}`
    );
    return result.map(this.mapRowToJob);
  }

  async deleteAll(): Promise<void> {
    await this.initPromise;
    await this.db.runAsync(`DELETE FROM ${this.tableName}`);
  }

  private mapRowToJob(row: any): Job<unknown> {
    const data = JSON.parse(row.data || '{}');
    return {
      id: row.id,
      name: row.name,
      payload: JSON.parse(row.payload),
      metaData: data.metaData,
      attempts: data.attempts || 0,
      maxAttempts: data.maxAttempts || 1,
      timeInterval: data.timeInterval || 0,
      ttl: data.ttl || 1000 * 60 * 60 * 24 * 7,
      onlineOnly: data.onlineOnly,
      workerName: data.workerName,
      priority: row.priority,
      active: !!row.active,
      timeout: row.timeout,
      created: row.created,
      failed: row.failed,
    };
  }
}
