import assert from 'node:assert/strict';
import { mkdir,writeFile,readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function publicHttps(raw) {
  const url=new URL(raw);
  assert.equal(url.protocol,'https:','Privacy URL must use HTTPS.');
  assert.ok(!url.username && !url.password,'Anonymous access cannot use URL credentials.');
  assert.ok(!/^(?:localhost|127(?:\.\d+){3}|0\.0\.0\.0|\[?::1\]?)$/i.test(url.hostname),'Privacy URL cannot use localhost.');
  return url;
}
export async function checkPrivacyUrl(raw, fetcher=globalThis.fetch) {
  let url=publicHttps(raw);const original=url.href;
  let response;
  for(let redirects=0;redirects<=5;redirects++) {
    response=await fetcher(url.href,{redirect:'manual',credentials:'omit',headers:{Accept:'text/html'},signal:globalThis.AbortSignal.timeout(20_000)});
    if(![301,302,303,307,308].includes(response.status))break;
    const next=response.headers.get('location');assert.ok(next,'Redirect lacks Location.');
    assert.ok(redirects<5,'Too many privacy URL redirects.');url=publicHttps(new URL(next,url).href);
  }
  assert.equal(response.status,200,`Privacy page returned HTTP ${response.status}; anonymous HTML 200 is required.`);
  assert.match(response.headers.get('content-type')??'',/text\/html/i,'Privacy URL must return HTML.');
  const html=await response.text();assert.ok(html.length>0 && html.length<=1_000_000,'Unexpected privacy document size.');
  assert.match(html,/TableFlow/i,'Privacy page must identify TableFlow.');
  assert.match(html,/Privacy|隐私(?:政策|说明)/i,'Privacy policy heading is missing.');
  assert.doesNotMatch(html,/localhost|127\.0\.0\.1/i,'Local preview links cannot appear in the published policy.');
  assert.doesNotMatch(html,/<input[^>]+type\s*=\s*["']?password|<form[^>]+action\s*=\s*["'][^"']*(?:login|signin)/i,'Privacy page requires a login form.');
  assert.doesNotMatch(url.pathname,/\/(?:login|signin|sign-in)(?:\/|$)/i,'Privacy URL redirected to login.');
  return {passed:true,url:original,finalUrl:url.href,https:true,status:200,html:true,anonymous:true,bytes:Buffer.byteLength(html),checkedAt:new Date().toISOString()};
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    assert.ok(process.argv[2],'Usage: npm run check:privacy -- https://your-published-site/privacy/');
    const result=await checkPrivacyUrl(process.argv[2]);const version=JSON.parse(await readFile('package.json','utf8')).version;
    await mkdir('.test-artifacts',{recursive:true});await writeFile('.test-artifacts/privacy-url-check.json',JSON.stringify({...result,version},null,2));
    console.log(`Privacy URL PASS: anonymous HTTPS HTML 200 at ${result.finalUrl}.`);
  } catch(error){console.error(`Privacy URL check FAILED: ${error.message}`);process.exitCode=1;}
}
