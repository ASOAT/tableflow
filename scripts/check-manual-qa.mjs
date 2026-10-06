import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REQUIRED_MANUAL_CHECKS = ['edgeStable','excelClipboard','excelCsv','scale100','scale125','scale150','screenshotsReviewed','privacyUrl','publisherInfoReviewed'];
export function validateManualQa(result, version) {
  assert.ok(result && typeof result==='object', 'Manual QA result is missing.');
  assert.equal(result.version,version,'Manual QA belongs to another extension version.');
  const pending=REQUIRED_MANUAL_CHECKS.filter(key=>result[key]!=='pass');
  assert.equal(pending.length,0,`Final release blocked. Real manual PASS required: ${pending.join(', ')}`);
  assert.ok(typeof result.testedAt==='string' && Number.isFinite(Date.parse(result.testedAt)), 'Record the real test date.');
  for(const key of ['tester','edgeVersion','windowsVersion','excelVersion']) assert.ok(typeof result[key]==='string' && result[key].trim(),`Record ${key}.`);
  const url=new URL(result.privacyUrlValue);
  assert.equal(url.protocol,'https:','Privacy URL must use HTTPS.');
  assert.ok(!url.username && !url.password && !url.search && !url.hash,'Privacy URL must be an anonymous canonical URL.');
  assert.ok(!/^(?:localhost|127(?:\.\d+){3}|0\.0\.0\.0|\[?::1\]?)$/i.test(url.hostname),'Privacy URL must be public.');
  return { version, privacyUrl:url.href, checkedAt:new Date().toISOString() };
}
export async function checkManualQa(file='manual-qa/result.json') {
  const packageInfo=JSON.parse(await readFile('package.json','utf8'));
  let result;
  try {result=JSON.parse(await readFile(file,'utf8'));}
  catch {throw new Error('Final release blocked: create manual-qa/result.json from result.example.json and record real manual results.');}
  return validateManualQa(result,packageInfo.version);
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {const result=await checkManualQa();console.log(`Manual QA guard PASS: ${result.version}. No results were modified.`);}
  catch(error){console.error(error.message);process.exitCode=1;}
}
