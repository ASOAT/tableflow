import { adapterRegistry, type RegisteredAdapter } from './registry';
import { walkAccessibleRoots } from './domWalker';
import type { Diagnostic } from './types';

// Semantic detectors run first; validated component adapters refine their fragments.
export const extractors: readonly RegisteredAdapter[] = adapterRegistry.all();
export interface Detection { extractor: RegisteredAdapter; element: Element; source: string; }
export interface DetectionResult { detections: Detection[]; diagnostics: Diagnostic[]; }

export function detectTables(document: Document): DetectionResult {
  const { roots, diagnostics } = walkAccessibleRoots(document);
  const detections = roots.flatMap(({ root, source }) => extractors.flatMap((extractor) =>
    extractor.detect(root).map((element) => ({ extractor, element, source }))));
  return { detections, diagnostics };
}
