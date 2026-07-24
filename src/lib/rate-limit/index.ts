import { rateLimit as memoryRateLimit } from "@/lib/rate-limit/memory";

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  retryAfterMs: number;
};

export type RateLimiter = (
  key: string,
  limit: number,
  windowMs: number
) => RateLimitResult;

/**
 * In-memory limiter (single replica). Swap implementation if scaling replicas.
 * Documented in SECURITY.md / SELF-HOSTED.
 */
export const rateLimit: RateLimiter = memoryRateLimit;

export { memoryRateLimit };
