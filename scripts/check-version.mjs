import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function validateVersionSources(packageInfo, lockInfo, manifest) {
  assert.match(packageInfo.version, /^\d+\.\d+\.\d+$/, 'Release version must be a numeric three-part version.');
  for (const [name, version] of [['manifest',manifest.version],['lock root',lockInfo.version],['lock package',lockInfo.packages?.['']?.version]]) {
    assert.equal(version, packageInfo.version, `${name} version drift`);
  }
  return packageInfo.version;
}
export async function checkVersion() {
  const json = async file => JSON.parse(await readFile(file,'utf8'));
  return validateVersionSources(await json('package.json'),await json('package-lock.json'),await json('public/manifest.json'));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(`Version sources PASS: ${await checkVersion()}.`);
