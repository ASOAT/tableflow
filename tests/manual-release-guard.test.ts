import { describe,it,expect } from 'vitest';
import { REQUIRED_MANUAL_CHECKS,validateManualQa } from '../scripts/check-manual-qa.mjs';

const complete=()=>({version:'0.5.1',testedAt:'2026-10-06T09:00:00Z',tester:'Manual QA fixture',edgeVersion:'153.0.0.0',windowsVersion:'Windows 11',excelVersion:'Microsoft Excel fixture',privacyUrlValue:'https://example.org/tableflow/privacy/',...Object.fromEntries(REQUIRED_MANUAL_CHECKS.map(key=>[key,'pass']))});
describe('final release guard (synthetic unit fixtures only)',()=>{
  it.each(REQUIRED_MANUAL_CHECKS)('blocks when %s is not really marked pass',key=>{
    for(const value of ['pending','fail',true,null,undefined,'PASS'])expect(()=>validateManualQa({...complete(),[key]:value},'0.5.1')).toThrow('Final release blocked');
  });
  it('accepts a complete result without changing it or creating production evidence',()=>{
    const result=complete();const before=JSON.stringify(result);expect(validateManualQa(result,'0.5.1').privacyUrl).toBe(result.privacyUrlValue);expect(JSON.stringify(result)).toBe(before);
  });
  it('rejects another version and missing real metadata',()=>{
    expect(()=>validateManualQa(complete(),'0.5.2')).toThrow('another extension version');
    for(const key of ['tester','testedAt','edgeVersion','windowsVersion','excelVersion'])expect(()=>validateManualQa({...complete(),[key]:null},'0.5.1')).toThrow();
  });
  it.each(['http://example.org/','https://user:secret@example.org/','https://localhost/','https://example.org/?token=x'])('rejects unsuitable privacy URL %s',url=>expect(()=>validateManualQa({...complete(),privacyUrlValue:url},'0.5.1')).toThrow());
});
