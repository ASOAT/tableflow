import { describe,it,expect,vi } from 'vitest';
import { checkPrivacyUrl } from '../scripts/check-privacy-url.mjs';

const response=(body='<!doctype html><h1>TableFlow 隐私政策 Privacy Policy</h1>',status=200,contentType='text/html')=>new Response(body,{status,headers:{'Content-Type':contentType}});
const transport=(result:Response)=>vi.fn<typeof fetch>(async()=>result);
describe('published privacy URL checker without network in CI',()=>{
  it('checks anonymously without cookies or credentials',async()=>{
    const fetcher=transport(response());expect(await checkPrivacyUrl('https://example.org/privacy/',fetcher)).toMatchObject({passed:true,status:200,anonymous:true});
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({credentials:'omit',redirect:'manual',headers:{Accept:'text/html'}});
    expect(fetcher.mock.calls[0]?.[1]?.headers).not.toHaveProperty('Authorization');
  });
  it.each(['http://example.org/privacy/','https://localhost/privacy/','https://127.0.0.1/privacy/','https://user:secret@example.org/privacy/'])('rejects unsuitable input %s',async url=>{
    const fetcher=transport(response());await expect(checkPrivacyUrl(url,fetcher)).rejects.toThrow();expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([401,403,404,500])('rejects HTTP %s',async status=>{await expect(checkPrivacyUrl('https://example.org/privacy/',transport(response('unavailable',status)))).rejects.toThrow('HTTP');});
  it.each([['not html','application/json'],['<h1>Privacy</h1>','text/html'],['<h1>TableFlow</h1>','text/html'],['TableFlow Privacy localhost','text/html'],['TableFlow Privacy <input type="password">','text/html']])('rejects unsuitable document %s',async(body,type)=>{await expect(checkPrivacyUrl('https://example.org/privacy/',transport(response(body,200,type)))).rejects.toThrow();});
  it('follows HTTPS redirects but rejects downgrade or authentication redirects',async()=>{
    const fetcher=vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(null,{status:301,headers:{location:'/privacy/'}})).mockResolvedValueOnce(response());
    expect((await checkPrivacyUrl('https://example.org/',fetcher)).finalUrl).toBe('https://example.org/privacy/');
    await expect(checkPrivacyUrl('https://example.org/',transport(new Response(null,{status:302,headers:{location:'http://example.org/'}})))).rejects.toThrow('HTTPS');
  });
});
