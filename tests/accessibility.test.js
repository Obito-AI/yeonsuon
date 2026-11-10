import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
function rule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] || '';
}
function luminance(hex) {
  const components = hex.slice(1).match(/../g).map(value => parseInt(value, 16) / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return components[0] * 0.2126 + components[1] * 0.7152 + components[2] * 0.0722;
}
for (const [selector, background] of [
  ['.feature-index', '#f0f3e9'], ['.principle-number', '#faf9f5'],
  ['.form-section-title>span', '#ffffff'], ['.footer-inner p span', '#faf9f5'],
  ['.tutorial-aside li:before', '#faf9f5'],
]) {
  test(`supporting text ${selector} meets AA contrast even at mobile sizes`, () => {
    const foreground = rule(selector).match(/\bcolor:\s*(#[0-9a-f]{6})/i)?.[1];
    assert.ok(foreground, `Color found for ${selector}`);
    const values = [luminance(foreground), luminance(background)].sort((a,b)=>a-b);
    const contrast = (values[1]+0.05)/(values[0]+0.05);
    assert.ok(contrast >= 4.5, `${selector}: contrast ${contrast.toFixed(2)} must be >=4.5`);
  });
}
test('text-entry controls are at least 16px to avoid mobile focus zoom', () => {
  const size = Number(rule('.form-field select,.form-field input[type=text],textarea').match(/font-size:\s*(\d+)px/)?.[1]);
  assert.ok(size >= 16, `Current control size: ${size}px`);
});
test('utility content has a landmark and the brand uses its visible text as its accessible name', () => {
  assert.match(html, /class="utility-bar"[^>]*role="region"[^>]*aria-label="[^"]+"/);
  const brand = html.match(/<a\b[^>]*class="brand"[^>]*>/)?.[0];
  assert.ok(brand);
  assert.doesNotMatch(brand, /aria-label=/, 'Do not override the native label with mismatching text');
});
