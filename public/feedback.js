import { validateFeedback } from './feedback-model.js';

const labels = {
  school: '학교', 'education-office': '교육청', 'support-office': '교육지원청',
  'training-institute': '연수기관', other: '기타',
  'under-1': '1년 미만', '1-3': '1~3년', '4-9': '4~9년', '10-plus': '10년 이상',
  exploring: '둘러보는 중', downloaded: '다운로드함', testing: '테스트 중', operating: '실제 운영 중',
  dashboard: '대시보드', training: '연수·강좌', people: '강사·교육생', attendance: '출결',
  surveys: '설문', budget: '예산', documents: '운영문서', backup: 'JSON 백업·복원',
};

export function collectFeedback(formData) {
  const string = name => String(formData.get(name) ?? '');
  const score = name => {
    const value = string(name);
    return value.trim() === '' ? null : Number(value);
  };
  const interviewConsent = formData.get('interviewConsent') !== null;
  return {
    institution: string('institution'),
    experience: string('experience'),
    stage: string('stage'),
    satisfaction: score('satisfaction'),
    ease: score('ease'),
    recommendation: score('recommendation'),
    usefulFeatures: formData.getAll('usefulFeatures').map(String),
    difficulties: string('difficulties'),
    improvements: string('improvements'),
    interviewConsent,
    contact: interviewConsent ? string('contact') : '',
    website: string('website'),
  };
}

export function formatFeedbackForCopy(data) {
  const label = value => labels[value] ?? value ?? '';
  // An explicit allowlist keeps consent, contact, honeypot, and future private fields out.
  return [
    '연수온 사용자 경험 설문',
    `기관 유형: ${label(data.institution)}`,
    `담당 경력: ${label(data.experience) || '미응답'}`,
    `사용 단계: ${label(data.stage)}`,
    `전반적 만족도: ${data.satisfaction ?? ''} / 5`,
    `사용 편의성: ${data.ease ?? ''} / 5`,
    `유용한 기능: ${(data.usefulFeatures ?? []).map(label).join(', ') || '미응답'}`,
    `가장 어려웠던 점: ${data.difficulties || '미응답'}`,
    `개선 요청: ${data.improvements || '미응답'}`,
    `추천 의향: ${data.recommendation ?? ''} / 10`,
  ].join('\n');
}

export function createFeedbackController({
  document,
  fetch = globalThis.fetch?.bind(globalThis),
  clipboard = globalThis.navigator?.clipboard,
  makeFormData = form => new FormData(form),
  timeoutMs = 15_000,
} = {}) {
  const form = document?.getElementById('feedback-form');
  if (!form) return null;
  const fields = document.getElementById('feedback-fields');
  const submitButton = document.getElementById('submit-feedback');
  const status = document.getElementById('form-status');
  const copyButton = document.getElementById('copy-feedback');
  const copyStatus = document.getElementById('copy-status');
  const copyFallback = document.getElementById('copy-fallback');
  const copyText = document.getElementById('feedback-copy-text');
  const contactField = document.getElementById('contact-field');
  const consent = form.elements.namedItem('interviewConsent');
  const contact = form.elements.namedItem('contact');
  const originalButtonText = submitButton.textContent;
  const invalidFields = new Set();
  let pending = false;
  let safeCopyText = '';
  let copyGeneration = 0;

  function syncContact() {
    const allowed = consent.checked;
    contactField.hidden = !allowed;
    contact.disabled = !allowed;
    if (!allowed) contact.value = '';
  }

  function clearCopy() {
    safeCopyText = '';
    copyGeneration += 1;
    copyButton.hidden = true;
    copyFallback.hidden = true;
    copyText.value = '';
    copyStatus.textContent = '';
  }

  function clearErrors() {
    for (const error of document.querySelectorAll('[data-error-for]')) error.textContent = '';
    for (const name of invalidFields) {
      for (const control of form.querySelectorAll(`[name="${name}"]`)) control.removeAttribute('aria-invalid');
    }
    invalidFields.clear();
  }

  function showErrors(errors) {
    let firstControl;
    for (const [name, message] of Object.entries(errors)) {
      const error = document.querySelector(`[data-error-for="${name}"]`);
      if (error) error.textContent = message;
      for (const control of form.querySelectorAll(`[name="${name}"]`)) {
        control.setAttribute('aria-invalid', 'true');
        firstControl ??= control;
      }
      invalidFields.add(name);
    }
    status.textContent = '필수 항목과 입력 내용을 확인해 주세요.';
    firstControl?.focus();
  }

  function setPending(value) {
    pending = value;
    fields.disabled = value;
    submitButton.disabled = value;
    form.setAttribute('aria-busy', String(value));
    submitButton.textContent = value ? '보내는 중…' : originalButtonText;
  }

  async function submit(event) {
    event?.preventDefault();
    if (pending) return;
    clearErrors();
    if (!form.reportValidity()) return;
    const result = validateFeedback(collectFeedback(makeFormData(form)));
    if (!result.ok) {
      showErrors(result.errors);
      return;
    }
    clearCopy();
    setPending(true);
    status.textContent = '의견을 보내고 있습니다. 잠시만 기다려 주세요.';
    const abortController = new AbortController();
    let timer;
    let timedOut = false;
    try {
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => {
          timedOut = true;
          abortController.abort();
          reject(new Error('Request timed out'));
        }, timeoutMs);
      });
      const delivery = fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'omit',
        body: JSON.stringify(result.data),
        signal: abortController.signal,
      }).then(async response => {
        if (!response.ok) throw new Error('Request failed');
        const body = await response.json();
        if (body?.ok !== true) throw new Error('Response not confirmed');
      });
      await Promise.race([delivery, timeout]);
      form.reset();
      syncContact();
      clearCopy();
      status.textContent = '의견이 접수되었습니다. 연수온 개선에 함께해 주셔서 감사합니다.';
    } catch {
      // Keep only the public-safe copy in memory; never persist form data locally.
      safeCopyText = formatFeedbackForCopy(result.data);
      copyButton.hidden = false;
      status.textContent = timedOut
        ? '응답 대기 시간이 지났습니다. 접수 여부를 확인하지 못했습니다. 입력 내용은 유지됩니다. 잠시 후 다시 보내거나 응답을 복사해 보관해 주세요.'
        : '접수를 확인하지 못했습니다. 입력 내용은 유지됩니다. 잠시 후 다시 보내거나 응답을 복사해 보관해 주세요.';
    } finally {
      clearTimeout(timer);
      setPending(false);
      status.focus();
    }
  }

  async function copyResponse(event) {
    event?.preventDefault();
    if (!safeCopyText || pending) return;
    const text = safeCopyText;
    const generation = copyGeneration;
    try {
      if (!clipboard?.writeText) throw new Error('Clipboard unavailable');
      await clipboard.writeText(text);
      if (generation !== copyGeneration) return;
      copyStatus.textContent = '연락처와 인터뷰 동의를 제외한 응답을 복사했습니다.';
    } catch {
      if (generation !== copyGeneration) return;
      copyText.value = text;
      copyFallback.hidden = false;
      copyStatus.textContent = '자동 복사를 사용할 수 없습니다. 아래 선택된 응답을 직접 복사해 주세요. 연락처와 인터뷰 동의는 제외됩니다.';
      copyText.focus();
      copyText.select();
    }
  }

  consent.addEventListener('change', syncContact);
  form.addEventListener('submit', submit);
  copyButton.addEventListener('click', copyResponse);
  syncContact();
  clearCopy();
  setPending(false);
  return { submit, copyResponse, syncContact };
}

if (typeof document !== 'undefined') createFeedbackController({ document });
