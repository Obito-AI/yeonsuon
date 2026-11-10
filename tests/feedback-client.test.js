import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collectFeedback,
  formatFeedbackForCopy,
  createFeedbackController,
} from '../public/feedback.js';

const validFields = {
  institution: 'school', experience: '1-3', stage: 'testing',
  satisfaction: '4', ease: '5', recommendation: '0',
  usefulFeatures: ['dashboard', 'backup'], difficulties: '백업이 어려웠습니다.',
  improvements: '안내를 추가해 주세요.', website: '',
};

function dataFrom(fields) {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    for (const item of Array.isArray(value) ? value : [value]) data.append(name, item);
  }
  return data;
}

class Element {
  constructor(properties = {}) {
    Object.assign(this, { hidden: false, disabled: false, value: '', checked: false,
      textContent: '', listeners: {}, attributes: {}, focused: false }, properties);
  }
  addEventListener(type, callback) { this.listeners[type] = callback; }
  emit(type) { return this.listeners[type]?.({ preventDefault() {} }); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  removeAttribute(name) { delete this.attributes[name]; }
  focus() { this.focused = true; }
  select() { this.selected = true; }
}

function harness({ fields = {}, fetch, clipboard, timeoutMs = 1000, nativeValid = true,
  initiallyDisabled = false } = {}) {
  const values = { ...validFields, ...fields };
  const elements = Object.fromEntries([
    'feedback-form', 'feedback-fields', 'submit-feedback', 'form-status',
    'copy-feedback', 'copy-status', 'copy-fallback', 'feedback-copy-text', 'contact-field',
  ].map(id => [id, new Element()]));
  elements['submit-feedback'].textContent = '의견 보내기';
  elements['submit-feedback'].disabled = initiallyDisabled;
  const controls = Object.fromEntries(Object.keys(values).map(name => [name, new Element({ value: values[name] })]));
  controls.interviewConsent = new Element({ checked: Boolean(values.interviewConsent) });
  controls.contact = new Element({ value: values.contact || '' });
  const errors = Object.fromEntries(['institution', 'stage', 'satisfaction', 'ease', 'recommendation', 'contact']
    .map(name => [name, new Element()]));
  const form = elements['feedback-form'];
  if (initiallyDisabled) form.setAttribute('aria-busy', 'true');
  form.elements = { namedItem: name => controls[name] || null };
  form.reportValidity = () => { form.validityChecks = (form.validityChecks || 0) + 1; return nativeValid; };
  form.reset = () => {
    form.resets = (form.resets || 0) + 1;
    for (const control of Object.values(controls)) { control.value = ''; control.checked = false; }
  };
  form.querySelectorAll = selector => selector.startsWith('[name=')
    ? [controls[selector.match(/"([^"]+)"/)[1]]].filter(Boolean) : [];
  const document = {
    getElementById: id => elements[id] || null,
    querySelector: selector => errors[selector.match(/['"]([^'"]+)['"]/)[1]] || null,
    querySelectorAll: selector => selector === '[data-error-for]' ? Object.values(errors) : [],
  };
  const calls = [];
  const request = fetch || (async () => ({ ok: true, json: async () => ({ ok: true }) }));
  const { interviewConsent: _consent, ...publicValues } = values;
  const controller = createFeedbackController({
    document, clipboard, timeoutMs,
    fetch: (...args) => { calls.push(args); return request(...args); },
    makeFormData: () => dataFrom({
      ...publicValues,
      contact: controls.contact.disabled ? '' : controls.contact.value,
      ...(controls.interviewConsent.checked ? { interviewConsent: 'on' } : {}),
    }),
  });
  return { ...elements, form, values, controls, errors, calls, controller };
}

test('collects scores as numbers without treating a missing score as zero', () => {
  const data = collectFeedback(dataFrom(validFields));
  assert.equal(data.recommendation, 0);
  assert.equal(data.satisfaction, 4);
  assert.deepEqual(data.usefulFeatures, ['dashboard', 'backup']);
  assert.equal(collectFeedback(dataFrom({ ...validFields, recommendation: '' })).recommendation, null);
  const missing = { ...validFields };
  delete missing.recommendation;
  assert.equal(collectFeedback(dataFrom(missing)).recommendation, null);
});

test('does not collect contact data without interview consent', () => {
  const result = collectFeedback(dataFrom({ ...validFields, contact: 'private@example.com' }));
  assert.equal(result.interviewConsent, false);
  assert.equal(result.contact, '');
});

test('copy text preserves useful answers but excludes all private fields', () => {
  const text = formatFeedbackForCopy({ ...validFields, recommendation: 0,
    contact: 'private@example.com', interviewConsent: true, website: 'spam.example', unknown: 'SECRET' });
  assert.match(text, /백업이 어려웠습니다/);
  assert.match(text, /추천 의향: 0/);
  assert.doesNotMatch(text, /private@example|interviewConsent|연락처|spam\.example|SECRET/);
});

test('consent reveals contact input and turning it off clears and disables contact', () => {
  const h = harness();
  assert.equal(h['contact-field'].hidden, true);
  assert.equal(h.controls.contact.disabled, true);
  h.controls.interviewConsent.checked = true;
  h.controls.interviewConsent.emit('change');
  assert.equal(h['contact-field'].hidden, false);
  assert.equal(h.controls.contact.disabled, false);
  h.controls.contact.value = 'private@example.com';
  h.controls.interviewConsent.checked = false;
  h.controls.interviewConsent.emit('change');
  assert.equal(h.controls.contact.value, '');
  assert.equal(h.controls.contact.disabled, true);
  assert.equal(h['contact-field'].hidden, true);
});

test('initialization enables the no-JavaScript submission guard and clears stale busy state', () => {
  const h = harness({ initiallyDisabled: true });
  assert.equal(h['submit-feedback'].disabled, false);
  assert.equal(h.form.attributes['aria-busy'], 'false');
});

test('rejects invalid data locally and keeps answers editable', async () => {
  const h = harness({ fields: { institution: 'unknown' } });
  await h.form.emit('submit');
  assert.equal(h.calls.length, 0);
  assert.equal(h.form.resets, undefined);
  assert.equal(h['feedback-fields'].disabled, false);
  assert.ok(h.errors.institution.textContent.length > 0);
});

test('honors native form validity before sending a request', async () => {
  const h = harness({ nativeValid: false });
  await h.form.emit('submit');
  assert.equal(h.calls.length, 0);
  assert.equal(h.form.validityChecks, 1);
});

test('suppresses duplicate submissions and locks fields until confirmed success', async () => {
  let resolve;
  const h = harness({ fetch: () => new Promise(done => { resolve = done; }) });
  const pending = h.form.emit('submit');
  const duplicate = h.form.emit('submit');
  assert.equal(h.calls.length, 1);
  assert.equal(h['feedback-fields'].disabled, true);
  assert.equal(h['submit-feedback'].disabled, true);
  const [url, options] = h.calls[0];
  assert.equal(url, '/api/feedback');
  assert.equal(options.method, 'POST');
  assert.equal(options.credentials, 'omit');
  assert.equal(options.headers['Content-Type'], 'application/json');
  assert.equal(JSON.parse(options.body).recommendation, 0);
  resolve({ ok: true, json: async () => ({ ok: true }) });
  await Promise.all([pending, duplicate]);
  assert.equal(h.form.resets, 1);
  assert.equal(h['feedback-fields'].disabled, false);
  assert.equal(h['submit-feedback'].disabled, false);
  assert.match(h['form-status'].textContent, /접수/);
  assert.equal(h['form-status'].focused, true);
});

test('success clears contact, copy state, and any previously displayed fallback', async () => {
  let successful = false;
  const copied = [];
  const h = harness({ fields: { interviewConsent: 'on', contact: 'private@example.com' },
    clipboard: { writeText: async text => { copied.push(text); throw new Error('denied'); } },
    fetch: async () => ({ ok: successful, json: async () => ({ ok: successful }) }),
  });
  await h.form.emit('submit');
  await h['copy-feedback'].emit('click');
  assert.equal(h['copy-fallback'].hidden, false);
  successful = true;
  await h.form.emit('submit');
  assert.equal(h.controls.contact.value, '');
  assert.equal(h.controls.contact.disabled, true);
  assert.equal(h['contact-field'].hidden, true);
  assert.equal(h['copy-feedback'].hidden, true);
  assert.equal(h['copy-fallback'].hidden, true);
  assert.equal(h['feedback-copy-text'].value, '');
  await h['copy-feedback'].emit('click');
  assert.equal(copied.length, 1);
});

for (const [name, fetch] of [
  ['HTTP error', async () => ({ ok: false, json: async () => ({ ok: true }) })],
  ['unconfirmed JSON', async () => ({ ok: true, json: async () => ({ message: 'saved' }) })],
  ['malformed JSON', async () => ({ ok: true, json: async () => { throw new SyntaxError('bad JSON'); } })],
  ['network failure', async () => { throw new TypeError('offline'); }],
]) {
  test(`${name} preserves answers and exposes a private-data-free copy fallback`, async () => {
    const h = harness({ fetch, fields: { interviewConsent: 'on', contact: 'private@example.com' } });
    await h.form.emit('submit');
    assert.equal(h.form.resets, undefined);
    assert.equal(h.controls.contact.value, 'private@example.com');
    assert.equal(h['feedback-fields'].disabled, false);
    assert.equal(h['copy-feedback'].hidden, false);
    assert.match(h['form-status'].textContent, /다시/);
    await h['copy-feedback'].emit('click');
    assert.equal(h['copy-fallback'].hidden, false);
    assert.equal(h['feedback-copy-text'].selected, true);
    assert.match(h['feedback-copy-text'].value, /백업이 어려웠습니다/);
    assert.doesNotMatch(h['feedback-copy-text'].value, /private@example|연락처/);
  });
}

test('clipboard success provides confirmation without revealing the manual fallback', async () => {
  let copied;
  const h = harness({ fetch: async () => { throw new Error('offline'); },
    clipboard: { writeText: async text => { copied = text; } } });
  await h.form.emit('submit');
  await h['copy-feedback'].emit('click');
  assert.match(copied, /안내를 추가해 주세요/);
  assert.equal(h['copy-fallback'].hidden, true);
  assert.match(h['copy-status'].textContent, /복사/);
});

test('request timeout aborts a stalled request and permits retry', async () => {
  const h = harness({ timeoutMs: 10, fetch: () => new Promise(() => {}) });
  await h.form.emit('submit');
  assert.equal(h.calls[0][1].signal.aborted, true);
  assert.equal(h.form.resets, undefined);
  assert.equal(h['feedback-fields'].disabled, false);
  assert.equal(h['submit-feedback'].disabled, false);
  assert.equal(h['copy-feedback'].hidden, false);
  assert.match(h['form-status'].textContent, /다시/);
  await h.form.emit('submit');
  assert.equal(h.calls.length, 2);
});

test('timeout also bounds a stalled JSON response body', async () => {
  const h = harness({ timeoutMs: 10,
    fetch: async () => ({ ok: true, json: () => new Promise(() => {}) }) });
  await h.form.emit('submit');
  assert.equal(h.calls[0][1].signal.aborted, true);
  assert.equal(h.form.resets, undefined);
  assert.equal(h['submit-feedback'].disabled, false);
  assert.equal(h['copy-feedback'].hidden, false);
});

test('a late clipboard rejection cannot restore answers after a successful submission', async () => {
  let successful = false;
  let rejectCopy;
  const h = harness({
    fetch: async () => ({ ok: successful, json: async () => ({ ok: successful }) }),
    clipboard: { writeText: () => new Promise((_, reject) => { rejectCopy = reject; }) },
  });
  await h.form.emit('submit');
  const pendingCopy = h['copy-feedback'].emit('click');
  successful = true;
  await h.form.emit('submit');
  rejectCopy(new Error('Clipboard permission denied'));
  await pendingCopy;
  assert.equal(h.form.resets, 1);
  assert.equal(h['copy-fallback'].hidden, true);
  assert.equal(h['feedback-copy-text'].value, '');
  assert.equal(h['copy-status'].textContent, '');
});
