import { logger } from '@/lib/observability/logger';

type QueuedJob<T> = {
  fn: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
  label: string;
};

class SheetsApiQueue {
  private queue: QueuedJob<any>[] = [];
  private running = false;

  async enqueue<T>(label: string, fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ fn, resolve, reject, label });
      this.drain();
    });
  }

  private async drain() {
    if (this.running) return;
    this.running = true;

    while (this.queue.length > 0) {
      const job = this.queue.shift()!;
      logger.info('[SheetsQueue] Starting:', { label: job.label, remaining: this.queue.length });
      try {
        const result = await job.fn();
        job.resolve(result);
      } catch (err) {
        job.reject(err);
      }
      if (this.queue.length > 0) {
        await sleep(200);
      }
    }

    this.running = false;
  }

  get queueLength() {
    return this.queue.length;
  }

  get isRunning() {
    return this.running;
  }
}

export const sheetsQueue = new SheetsApiQueue();

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}