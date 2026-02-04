import type { Adapter, Job, JobProcessorOptions } from './types';
import { JobRegistry } from './registry';
import { JobExecutor } from './executor';
import { isJobExpired, shouldSkipByBackoff } from './utils/helpers';

/**
 * Orchestrates the job processing loop.
 * Handles concurrency, network awareness, and job filtering (TTL, Backoff).
 */
export class JobProcessor {
  private runningJobs: number = 0;
  private isConnected: boolean = true;
  private pausedJobNames: Set<string> = new Set();
  private status: 'active' | 'inactive' = 'inactive';
  private unsubscribeNetInfo: (() => void) | null = null;

  private adapter: Adapter;
  private registry: JobRegistry;
  private executor: JobExecutor;
  private concurrency: number;
  private monitorNetwork: boolean;

  constructor(options: JobProcessorOptions) {
    this.adapter = options.adapter;
    this.registry = options.registry;
    this.executor = options.executor;
    this.concurrency = options.concurrency ?? 1;
    this.monitorNetwork = options.monitorNetwork ?? false;
  }

  /**
   * Starts the processing loop and network monitoring.
   */
  async start() {
    if (this.status === 'active') {
      return;
    }

    this.status = 'active';

    // Start network monitoring ONLY if enabled
    if (this.monitorNetwork && !this.unsubscribeNetInfo) {
      try {
        // Require only when needed to avoid mandatory dependency
        const NetInfo = require('@react-native-community/netinfo');

        // Get initial state
        const state = await NetInfo.fetch();
        this.isConnected = !!state.isConnected;

        this.unsubscribeNetInfo = NetInfo.addEventListener((newState: any) => {
          const wasConnected = this.isConnected;
          this.isConnected = !!newState.isConnected;

          // If we regained connection, trigger processing
          if (!wasConnected && this.isConnected && this.status === 'active') {
            this.process();
          }
        });
      } catch (error) {
        console.warn(
          '[expo-queue] Failed to initialize network monitoring. Ensure @react-native-community/netinfo is installed.',
          error
        );
        // Fallback to connected if we can't monitor
        this.isConnected = true;
      }
    }

    this.process();
  }

  /**
   * Stops the processing loop and network monitoring.
   */
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
      // Ensure we are active and trigger processing
      this.status = 'active';
      this.process();
    }
  }

  /**
   * The core processing loop.
   * Fetches available jobs from the adapter and executes them within concurrency limits.
   */
  private async process() {
    if (this.status === 'inactive') return;

    // Fetch next batch of jobs
    // Calculate available slots to prevent over-fetching
    const availableSlots = this.concurrency - this.runningJobs;
    if (availableSlots <= 0) return;

    // Fetch jobs that are NOT currently active
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

    const unclaim = async (j: Job<any>) => {
      j.active = false;
      await this.adapter.updateJob(j);
    };

    for (const job of jobs) {
      // Check if we stopped mid-batch. Use a cast to avoid narrowing issues.
      if ((this.status as string) === 'inactive') {
        await unclaim(job);
        continue;
      }

      if (this.runningJobs >= this.concurrency) {
        // Unclaim jobs beyond concurrency limit if we over-fetched
        await unclaim(job);
        continue;
      }

      // Check if this job type is paused
      if (this.pausedJobNames.has(job.name)) {
        await unclaim(job);
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
        await unclaim(job);
        continue;
      }

      // 3. Network Check (Per-Job)
      if (job.onlineOnly === true && !this.isConnected) {
        await unclaim(job);
        continue;
      }

      // 4. Max Attempts Check
      if (job.attempts >= job.maxAttempts) {
        // Technically shouldn't happen due to adapter filter, but for safety:
        await unclaim(job);
        continue;
      }

      const worker = this.registry.getWorker(job.name);
      if (!worker) {
        // Record failure due to missing worker
        job.failed = new Date().toISOString();
        job.active = false;
        if (job.metaData) {
          job.metaData.lastError = 'No worker found';
        }
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

    // Scheduling logic
    if (jobsStartedThisBatch > 0) {
      // We started some jobs, keep trying to fill capacity
      this.process();
    } else if (hasSkippedBackoff) {
      // No jobs started, but some are waiting for backoff.
      // Schedule a retry after the shortest backoff delay.
      setTimeout(() => this.process(), nextBackoffDelay);
    } else if (
      jobsStartedThisBatch === 0 &&
      this.runningJobs === 0 &&
      !hasSkippedBackoff
    ) {
      // Nothing to do, go inactive.
      this.status = 'inactive';
    }
  }
}
