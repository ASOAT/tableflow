import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { EXTENSION_VERSION } from '../src/shared/version';
import { validateVersionSources } from '../scripts/check-version.mjs';

const json = (file:string) => JSON.parse(readFileSync(file,'utf8'));
describe('release version consistency', () => {
  it('keeps package, lock, manifest and Popup canonical source identical', () => {
    expect(validateVersionSources(json('package.json'),json('package-lock.json'),json('public/manifest.json'))).toBe(EXTENSION_VERSION);
  });
  it.each(['manifest','lock','lock package'])('rejects %s drift before packaging', field => {
    const manifest={version:'0.5.1'}; const lock={version:'0.5.1',packages:{'':{version:'0.5.1'}}};
    if(field==='manifest')manifest.version='0.5.0'; else if(field==='lock')lock.version='0.5.0'; else lock.packages[''].version='0.5.0';
    expect(()=>validateVersionSources({version:'0.5.1'},lock,manifest)).toThrow('version drift');
  });
});
