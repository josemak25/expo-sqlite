import type { Adapter } from './types';
import { JobRegistry } from './registry';
import { JobExecutor } from './executor';

export class JobProcessor {
  private status: 'active' | 'inactive' = 'inactive';
  private runningJobs: number = 0;
  private concurrency: number;

  constructor(
    private adapter: Adapter,
    private registry: JobRegistry,
    private executor: JobExecutor,
    concurrency: number = 1
  ) {
    this.concurrency = concurrency;
  }

  start() {
    if (this.status === 'active') return;
    this.status = 'active';
    this.process();
  }

  stop() {
    this.status = 'inactive';
  }

  private async process() {
    if (this.status === 'inactive') return;

    // Check global concurrency
    if (this.runningJobs >= this.concurrency) return;

    // Fetch next batch of jobs
    // Calculate available slots to prevent over-fetching
    const availableSlots = this.concurrency - this.runningJobs;
    const jobs = await this.adapter.getConcurrentJobs(availableSlots);

    if (jobs.length === 0) {
      if (this.runningJobs === 0) {
        this.status = 'inactive';
      }
      return;
    }

    let jobsStartedThisBatch = 0;
    let hasSkippedBackoff = false;
    let nextBackoffDelay = Infinity;

    for (const job of jobs) {
      if (this.runningJobs >= this.concurrency) {
        break;
      }

      // 1. Check TTL (Hard Expiry)
      if (job.ttl > 0) {
        const created = new Date(job.created).getTime();
        const now = Date.now();
        if (now - created > job.ttl) {
          await this.adapter.removeJob(job);
          continue;
        }
      }

      // 2. Check TimeInterval (Backoff)
      if (job.failed && job.attempts < job.maxAttempts) {
        const lastFailed = new Date(job.failed).getTime();
        const now = Date.now();
        const elapsed = now - lastFailed;
        if (elapsed < job.timeInterval) {
          hasSkippedBackoff = true;
          nextBackoffDelay = Math.min(
            nextBackoffDelay,
            job.timeInterval - elapsed
          );
          continue;
        }
      }

      // 3. Network Check (Per-Job)
      if (job.onlineOnly === true) {
        let isConnected = true;
        try {
          const NetInfo = require('@react-native-community/netinfo');
          const networkState = await NetInfo.fetch();
          isConnected = networkState.isConnected !== false;
        } catch {
          console.warn(
            `expo-queue: Job "${job.name}" requires network but @react-native-community/netinfo is not installed.`
          );
          isConnected = false;
        }

        if (!isConnected) {
          continue;
        }
      }

      // 4. Max Attempts Check
      if (job.attempts >= job.maxAttempts) {
        continue;
      }

      const worker = this.registry.getWorker(job.name);
      if (!worker) {
        job.failed = new Date().toISOString();
        // We might want to mark it as failed with error "No worker found"
        // For now matching original logic: just fail timestamp and update
        // But original logic didn't increment attempts or add error message here?
        // Original: job.failed = new Date().toISOString(); await this.adapter.updateJob(job); continue;
        await this.adapter.updateJob(job);
        continue;
      }

      // Start the job execution
      jobsStartedThisBatch++;
      this.runningJobs++;

      // Execute and then continue processing
      this.executor.execute(job, worker).finally(() => {
        this.runningJobs--;
        this.process();
      });
    }

    // Handle backoff wakeup
    if (
      jobsStartedThisBatch === 0 &&
      this.runningJobs === 0 &&
      hasSkippedBackoff
    ) {
      setTimeout(() => this.process(), nextBackoffDelay + 10);
      // Keep state active so we can trigger again
      this.status = 'active';
    } else if (
      jobsStartedThisBatch === 0 &&
      this.runningJobs === 0 &&
      !hasSkippedBackoff
    ) {
      this.status = 'inactive';
    }
  }
}
