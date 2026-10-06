export const SCREENSHOT_FILES: readonly string[];
export const MAX_SCREENSHOT_BYTES: number;
export function checkScreenshotPng(input: Uint8Array, label?: string): { width: number; height: number; bytes: number };
export interface ScreenshotCheckResult {
  status: 'PASS' | 'PENDING';
  missing: string[];
  languages: { language: string; reuse: string | null; files: { file: string; width: number; height: number; bytes: number }[] }[];
  visualReview: 'MANUAL REVIEW REQUIRED';
}
export function checkScreenshots(root?: string, options?: { allowPending?: boolean }): Promise<ScreenshotCheckResult>;
