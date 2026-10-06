import type { CollectionProgress, HeldSnapshot } from './snapshot';

interface EngineState {
  ids: WeakMap<Element, string>;
  sequence: number;
  collection?: AbortController;
  collectionProgress?: Omit<CollectionProgress, 'running'>;
  snapshot?: HeldSnapshot;
  snapshotOwnerId?: string;
  snapshotSequence?: number;
}
const isolatedGlobal = globalThis as typeof globalThis & { __TableFlowEngineState?: EngineState };
// Re-injection for Popup actions must preserve element identity and in-flight cancellation.
export const engineState = isolatedGlobal.__TableFlowEngineState ??= { ids: new WeakMap(), sequence: 0 };
