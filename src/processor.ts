import type { Adapter } from './types';
import { JobRegistry } from './registry';
import { JobExecutor } from './executor';
import { isJobExpired, shouldSkipByBackoff } from './utils/helpers';

export class JobProcessor {
  private status: 'active' | 'inactive' = 'inactive';
  private runningJobs: number = 0;
  private concurrency: number;
  private isConnected: boolean = true;
  private unsubscribeNetInfo: (() => void) | null = null;
  private pausedJobNames: Set<string> = new Set();

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

    // Subscribe to network changes if not already subscribed
    this.setupNetworkMonitoring();

    this.process();
  }

  private setupNetworkMonitoring() {
    if (this.unsubscribeNetInfo) return;

    try {
      const NetInfo = require('@react-native-community/netinfo');

      // Initialize state
      NetInfo.fetch().then((state: { isConnected: boolean | null }) => {
        this.isConnected = state.isConnected !== false;
      });

      // Subscribe to changes
      this.unsubscribeNetInfo = NetInfo.addEventListener(
        (state: { isConnected: boolean | null }) => {
          const wasConnected = this.isConnected;
          this.isConnected = state.isConnected !== false;

          // If network recovered, trigger processing
          if (!wasConnected && this.isConnected && this.status === 'active') {
            this.process();
          }
        }
      );
    } catch {
      // NetInfo not available, assume always connected or handle as before
      this.isConnected = true;
    }
  }

  stop() {
    this.status = 'inactive';
    if (this.unsubscribeNetInfo) {
      this.unsubscribeNetInfo();
      this.unsubscribeNetInfo = null;
    }
  }

  /**
   * Pauses processing of a specific job type.
   * @param name - The name of the job to pause.
   */
  pauseJob(name: string) {
    this.pausedJobNames.add(name);
  }

  /**
   * Resumes processing of a specific job type.
   * @param name - The name of the job to resume.
   */
  resumeJob(name: string) {
    if (this.pausedJobNames.delete(name)) {
      // If we were active, trigger a process loop to pick up newly resumed jobs
      if (this.status === 'active') {
        this.process();
      }
    }
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

      // Check if this job type is paused
      if (this.pausedJobNames.has(job.name)) {
        continue;
      }

      // 1. Check TTL (Hard Expiry)
      if (isJobExpired(job)) {
        await this.adapter.removeJob(job);
        continue;
      }

      // 2. Check TimeInterval (Exponential Backoff + Jitter)
      const { shouldSkip, remaining } = shouldSkipByBackoff(job);
      if (shouldSkip) {
        hasSkippedBackoff = true;
        nextBackoffDelay = Math.min(nextBackoffDelay, remaining);
        continue;
      }

      // 3. Network Check (Per-Job)
      if (job.onlineOnly === true && !this.isConnected) {
        continue;
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
