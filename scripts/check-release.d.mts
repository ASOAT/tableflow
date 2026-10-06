export function checkProductionText(text: string, filename: string): void;
export function checkRelease(directory?: string): Promise<{
  version: string; files: number; permissions: string[]; requiredHosts: string[];
  productionNetworkApis: number; developmentApis: number; sourceMaps: number; hashes: Record<string,string>;
}>;
