import type { Plugin } from 'vite';

export function productionIsolation(): Plugin {
  return { name: 'tableflow-production-isolation',
    generateBundle(_options, bundle) {
      for (const asset of Object.values(bundle)) {
        if (asset.type !== 'chunk') continue;
        for (const id of Object.keys(asset.modules)) {
          const normalized = id.replace(/\\/g, '/');
          if (/\/tests\/component-lab\/|\/node_modules\/(?:react|react-dom|vue|antd|element-plus|@mui|ag-grid)/.test(normalized)) {
            this.error(`Test component dependency cannot enter the production extension: ${normalized}`);
          }
        }
      }
    } };
}
