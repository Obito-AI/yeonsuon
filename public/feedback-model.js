export const INSTITUTIONS = Object.freeze(['school', 'education-office', 'support-office', 'training-institute', 'other']);
export const EXPERIENCES = Object.freeze(['', 'under-1', '1-3', '4-9', '10-plus']);
export const STAGES = Object.freeze(['exploring', 'downloaded', 'testing', 'operating']);
export const USEFUL_FEATURES = Object.freeze(['dashboard', 'training', 'people', 'attendance', 'surveys', 'budget', 'documents', 'backup']);
export const MAX_TEXT_LENGTH = 2000;
export const MAX_CONTACT_LENGTH = 200;

const allowedKeys = new Set(['institution', 'experience', 'stage', 'satisfaction', 'ease',
  'recommendation', 'usefulFeatures', 'difficulties', 'improvements', 'interviewConsent', 'contact', 'website']);

// This module also runs in the browser. Keep the validation contract dependency-free.
export function validateFeedback(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) {
    return { ok: false, errors: { _form: '설문 응답 형식을 확인해 주세요.' } };
  }

  const errors = {};
  if (Object.keys(input).some(key => !allowedKeys.has(key))) {
    errors._form = '허용되지 않은 항목이 포함되어 있습니다.';
  }

  const data = {
    institution: input.institution,
    experience: input.experience === undefined ? '' : input.experience,
    stage: input.stage,
    satisfaction: input.satisfaction,
    ease: input.ease,
    recommendation: input.recommendation,
    usefulFeatures: input.usefulFeatures === undefined ? [] : input.usefulFeatures,
    difficulties: input.difficulties === undefined ? '' : input.difficulties,
    improvements: input.improvements === undefined ? '' : input.improvements,
    interviewConsent: input.interviewConsent === undefined ? false : input.interviewConsent,
    contact: input.contact === undefined ? '' : input.contact,
  };

  if (!INSTITUTIONS.includes(data.institution)) errors.institution = '기관 유형을 선택해 주세요.';
  if (!EXPERIENCES.includes(data.experience)) errors.experience = '담당 경력을 확인해 주세요.';
  if (!STAGES.includes(data.stage)) errors.stage = '사용 단계를 선택해 주세요.';

  for (const [field, label, minimum, maximum] of [
    ['satisfaction', '전반적 만족도', 1, 5], ['ease', '사용 편의성', 1, 5],
    ['recommendation', '추천 의향', 0, 10],
  ]) {
    if (!Number.isInteger(data[field]) || data[field] < minimum || data[field] > maximum) {
      errors[field] = `${label}을 ${minimum}~${maximum}점에서 선택해 주세요.`;
    }
  }

  if (!Array.isArray(data.usefulFeatures) || data.usefulFeatures.length > USEFUL_FEATURES.length
    || [...data.usefulFeatures].some(feature => !USEFUL_FEATURES.includes(feature))
    || new Set(data.usefulFeatures).size !== data.usefulFeatures.length) {
    errors.usefulFeatures = '유용한 기능은 중복 없이 목록에서 선택해 주세요.';
  } else {
    data.usefulFeatures = [...data.usefulFeatures];
  }

  for (const field of ['difficulties', 'improvements', 'contact']) {
    const limit = field === 'contact' ? MAX_CONTACT_LENGTH : MAX_TEXT_LENGTH;
    if (typeof data[field] !== 'string') {
      errors[field] = '문자로 입력해 주세요.';
    } else {
      data[field] = data[field].trim();
      if (data[field].length > limit) errors[field] = `${limit}자 이하로 입력해 주세요.`;
    }
  }

  if (typeof data.interviewConsent !== 'boolean') {
    errors.interviewConsent = '후속 인터뷰 동의 여부를 확인해 주세요.';
  }
  if (typeof data.contact === 'string' && data.contact && data.interviewConsent !== true) {
    errors.contact = '연락처는 후속 인터뷰에 동의한 경우에만 입력할 수 있습니다.';
  }
  if (input.website !== undefined && input.website !== '') {
    errors.website = '제출할 수 없는 응답입니다.';
  }

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, data };
}
