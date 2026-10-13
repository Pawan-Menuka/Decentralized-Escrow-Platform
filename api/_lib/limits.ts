import { UploadError } from './errors';

interface Counter { count: number; resetsAt: number }

export class RequestLimiter {
  private readonly counters = new Map<string, Counter>();

  check(key: string, limit: number, windowMs: number, now = Date.now()): void {
    const current = this.counters.get(key);
    if (!current || current.resetsAt <= now) {
      this.counters.set(key, { count: 1, resetsAt: now + windowMs });
      this.prune(now);
      return;
    }
    if (current.count >= limit) {
      throw new UploadError(429, 'RATE_LIMITED', 'Too many upload requests. Please try again later.');
    }
    current.count += 1;
  }

  private prune(now: number): void {
    if (this.counters.size < 2_000) return;
    for (const [key, counter] of this.counters) {
      if (counter.resetsAt <= now) this.counters.delete(key);
    }
  }
}

export const requestLimiter = new RequestLimiter();

export function requestIp(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown';
}
