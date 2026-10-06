import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { checkRelease } from './check-release.mjs';
import { checkManualQa } from './check-manual-qa.mjs';

const final = process.argv.includes('--final');
if (final) await checkManualQa();
const checked = await checkRelease();
const artifacts = resolve('.test-artifacts');
const output = resolve(`release/tableflow-edge-v${checked.version}${final?'':'-rc'}.zip`);
await mkdir(resolve('release'), { recursive: true });
await mkdir(resolve(artifacts,'packages'), { recursive: true });
const unpacked = await mkdtemp(resolve(artifacts,'packages','unpacked-'));
assert.ok(unpacked.startsWith(artifacts + sep));

function run(command, args, env = {}) {
  return new Promise((done, reject) => {
    const child = spawn(command,args,{stdio:'inherit',windowsHide:true,env:{...process.env,...env}});
    child.once('error',reject);
    child.once('exit',(code)=>code===0?done():reject(new Error(`${command} exited ${code}`)));
  });
}
if (process.platform !== 'win32') throw new Error('This dependency-free packaging command currently requires Windows PowerShell.');
if (final) await run(process.execPath,['scripts/check-screenshots.mjs']);
// Fixed PowerShell programs receive paths as environment values, never interpolated shell text.
await run('powershell.exe',['-NoProfile','-NonInteractive','-Command',
  'Compress-Archive -LiteralPath (Get-ChildItem -LiteralPath $env:TF_PACKAGE_SOURCE -Force | ForEach-Object FullName) -DestinationPath $env:TF_PACKAGE_ZIP -CompressionLevel Optimal -Force'],
  {TF_PACKAGE_SOURCE:resolve('dist'),TF_PACKAGE_ZIP:output});
await run('powershell.exe',['-NoProfile','-NonInteractive','-Command',
  'Expand-Archive -LiteralPath $env:TF_PACKAGE_ZIP -DestinationPath $env:TF_PACKAGE_UNPACK -Force'],
  {TF_PACKAGE_ZIP:output,TF_PACKAGE_UNPACK:unpacked});
const expanded = await checkRelease(unpacked);
assert.deepEqual(expanded.hashes,checked.hashes,'Archive bytes must exactly match the checked production build.');
await run(process.execPath,['scripts/package-smoke.mjs',unpacked]);
const smoke = JSON.parse(await readFile('.test-artifacts/package-smoke.json','utf8'));
assert.equal(smoke.passed,true);
const bytes = await readFile(output);
const result = {passed:true,kind:final?'final':'rc',version:checked.version,path:output,bytes:(await stat(output)).size,
  sha256:createHash('sha256').update(bytes).digest('hex'),files:checked.files,unpacked,
  archiveRootManifest:true,hashesMatch:true,smoke,createdAt:new Date().toISOString()};
await writeFile('.test-artifacts/package-results.json',`${JSON.stringify(result,null,2)}\n`);
console.log(`Package PASS: ${output} (${result.bytes} bytes); exact archive verification and extension smoke PASS.`);
