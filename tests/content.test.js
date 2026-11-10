import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const html = async () => {
  try { return await read('public/index.html'); }
  catch { assert.fail('The landing page public/index.html must exist'); }
};

test('download CTA points at the supplied, unmodified HTML distribution', async () => {
  const page = await html();
  assert.match(page, /<a\b[^>]*href="\/downloads\/연수온_v3\.2\.2_로컬운영본\.html"[^>]*download[^>]*>/);
  const data = await readFile(new URL('../public/downloads/연수온_v3.2.2_로컬운영본.html', import.meta.url));
  assert.equal(createHash('sha256').update(data).digest('hex'), 'cba2455755fe2344b4d020cbe2f0c24b6bce12d3c125bd1265e097a7582ed0df');
  assert.ok(page.includes('cba2455755fe2344b4d020cbe2f0c24b6bce12d3c125bd1265e097a7582ed0df'));
});

test('tutorial uses the supplied unchanged video with native, non-autoplay controls', async () => {
  const page = await html();
  const video = page.match(/<video\b[\s\S]*?<\/video>/)?.[0];
  assert.ok(video, 'An HTML5 video is present');
  assert.match(video, /\bcontrols\b/);
  assert.match(video, /preload="(?:none|metadata)"/);
  assert.doesNotMatch(video, /\bautoplay\b/);
  assert.ok(video.includes('/video/연수온_v3.2.2_사용자튜토리얼.mp4'));
  const data = await readFile(new URL('../public/video/연수온_v3.2.2_사용자튜토리얼.mp4', import.meta.url));
  assert.equal(createHash('sha256').update(data).digest('hex'), 'ee00b1f860998530f280508f7594d022a5fbdecd9224c81ebb4f2faefcdb751b');
  for (const text of ['3분 52초', '실제 화면', '한글 자막', '호철 PVC']) assert.ok(page.includes(text), text);
});

test('all safety notices and core features are present for Korean readers', async () => {
  const page = await html();
  for (const text of ['IndexedDB', '자동 동기화되지 않', '전체 JSON 백업', '기관 보안지침', '개인정보 처리기준', '버전별', '별도 보관', '대시보드', '연수·강좌', '강사·교육생', '출결', '설문', '예산', '운영문서', 'JSON 백업·복원']) assert.ok(page.includes(text), text);
  assert.match(page, /서버\s*없이/);
});

test('survey declares required choices, optional experience, privacy and fallback hooks', async () => {
  const page = await html();
  assert.match(page, /<form\b[^>]*id="feedback-form"[^>]*action="\/api\/feedback"[^>]*method="post"/);
  for (const name of ['institution','stage','satisfaction','ease','recommendation']) {
    assert.match(page, new RegExp(`<(?:input|select)\\b[^>]*name="${name}"[^>]*required`), name);
  }
  for (const name of ['experience','usefulFeatures','difficulties','improvements','interviewConsent','contact','website']) assert.ok(page.includes(`name="${name}"`), name);
  assert.match(page, /담당 경력[\s\S]{0,80}선택/);
  assert.match(page, /개선 목적으로만/);
  assert.match(page, /연락처는 선택/);
  assert.match(page, /공개(?:적으로)?\s*(?:저장|노출)하지 않/);
  assert.match(page, /name="contact"[^>]*maxlength="200"[^>]*disabled/);
  assert.equal((page.match(/maxlength="2000"/g) || []).length, 2);
  for (const id of ['feedback-fields','form-status','copy-feedback','copy-status','copy-fallback','feedback-copy-text','submit-feedback','contact-field']) assert.ok(page.includes(`id="${id}"`), id);
  assert.match(page, /<button\b[^>]*id="submit-feedback"[^>]*disabled/, 'Submit stays disabled until JavaScript initializes');
});

test('page provides Korean semantics, working section anchors and local styles/scripts', async () => {
  const page = await html();
  assert.match(page, /<html\b[^>]*lang="ko"/);
  assert.match(page, /name="viewport"/);
  assert.equal((page.match(/<h1[\s>]/g)||[]).length, 1);
  assert.match(page, /<main\b[^>]*id="main"/);
  assert.match(page, /href="#main"/);
  for (const section of ['intro','features','tutorial','safety','feedback']) {
    assert.ok(page.includes(`href="#${section}"`));
    assert.ok(page.includes(`id="${section}"`));
  }
  const ids = [...page.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(new Set(ids).size, ids.length, 'IDs are unique');
  for (const anchor of page.matchAll(/href="#([^"]+)"/g)) assert.ok(ids.includes(anchor[1]), anchor[1]);
  for (const source of ['/styles.css','/feedback.js']) {
    assert.ok(page.includes(`"${source}"`));
    await access(new URL(`../public${source}`, import.meta.url));
  }
  assert.doesNotMatch(page, /<script\b[^>]*src="https?:/);
});

test('institution and experience selects expose every supported option as a real option element', async () => {
  const page = await html();
  for (const [id, expected] of [
    ['institution', ['', 'school', 'education-office', 'support-office', 'training-institute', 'other']],
    ['experience', ['', 'under-1', '1-3', '4-9', '10-plus']],
  ]) {
    const select = page.match(new RegExp(`<select\\b[^>]*id="${id}"[^>]*>([\\s\\S]*?)<\\/select>`))?.[1];
    assert.ok(select, `${id} select exists`);
    assert.deepEqual([...select.matchAll(/<option\s+value="([^"]*)"[^>]*>/g)].map(match=>match[1]), expected);
  }
  assert.doesNotMatch(page, /<\/\w+\s+[^>\s]/, 'Closing tags cannot contain attributes');
});

test('Vercel exposes only public static files and secures downloads and responses', async () => {
  let config;
  try { config = JSON.parse(await read('vercel.json')); } catch { assert.fail('vercel.json must exist'); }
  assert.equal(config.outputDirectory, 'public');
  assert.equal(config.build.env.NODEJS_HELPERS, '0', 'Vercel must preserve raw request streaming for byte limits');
  assert.ok(config.headers.some(rule => rule.source === '/downloads/(.*)' && rule.headers.some(h => h.key === 'Content-Disposition' && h.value.startsWith('attachment'))));
  const all = config.headers.find(rule=>rule.source === '/(.*)')?.headers;
  for (const key of ['X-Content-Type-Options','Referrer-Policy','X-Frame-Options','Permissions-Policy']) assert.ok(all?.some(h=>h.key === key), key);
  const csp = config.headers.find(rule=>rule.headers.some(h=>h.key === 'Content-Security-Policy'));
  assert.ok(csp, 'CSP is configured');
});
