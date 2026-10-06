import { describe, expect, it } from 'vitest';
import { checkProductionText } from '../scripts/check-release.mjs';

describe('release package text policy', () => {
  it.each([
    ['content.js', 'fetch("https://example.com/upload")'],
    ['content.js', 'new Function("return 1")'],
    ['content.js', 'TableFlowDeveloperTools.generateStructuralSnapshot()'],
    ['content.js', 'sourceMappingURL=content.js.map'],
    ['content.js', 'http://localhost:4173'],
    ['config.json', '{"api_key":"FAKE_LONG_CREDENTIAL"}'],
    ['config.json', '{"password":"FAKE_LONG_CREDENTIAL"}'],
    ['config.json', 'sk-FAKE_CREDENTIAL_FOR_RELEASE_TEST'],
    ['config.json', 'Bearer FAKE_LONG_CREDENTIAL'],
    ['config.json', '{"secret":"FAKE_LONG_CREDENTIAL"}'],
    ['popup.html', '<script src="https://example.com/code.js"></script>'],
    ['privacy.html', '<img src="https://example.com/pixel.png">'],
  ])('rejects prohibited production content in %s', (filename, content) => {
    expect(() => checkProductionText(content, filename)).toThrow();
  });
  it('does not confuse privacy explanations with credential assignments', () => {
    expect(() => checkProductionText('<p>No cookies, tokens, API keys or passwords are uploaded.</p>', 'privacy.html')).not.toThrow();
    expect(() => checkProductionText('const permitted = ["https://*/*"];', 'background.js')).not.toThrow();
  });
});
