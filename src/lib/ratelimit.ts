// Fixed-window limiter held in process memory. On serverless each instance has
// its own window, so this is a speed bump against scripted guessing, not the
// main control: the per-account lockout on User is durable and shared.

const windows = new Map<string, { count: number; resetAt: number }>();

export function hit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  const w = windows.get(key);
  if (!w || w.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    if (windows.size > 10_000) {
      for (const [k, v] of windows) if (v.resetAt <= now) windows.delete(k);
    }
    return { ok: true, retryAfterSec: 0 };
  }
  w.count++;
  return { ok: w.count <= limit, retryAfterSec: Math.ceil((w.resetAt - now) / 1000) };
}

export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}
