import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AUTO_ICON_SITES_KEY } from '../src/shared/site-settings';
import { LANGUAGE_KEY } from '../src/shared/i18n';

const policy = readFileSync(resolve('PRIVACY_POLICY.md'), 'utf8');
const homepage = readFileSync(resolve('site/index.html'), 'utf8');
const privacy = readFileSync(resolve('site/privacy/index.html'), 'utf8');
function parse(html: string): Document { return new DOMParser().parseFromString(html, 'text/html'); }
const normalize = (value: string): string => value.replace(/\s/g, '');

describe('static privacy website', () => {
  it.each([['home', homepage], ['privacy', privacy]])('%s contains no executable code or automatic external resources', (_name, html) => {
    const page = parse(html);
    expect(page.querySelectorAll('script,iframe,object,embed,form,link,base,img,audio,video,source').length).toBe(0);
    expect(page.querySelector('meta[http-equiv="refresh"]')).toBeNull();
    expect(page.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content')).toContain("default-src 'none'");
    for (const element of page.querySelectorAll('*')) {
      for (const attribute of element.attributes) {
        expect(attribute.name).not.toMatch(/^on/i);
        if (attribute.name === 'href') expect(attribute.value).not.toMatch(/^(?:javascript|data):/i);
      }
    }
    expect(html).not.toMatch(/@import|url\s*\(|document\.cookie|localStorage|sessionStorage|localhost|127\.0\.0\.1/i);
  });

  it('uses project-relative privacy links under root and nested Pages paths', () => {
    const links = [...parse(homepage).querySelectorAll('a')];
    expect(links.length).toBeGreaterThanOrEqual(1);
    for (const link of links) {
      const href = link.getAttribute('href')!;
      expect(href).toBe('./privacy/');
      for (const base of ['https://pages.example/', 'https://pages.example/tableflow/']) {
        expect(new URL(href, base).href).toBe(`${base}privacy/`);
      }
    }
  });

  it('keeps the hosted and packaged HTML identical to the entire Markdown policy', () => {
    expect(privacy).toBe(readFileSync(resolve('docs/privacy.html'), 'utf8'));
    const markdownText = policy.replace(/^#{1,3} /gm, '').replace(/`([^`]+)`/g, '$1')
      .replace(/\[([^\]]+)\]\((https:\/\/[^)]+)\)/g, '$1');
    expect(normalize(parse(privacy).querySelector('main')!.textContent!)).toBe(normalize(markdownText));
  });

  it('discloses actual preference keys and public Issues support without exposing an email', () => {
    const text = parse(privacy).body.textContent!;
    for (const key of [AUTO_ICON_SITES_KEY, LANGUAGE_KEY, 'onboardingSeen']) {
      expect(text).toContain(key);
      expect(policy).toContain(key);
    }
    expect(text).not.toContain('[REQUIRED BEFORE RELEASE]');
    expect(policy).not.toContain('[REQUIRED BEFORE RELEASE]');
    expect(parse(privacy).querySelectorAll('a[href="https://github.com/ASOAT/tableflow/issues"]')).toHaveLength(2);
    expect(parse(privacy).querySelector('a[href^="mailto:"]')).toBeNull();
    expect(text).toContain('GitHub Issues 是公开渠道，不是私密支持渠道');
    expect(text).toContain('不在此页面公开');
    expect(text).toContain('敏感表格内容、个人信息、Token、Cookie、完整业务数据');
    expect(text).toContain('GitHub Issues is a public channel, not a private support channel');
    expect(text).toContain('tokens, cookies, complete business datasets');
    expect(text).toContain('0.5.1 Release Candidate');
    expect(text).toContain('Microsoft Edge');
    expect(text).toContain('2026-10-06');
  });

  it('separates extension local processing from GitHub Pages IP logging', () => {
    const text = parse(privacy).body.textContent!;
    expect(text).toContain('完成表格导出所必需的 DOM、文本和相关结构信息');
    expect(text).toContain('不会上传至 TableFlow 服务器');
    expect(text).toContain('记录并存储访问者 IP 地址');
    expect(text).toContain('不是扩展上传网页表格内容');
    expect(parse(privacy).querySelector('a[href="https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages#data-collection"]')).not.toBeNull();
    expect(text).not.toMatch(/TableFlow\s*不访问网页数据|100%|支持所有网站/);
  });

  it('publishes only the static site files with no domain or development artifacts', () => {
    function files(directory: string): string[] {
      return readdirSync(directory).flatMap((entry) => {
        const path = resolve(directory, entry);
        return statSync(path).isDirectory() ? files(path) : [path];
      });
    }
    expect(files(resolve('site')).map((file) => file.replace(resolve('site'), '').replace(/\\/g, '/')).sort())
      .toEqual(['/.nojekyll', '/index.html', '/privacy/index.html']);
  });
});
