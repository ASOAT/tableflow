export interface VirtualLimits {
  maxIterations: number;
  maxRows: number;
  timeoutMs: number;
  noNewRowsThreshold: number;
  settleMs: number;
  stepRatio: number;
}

export const VIRTUAL_LIMITS: Readonly<VirtualLimits> = Object.freeze({
  maxIterations: 400,
  maxRows: 10_000,
  timeoutMs: 30_000,
  noNewRowsThreshold: 4,
  settleMs: 60,
  stepRatio: 0.8,
});

export function virtualLimits(overrides: Partial<VirtualLimits> = {}): VirtualLimits {
  const result = { ...VIRTUAL_LIMITS };
  for (const key of Object.keys(result) as Array<keyof VirtualLimits>) {
    const value = overrides[key];
    if (value !== undefined) {
      if (!Number.isFinite(value) || value <= 0) throw new Error(`Invalid virtual limit: ${key}`);
      result[key] = Math.min(value, VIRTUAL_LIMITS[key]);
    }
  }
  for (const key of ['maxIterations', 'maxRows', 'noNewRowsThreshold'] as const) result[key] = Math.floor(result[key]);
  if (result.maxIterations < 1 || result.maxRows < 1 || result.noNewRowsThreshold < 1) throw new Error('Virtual limits must be positive integers.');
  return result;
}
