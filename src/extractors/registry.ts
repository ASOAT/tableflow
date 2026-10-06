import { nativeTableExtractor } from './nativeTableExtractor';
import { ariaGridExtractor } from './ariaGridExtractor';
import { divGridExtractor } from './divGridExtractor';
import { antDesignAdapter } from './adapters/antDesignAdapter';
import { elementPlusAdapter } from './adapters/elementPlusAdapter';
import { muiDataGridAdapter } from './adapters/muiDataGridAdapter';
import { agGridAdapter } from './adapters/agGridAdapter';
import { diagnoseCandidate } from './diagnostics';
import type { ExtractionDiagnostics } from '../shared/diagnostics';
import type { Diagnostic, Extractor, TableCandidate } from './types';

export interface RegisteredAdapter extends Extractor {
  id: string;
  name: string;
  diagnose(candidate: TableCandidate, external?: Diagnostic[]): ExtractionDiagnostics;
}
export class AdapterRegistry {
  private readonly entries: RegisteredAdapter[] = [];
  registerAdapter(adapter: RegisteredAdapter): void {
    if (!/^[a-z][a-z0-9-]+$/.test(adapter.id) || this.entries.some((entry) => entry.id === adapter.id)) {
      throw new Error('Adapter ID must be unique and contain only a stable code identifier.');
    }
    this.entries.push(Object.freeze({ ...adapter }));
  }
  all(): readonly RegisteredAdapter[] { return [...this.entries]; }
}

// Only bundled, reviewed TypeScript registers adapters. No runtime configuration or code loading.
export const adapterRegistry = new AdapterRegistry();
for (const extractor of [nativeTableExtractor, ariaGridExtractor, antDesignAdapter,
  elementPlusAdapter, muiDataGridAdapter, agGridAdapter, divGridExtractor]) {
  adapterRegistry.registerAdapter({ ...extractor, id: extractor.type, name: extractor.type, diagnose: diagnoseCandidate });
}
