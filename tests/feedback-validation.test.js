import test from 'node:test';
import assert from 'node:assert/strict';
import { validateFeedback } from '../public/feedback-model.js';

const valid = (overrides = {}) => ({
  institution: 'school', stage: 'testing', satisfaction: 4,
  ease: 3, recommendation: 0, ...overrides,
});

test('normalizes optional values without storing the honeypot or mutating input', () => {
  const input = valid({ website: '', difficulties: '  어렵습니다  ', improvements: '  ' });
  const result = validateFeedback(input);
  assert.deepEqual(result, { ok: true, data: {
    institution: 'school', experience: '', stage: 'testing', satisfaction: 4,
    ease: 3, recommendation: 0, usefulFeatures: [], difficulties: '어렵습니다',
    improvements: '', interviewConsent: false, contact: '',
  } });
  assert.equal(input.difficulties, '  어렵습니다  ');
});

test('accepts every documented option and boundary score', () => {
  for (const institution of ['school', 'education-office', 'support-office', 'training-institute', 'other']) {
    assert.equal(validateFeedback(valid({ institution })).ok, true);
  }
  for (const experience of ['', 'under-1', '1-3', '4-9', '10-plus']) {
    assert.equal(validateFeedback(valid({ experience })).ok, true);
  }
  for (const stage of ['exploring', 'downloaded', 'testing', 'operating']) {
    assert.equal(validateFeedback(valid({ stage })).ok, true);
  }
  for (const satisfaction of [1, 5]) {
    assert.equal(validateFeedback(valid({ satisfaction, ease: satisfaction, recommendation: 10 })).ok, true);
  }
});

test('accepts optional contact only with consent, without requiring contact after consent', () => {
  for (const contact of ['', ' 이름@example.kr ', '+82 (0)10-1234-5678', '기관 대표번호 02-123-4567 내선 123']) {
    const result = validateFeedback(valid({ interviewConsent: true, contact }));
    assert.equal(result.ok, true);
    assert.equal(result.data.contact, contact.trim());
  }
  assert.equal(validateFeedback(valid({ contact: '  ' })).ok, true);
});

test('accepts unique feature values and exact string length limits', () => {
  const usefulFeatures = ['dashboard', 'training', 'people', 'attendance', 'surveys', 'budget', 'documents', 'backup'];
  const result = validateFeedback(valid({ usefulFeatures, difficulties: '가'.repeat(2000),
    improvements: '나'.repeat(2000), interviewConsent: true, contact: 'x'.repeat(200) }));
  assert.equal(result.ok, true);
  assert.deepEqual(result.data.usefulFeatures, usefulFeatures);
  assert.notEqual(result.data.usefulFeatures, usefulFeatures);
});

const invalidCases = [
  ['institution', undefined], ['institution', ''], ['institution', 'School'], ['institution', 1],
  ['experience', null], ['experience', 1], ['experience', 'unknown'],
  ['stage', undefined], ['stage', ''], ['stage', 'other'], ['stage', []],
  ['satisfaction', undefined], ['satisfaction', 0], ['satisfaction', 6], ['satisfaction', 1.5],
  ['satisfaction', '3'], ['satisfaction', null], ['satisfaction', NaN], ['satisfaction', Infinity],
  ['ease', undefined], ['ease', 0], ['ease', 6], ['ease', 1.5], ['ease', '4'], ['ease', -Infinity],
  ['recommendation', undefined], ['recommendation', -1], ['recommendation', 11],
  ['recommendation', 0.5], ['recommendation', '0'], ['recommendation', null], ['recommendation', NaN],
  ['usefulFeatures', null], ['usefulFeatures', 'dashboard'], ['usefulFeatures', ['unknown']],
  ['usefulFeatures', ['dashboard', 'dashboard']], ['usefulFeatures', [1]],
  ['usefulFeatures', Array(1)],
  ['usefulFeatures', Array(9).fill('backup')],
  ['difficulties', null], ['difficulties', 1], ['difficulties', '가'.repeat(2001)],
  ['improvements', null], ['improvements', []], ['improvements', 'a'.repeat(2001)],
  ['interviewConsent', 'true'], ['interviewConsent', 1], ['interviewConsent', null],
  ['contact', 'user@example.kr'], ['contact', 123], ['contact', null],
  ['website', 'bot.example'], ['website', ' '], ['website', null], ['website', 0],
];

for (const [index, [field, value]] of invalidCases.entries()) {
  test(`rejects invalid ${field} input #${index + 1} with a Korean field error`, () => {
    const result = validateFeedback(valid({ [field]: value }));
    assert.equal(result.ok, false);
    assert.match(result.errors[field], /[가-힣]/);
    assert.equal(Object.hasOwn(result, 'data'), false);
  });
}

test('rejects overlong consented contact', () => {
  const result = validateFeedback(valid({ interviewConsent: true, contact: 'a'.repeat(201) }));
  assert.equal(result.ok, false);
  assert.ok(result.errors.contact);
});

test('rejects all unknown own keys, including prototype-related JSON keys', () => {
  for (const key of ['name', 'email', 'createdAt', 'id', '__proto__', 'constructor', 'prototype']) {
    const input = JSON.parse(JSON.stringify(valid()).slice(0, -1) + `,${JSON.stringify(key)}:"private-value"}`);
    const result = validateFeedback(input);
    assert.equal(result.ok, false);
    assert.match(result.errors._form, /[가-힣]/);
    assert.equal(JSON.stringify(result).includes('private-value'), false);
  }
});

test('rejects non-object payloads and inherited input properties', () => {
  for (const input of [null, undefined, [], 'text', 1, true, new Date(), Object.create(valid())]) {
    const result = validateFeedback(input);
    assert.equal(result.ok, false);
    assert.match(result.errors._form, /[가-힣]/);
  }
});
