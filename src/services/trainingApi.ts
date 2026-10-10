import { NativeModules, Platform, TurboModuleRegistry } from 'react-native';
import { API_BASE_URL } from '../config/api';
import type {
  InductionAttemptState,
  TrainingCertificate,
  TrainingDetail,
  TrainingQuestion,
  TrainingQuestionType,
  TrainingQuizDraft,
  TrainingSignature,
  TrainingSummary,
} from '../types/training';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import { tryParseApiJson } from '../utils/parseApiJson';
import { getAuthToken, getLastCompanySlug } from './authSessionStorage';
import { loadAccountProfile } from './accountProfileStorage';

export type FetchTrainingsResult =
  | { ok: true; trainings: TrainingSummary[] }
  | { ok: false; message: string };

export type FetchTrainingDetailResult =
  | { ok: true; detail: TrainingDetail }
  | { ok: false; message: string };

async function resolveCompanySlug(): Promise<string | null> {
  let slug = await getLastCompanySlug();
  if (slug) return slug;
  const local = await loadAccountProfile();
  return local.companySlug ?? local.registrationCompanySlug ?? null;
}

async function tenantAuthHeaders(): Promise<
  | { ok: true; headers: Record<string, string> }
  | { ok: false; message: string }
> {
  const token = await getAuthToken();
  if (!token || token.trim() === '') {
    return { ok: false, message: 'Not signed in.' };
  }

  const slug = await resolveCompanySlug();
  if (!slug) {
    return {
      ok: false,
      message: 'Organization context missing. Sign out and sign in again with your company selected.',
    };
  }

  return {
    ok: true,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Company-Slug': slug,
    },
  };
}

function userFacingError(message: string, fallback: string): string {
  const lower = message.toLowerCase();
  if (
    lower.includes('api/v1') ||
    lower.includes('http://') ||
    lower.includes('https://') ||
    lower.includes('endpoint')
  ) {
    return fallback;
  }
  if (lower.includes('network') || lower.includes('connection') || lower.includes('reach')) {
    return 'Check your connection and try again.';
  }
  return message.length > 160 ? fallback : message;
}

function messageFromParsed(parsed: unknown, fallback: string): string {
  if (parsed && typeof parsed === 'object' && typeof (parsed as { message?: string }).message === 'string') {
    return (parsed as { message: string }).message;
  }
  return fallback;
}

function asSignature(raw: unknown): TrainingSignature | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const width = Number(row.width);
  const height = Number(row.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  if (!Array.isArray(row.strokes)) return null;
  const strokes = row.strokes
    .map((stroke) => {
      if (!Array.isArray(stroke)) return null;
      const points = stroke
        .map((point) => {
          if (!point || typeof point !== 'object') return null;
          const p = point as Record<string, unknown>;
          const x = Number(p.x);
          const y = Number(p.y);
          if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
          return { x, y };
        })
        .filter((point): point is { x: number; y: number } => point !== null);
      return points.length > 0 ? points : null;
    })
    .filter((stroke): stroke is { x: number; y: number }[] => stroke !== null);
  if (strokes.length === 0) return null;
  return { width, height, strokes };
}

function asCertificate(raw: unknown): TrainingCertificate | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.reference_number !== 'string' || r.reference_number.trim() === '') return null;
  return {
    reference_number: r.reference_number,
    employee_name: typeof r.employee_name === 'string' ? r.employee_name : '',
    training_name: typeof r.training_name === 'string' ? r.training_name : '',
    company_name: typeof r.company_name === 'string' ? r.company_name : '',
    completed_on: typeof r.completed_on === 'string' ? r.completed_on : null,
    completed_on_label: typeof r.completed_on_label === 'string' ? r.completed_on_label : null,
    expires_on: typeof r.expires_on === 'string' ? r.expires_on : null,
    expires_on_label: typeof r.expires_on_label === 'string' ? r.expires_on_label : null,
    signature: asSignature(r.signature),
  };
}

function asSummary(raw: unknown): TrainingSummary | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = Number(r.id);
  if (!Number.isFinite(id)) return null;
  return {
    id,
    module_id: r.module_id != null ? Number(r.module_id) : null,
    title: typeof r.title === 'string' ? r.title : 'Training',
    description: typeof r.description === 'string' ? r.description : null,
    pass_percent: r.pass_percent != null ? Number(r.pass_percent) : null,
    question_time_seconds: Math.max(10, Number(r.question_time_seconds ?? 45)),
    issues_certificate: true,
    quiz_required: r.quiz_required !== false,
    allow_retakes: r.allow_retakes === true,
    quiz_waived: r.quiz_waived === true,
    can_retry: r.can_retry === true,
    status: (typeof r.status === 'string' ? r.status : 'not_started') as TrainingSummary['status'],
    pages_count: Number(r.pages_count ?? r.materials_count ?? 0),
    questions_count: Number(r.questions_count ?? 0),
    assigned_at: typeof r.assigned_at === 'string' ? r.assigned_at : null,
    due_date: typeof r.due_date === 'string' ? r.due_date : null,
    score: r.score != null ? Number(r.score) : null,
    max_score: r.max_score != null ? Number(r.max_score) : null,
    percent: r.percent != null ? Number(r.percent) : null,
    passed: typeof r.passed === 'boolean' ? r.passed : r.passed == null ? null : Boolean(r.passed),
    submitted_at: typeof r.submitted_at === 'string' ? r.submitted_at : null,
    band: (typeof r.band === 'string' ? r.band : 'pending') as TrainingSummary['band'],
    is_induction: r.is_induction === true,
    max_attempts: r.max_attempts != null ? Number(r.max_attempts) : null,
    attempts_used: r.attempts_used != null ? Number(r.attempts_used) : 0,
    attempts_remaining: r.attempts_remaining != null ? Number(r.attempts_remaining) : null,
    certificate: asCertificate(r.certificate),
  };
}

const BLOCK_KINDS = ['text', 'pdf', 'photo', 'video', 'link', 'instruction', 'note'] as const;

const QUESTION_TYPES: TrainingQuestionType[] = [
  'multiple_choice',
  'single_choice',
  'multiple_answer',
  'true_false',
  'yes_no',
  'short_answer',
  'scenario',
  'matching',
  'ordering',
  'fill_blank',
  'image',
  'video',
];

export function quizDraftToAnswer(
  question: TrainingQuestion,
  draft: TrainingQuizDraft | undefined,
): Record<string, unknown> | null {
  if (!draft) return null;
  const base = { question_id: question.id };
  const written =
    question.question_type === 'short_answer' ||
    question.question_type === 'fill_blank' ||
    (question.question_type === 'scenario' && question.options.length === 0);
  if (written) {
    const text = draft.text?.trim() ?? '';
    return text === '' ? null : { ...base, text };
  }
  if (question.question_type === 'ordering') {
    return draft.order && draft.order.length > 0 ? { ...base, order: draft.order } : null;
  }
  if (question.question_type === 'matching') {
    const matches = Object.entries(draft.matches ?? {})
      .filter(([, value]) => value.trim() !== '')
      .map(([optionId, matchText]) => ({ option_id: Number(optionId), match_text: matchText }));
    return matches.length > 0 ? { ...base, matches } : null;
  }
  if (question.allow_multiple || question.question_type === 'multiple_answer') {
    const optionIds = draft.optionIds ?? [];
    return optionIds.length > 0 ? { ...base, option_ids: optionIds } : null;
  }
  return draft.optionId != null ? { ...base, option_id: draft.optionId } : null;
}

export function quizDraftAnswered(question: TrainingQuestion, draft: TrainingQuizDraft | undefined): boolean {
  if (question.question_type === 'matching') {
    return question.options.every((option) => (draft?.matches?.[option.id] ?? '').trim() !== '');
  }
  if (question.question_type === 'ordering') {
    return (draft?.order?.length ?? 0) === question.options.length;
  }
  return quizDraftToAnswer(question, draft) !== null;
}

function asLayout(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const tokens = raw.filter(
    (token): token is string => typeof token === 'string' && /^(title|body|bullets|image|block:\d+)$/.test(token),
  );
  return tokens.length > 0 ? tokens : null;
}

function asBlocks(raw: unknown): TrainingDetail['pages'][number]['blocks'] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const id = Number(row.id);
      const kind = typeof row.kind === 'string' ? row.kind : '';
      if (!Number.isFinite(id) || !BLOCK_KINDS.includes(kind as (typeof BLOCK_KINDS)[number])) return null;
      return {
        id,
        kind: kind as TrainingDetail['pages'][number]['blocks'][number]['kind'],
        label: typeof row.label === 'string' && row.label.trim() !== '' ? row.label : null,
        body: typeof row.body === 'string' && row.body.trim() !== '' ? row.body : null,
        has_file: row.has_file === true,
        file_ext: typeof row.file_ext === 'string' && /^[a-z0-9]{1,8}$/i.test(row.file_ext) ? row.file_ext.toLowerCase() : null,
      };
    })
    .filter((block): block is TrainingDetail['pages'][number]['blocks'][number] => block !== null);
}

function asDetail(raw: unknown): TrainingDetail | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const assignment = asSummary(r.assignment);
  if (!assignment) return null;

  const pages = Array.isArray(r.pages)
    ? r.pages
        .map((p) => {
          if (!p || typeof p !== 'object') return null;
          const row = p as Record<string, unknown>;
          const id = Number(row.id);
          if (!Number.isFinite(id)) return null;
          const sections = Array.isArray(row.sections)
            ? row.sections
                .map((s) => {
                  if (!s || typeof s !== 'object') return null;
                  const sec = s as Record<string, unknown>;
                  const sid = Number(sec.id);
                  if (!Number.isFinite(sid)) return null;
                  return {
                    id: sid,
                    title: typeof sec.title === 'string' ? sec.title : 'Section',
                    body: typeof sec.body === 'string' ? sec.body : '',
                    has_image: sec.has_image === true,
                    layout: asLayout(sec.layout),
                    blocks: asBlocks(sec.blocks),
                    sort_order: Number(sec.sort_order ?? 0),
                  };
                })
                .filter(Boolean)
            : [];
          const bullets = Array.isArray(row.bullets)
            ? row.bullets.filter((line): line is string => typeof line === 'string' && line.trim() !== '')
            : [];
          return {
            id,
            title: typeof row.title === 'string' ? row.title : 'Slide',
            body: typeof row.body === 'string' ? row.body : '',
            bullets,
            has_image: row.has_image === true,
            layout: asLayout(row.layout),
            blocks: asBlocks(row.blocks),
            sort_order: Number(row.sort_order ?? 0),
            sections: sections as TrainingDetail['pages'][number]['sections'],
          };
        })
        .filter(Boolean)
    : [];

  const questions = Array.isArray(r.questions)
    ? r.questions
        .map((q) => {
          if (!q || typeof q !== 'object') return null;
          const row = q as Record<string, unknown>;
          const id = Number(row.id);
          if (!Number.isFinite(id)) return null;
          const options = Array.isArray(row.options)
            ? row.options
                .map((o) => {
                  if (!o || typeof o !== 'object') return null;
                  const opt = o as Record<string, unknown>;
                  const oid = Number(opt.id);
                  if (!Number.isFinite(oid)) return null;
                  return {
                    id: oid,
                    option_text: typeof opt.option_text === 'string' ? opt.option_text : '',
                    is_correct:
                      typeof opt.is_correct === 'boolean' ? opt.is_correct : undefined,
                    match_text: typeof opt.match_text === 'string' ? opt.match_text : null,
                  };
                })
                .filter(Boolean)
            : [];
          const questionType = QUESTION_TYPES.includes(row.question_type as TrainingQuestionType)
            ? (row.question_type as TrainingQuestionType)
            : 'multiple_choice';
          const mediaKind = row.media_kind === 'video' || row.media_kind === 'image' ? row.media_kind : null;
          return {
            id,
            question_type: questionType,
            question_text: typeof row.question_text === 'string' ? row.question_text : '',
            prompt: typeof row.prompt === 'string' && row.prompt.trim() !== '' ? row.prompt : null,
            points: Number(row.points ?? 1),
            allow_multiple: row.allow_multiple === true || questionType === 'multiple_answer',
            requires_review: row.requires_review === true,
            has_media: row.has_media === true,
            media_kind: mediaKind,
            media_version: typeof row.media_version === 'string' && row.media_version !== '' ? row.media_version : null,
            explanation: typeof row.explanation === 'string' && row.explanation.trim() !== '' ? row.explanation : null,
            options: options as TrainingQuestion['options'],
            match_choices: Array.isArray(row.match_choices)
              ? row.match_choices.filter((item): item is string => typeof item === 'string' && item.trim() !== '')
              : [],
            correct_option_ids: Array.isArray(row.correct_option_ids)
              ? row.correct_option_ids.map((item) => Number(item)).filter((item) => Number.isFinite(item))
              : [],
            selected_option_id:
              row.selected_option_id != null ? Number(row.selected_option_id) : null,
            selected_option_ids: Array.isArray(row.selected_option_ids)
              ? row.selected_option_ids.map((item) => Number(item)).filter((item) => Number.isFinite(item))
              : [],
            response_text: typeof row.response_text === 'string' ? row.response_text : null,
            response_order: Array.isArray(row.response_order)
              ? row.response_order.map((item) => Number(item)).filter((item) => Number.isFinite(item))
              : [],
            response_matches: Array.isArray(row.response_matches)
              ? row.response_matches
                  .map((item) => {
                    if (!item || typeof item !== 'object') return null;
                    const pair = item as Record<string, unknown>;
                    const optionId = Number(pair.option_id);
                    if (!Number.isFinite(optionId)) return null;
                    return {
                      option_id: optionId,
                      match_text: typeof pair.match_text === 'string' ? pair.match_text : '',
                    };
                  })
                  .filter((item): item is { option_id: number; match_text: string } => item !== null)
              : [],
            is_correct:
              typeof row.is_correct === 'boolean'
                ? row.is_correct
                : row.is_correct == null
                  ? null
                  : Boolean(row.is_correct),
            review_status:
              row.review_status === 'pending' || row.review_status === 'approved' || row.review_status === 'rejected'
                ? row.review_status
                : null,
            points_awarded: row.points_awarded != null ? Number(row.points_awarded) : null,
          };
        })
        .filter(Boolean)
    : [];

  let result: TrainingDetail['result'] = null;
  if (r.result && typeof r.result === 'object') {
    const res = r.result as Record<string, unknown>;
    result = {
      score: res.score != null ? Number(res.score) : null,
      max_score: res.max_score != null ? Number(res.max_score) : null,
      percent: res.percent != null ? Number(res.percent) : null,
      passed:
        typeof res.passed === 'boolean' ? res.passed : res.passed == null ? null : Boolean(res.passed),
      pass_percent: res.pass_percent != null ? Number(res.pass_percent) : null,
      band: (typeof res.band === 'string' ? res.band : 'pending') as NonNullable<
        TrainingDetail['result']
      >['band'],
      submitted_at: typeof res.submitted_at === 'string' ? res.submitted_at : null,
      quiz_waived: res.quiz_waived === true,
      pending_review: res.pending_review === true,
    };
  }

  return {
    assignment,
    pages: pages as TrainingDetail['pages'],
    quiz_unlocked: Boolean(r.quiz_unlocked),
    questions: questions as TrainingDetail['questions'],
    result,
    induction: asInduction(r.induction),
  };
}

function asInduction(raw: unknown): InductionAttemptState | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  if (row.is_induction !== true) return null;
  return {
    is_induction: true,
    can_retry: row.can_retry === true,
    attempts_used: Number(row.attempts_used ?? 0),
    max_attempts: Number(row.max_attempts ?? 3),
    attempts_remaining: Number(row.attempts_remaining ?? 0),
    passed: row.passed === true,
    locked: row.locked === true,
  };
}

export async function fetchAssignedTrainings(): Promise<FetchTrainingsResult> {
  const auth = await tenantAuthHeaders();
  if (!auth.ok) return auth;

  try {
    const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/training`, {
      method: 'GET',
      headers: auth.headers,
    });
    const raw = await res.text();
    const parsed = tryParseApiJson(raw);
    if (!res.ok) {
      return {
        ok: false,
        message: userFacingError(
          messageFromParsed(parsed, 'Could not load training.'),
          'Could not load training. Pull down to refresh.',
        ),
      };
    }
    const trainingsRaw =
      parsed && typeof parsed === 'object' && Array.isArray((parsed as { trainings?: unknown }).trainings)
        ? (parsed as { trainings: unknown[] }).trainings
        : [];
    const trainings = trainingsRaw.map(asSummary).filter(Boolean) as TrainingSummary[];
    return { ok: true, trainings };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Could not load training.';
    return { ok: false, message: userFacingError(message, 'Could not load training. Pull down to refresh.') };
  }
}

export async function fetchTrainingDetail(assignmentId: number): Promise<FetchTrainingDetailResult> {
  const auth = await tenantAuthHeaders();
  if (!auth.ok) return auth;

  try {
    let parsed: unknown = null;
    let resOk = false;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/training/${assignmentId}`, {
        method: 'GET',
        headers: {
          ...auth.headers,
          'Cache-Control': 'no-cache',
        },
      });
      const raw = await res.text();
      parsed = tryParseApiJson(raw);
      resOk = res.ok;
      if (!res.ok || parsed != null) break;
    }
    if (!resOk) {
      return {
        ok: false,
        message: userFacingError(
          messageFromParsed(parsed, 'Could not load this training.'),
          'Could not load this training.',
        ),
      };
    }
    const detail = asDetail(parsed);
    if (!detail) return { ok: false, message: 'Could not load this training.' };
    return { ok: true, detail };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Could not load this training.';
    return { ok: false, message: userFacingError(message, 'Could not load this training.') };
  }
}

export async function acknowledgeTrainingMaterials(
  assignmentId: number,
): Promise<FetchTrainingDetailResult> {
  const auth = await tenantAuthHeaders();
  if (!auth.ok) return auth;

  try {
    const res = await fetchWithTimeout(
      `${API_BASE_URL}/api/v1/training/${assignmentId}/acknowledge-materials`,
      {
        method: 'POST',
        headers: auth.headers,
        body: '{}',
      },
    );
    const raw = await res.text();
    const parsed = tryParseApiJson(raw);
    if (!res.ok) {
      return {
        ok: false,
        message: userFacingError(
          messageFromParsed(parsed, 'Could not unlock the quiz.'),
          'Could not unlock the quiz.',
        ),
      };
    }
    const detail = asDetail(parsed);
    if (!detail) return { ok: false, message: 'Could not unlock the quiz.' };
    return { ok: true, detail };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Could not unlock the quiz.';
    return { ok: false, message: userFacingError(message, 'Could not unlock the quiz.') };
  }
}

export async function submitTrainingAnswers(
  assignmentId: number,
  answers: Record<string, unknown>[],
  signature?: TrainingSignature | null,
  abandoned = false,
): Promise<FetchTrainingDetailResult> {
  const auth = await tenantAuthHeaders();
  if (!auth.ok) return auth;

  try {
    const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/training/${assignmentId}/submit`, {
      method: 'POST',
      headers: auth.headers,
      body: JSON.stringify({
        answers,
        ...(abandoned ? { abandoned: true } : {}),
        ...(signature
          ? {
              signature_width: Math.max(1, Math.round(Number(signature.width) || 1)),
              signature_height: Math.max(1, Math.round(Number(signature.height) || 1)),
              signature_strokes: signature.strokes,
            }
          : {}),
      }),
    });
    const raw = await res.text();
    const parsed = tryParseApiJson(raw);
    if (!res.ok) {
      return {
        ok: false,
        message: userFacingError(
          messageFromParsed(parsed, 'Could not submit your answers.'),
          'Could not submit your answers.',
        ),
      };
    }
    const detail = asDetail(parsed);
    if (!detail) return { ok: false, message: 'Could not submit your answers.' };
    return { ok: true, detail };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Could not submit your answers.';
    return { ok: false, message: userFacingError(message, 'Could not submit your answers.') };
  }
}

async function postTrainingAction(
  assignmentId: number,
  action: 'retake' | 'finish',
  fallback: string,
): Promise<FetchTrainingDetailResult> {
  const auth = await tenantAuthHeaders();
  if (!auth.ok) return auth;
  try {
    const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/training/${assignmentId}/${action}`, {
      method: 'POST',
      headers: auth.headers,
      body: '{}',
    });
    const raw = await res.text();
    const parsed = tryParseApiJson(raw);
    if (!res.ok) {
      return { ok: false, message: userFacingError(messageFromParsed(parsed, fallback), fallback) };
    }
    const detail = asDetail(parsed);
    if (!detail) return { ok: false, message: fallback };
    return { ok: true, detail };
  } catch (e) {
    const message = e instanceof Error ? e.message : fallback;
    return { ok: false, message: userFacingError(message, fallback) };
  }
}

export function retakeTraining(assignmentId: number): Promise<FetchTrainingDetailResult> {
  return postTrainingAction(assignmentId, 'retake', 'Could not start another attempt.');
}

export function finishTraining(assignmentId: number): Promise<FetchTrainingDetailResult> {
  return postTrainingAction(assignmentId, 'finish', 'Could not finish this training.');
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  // Encode in multiples of 3 so each chunk's base64 can be concatenated.
  const chunkSize = 8184;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    let binary = '';
    const end = Math.min(i + chunkSize, bytes.length);
    for (let j = i; j < end; j += 1) {
      binary += String.fromCharCode(bytes[j]!);
    }
    parts.push(globalThis.btoa(binary));
  }
  return parts.join('');
}

type SlideBlobResponse = {
  path: () => string | null;
  info: () => { status?: number; headers?: Record<string, string> };
  flush: () => void;
};

type SlideBlob = {
  config: (options: { fileCache?: boolean; timeout?: number }) => {
    fetch: (method: string, url: string, headers?: Record<string, string>) => Promise<SlideBlobResponse>;
  };
  fs: {
    dirs: { CacheDir?: string };
    mv: (from: string, to: string) => Promise<boolean>;
    writeFile: (path: string, data: string, encoding?: string) => Promise<void>;
  };
};

function loadSlideBlob(): SlideBlob | null {
  const linked =
    Boolean(NativeModules.ReactNativeBlobUtil) ||
    TurboModuleRegistry.get('ReactNativeBlobUtil') != null;
  if (!linked) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-blob-util').default as SlideBlob;
    if (!mod?.config || !mod.fs?.dirs?.CacheDir || !mod.fs.mv || !mod.fs.writeFile) return null;
    return mod;
  } catch {
    return null;
  }
}

function extFromContentType(contentType: string): string {
  const mime = contentType.split(';')[0]?.trim().toLowerCase() ?? '';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/gif') return 'gif';
  return 'jpg';
}

function asFileImageUri(path: string): string {
  if (path.startsWith('file://') || path.startsWith('content://')) return path;
  return `file://${path}`;
}

const slideImageCache = new Map<string, string>();
const slideImageLoads = new Map<string, Promise<string | null>>();

export function trainingPageImageUrl(pageId: number): string {
  return `${API_BASE_URL}/api/v1/training/pages/${pageId}/image`;
}

export function trainingSectionImageUrl(sectionId: number): string {
  return `${API_BASE_URL}/api/v1/training/sections/${sectionId}/image`;
}

export function trainingQuestionMediaUrl(questionId: number, version?: string | null): string {
  const base = `${API_BASE_URL}/api/v1/training/questions/${questionId}/media`;
  return version ? `${base}?v=${encodeURIComponent(version)}` : base;
}

export function trainingBlockFileUrl(blockId: number): string {
  return `${API_BASE_URL}/api/v1/training/blocks/${blockId}/file`;
}

/**
 * Protected slide picture as a local file URI.
 * Android's Image view drops large `data:` URIs and ignores auth headers, so the
 * bytes are saved in the app cache and shown from `file://`.
 */
export function fetchTrainingImage(url: string): Promise<string | null> {
  const cached = slideImageCache.get(url);
  if (cached) return Promise.resolve(cached);
  const pending = slideImageLoads.get(url);
  if (pending) return pending;
  const job = loadTrainingImage(url).finally(() => {
    slideImageLoads.delete(url);
  });
  slideImageLoads.set(url, job);
  return job;
}

async function loadTrainingImage(url: string): Promise<string | null> {
  const auth = await tenantAuthHeaders();
  if (!auth.ok) return null;
  const headers = {
    Authorization: auth.headers.Authorization,
    'X-Company-Slug': auth.headers['X-Company-Slug'] ?? '',
    Accept: 'image/jpeg, image/png, image/webp, image/gif, */*',
  };
  const blob = loadSlideBlob();

  try {
    const res = await fetchWithTimeout(
      url,
      { method: 'GET', headers },
      { timeoutMs: 30_000, retries: 1, retryDelayMs: 400 },
    );
    if (!res.ok) return null;
    const mime = res.headers.get('content-type')?.split(';')?.[0]?.trim() || '';
    if (mime !== '' && !mime.startsWith('image/')) return null;
    const bytes = await res.arrayBuffer();
    if (!looksLikeImage(bytes)) return null;
    const uri = blob
      ? await writeSlideBytes(blob, bytes, mime || 'image/jpeg')
      : `data:${mime || 'image/jpeg'};base64,${arrayBufferToBase64(bytes)}`;
    if (!uri) return null;
    slideImageCache.set(url, uri);
    return uri;
  } catch {
    return null;
  }
}

function looksLikeImage(bytes: ArrayBuffer): boolean {
  if (bytes.byteLength < 32) return false;
  const head = new Uint8Array(bytes.slice(0, 12));
  if (head[0] === 0xff && head[1] === 0xd8) return true;
  if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) return true;
  if (head[0] === 0x47 && head[1] === 0x49 && head[2] === 0x46) return true;
  const riff = String.fromCharCode(head[0] ?? 0, head[1] ?? 0, head[2] ?? 0, head[3] ?? 0);
  const webp = String.fromCharCode(head[8] ?? 0, head[9] ?? 0, head[10] ?? 0, head[11] ?? 0);
  return riff === 'RIFF' && webp === 'WEBP';
}

export async function trainingMediaRequest(url: string): Promise<
  | { ok: true; url: string; authorization: string; company: string }
  | { ok: false; message: string }
> {
  const auth = await tenantAuthHeaders();
  if (!auth.ok) return auth;
  return {
    ok: true,
    url,
    authorization: auth.headers.Authorization,
    company: auth.headers['X-Company-Slug'] ?? '',
  };
}

export async function trainingVideoRequest(blockId: number): Promise<
  | { ok: true; url: string; authorization: string; company: string }
  | { ok: false; message: string }
> {
  return trainingMediaRequest(trainingBlockFileUrl(blockId));
}

export async function openTrainingBlockFile(
  blockId: number,
  fileName: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const auth = await tenantAuthHeaders();
  if (!auth.ok) return auth;
  const blob = loadSlideBlob();
  if (!blob?.fs.dirs.CacheDir) return { ok: false, message: 'This file cannot be opened on this device.' };

  // Same request shape as slide pictures, which already load. The blob-util file
  // cache rejects these responses before a PDF or video app can open them.
  try {
    const res = await fetchWithTimeout(
      trainingBlockFileUrl(blockId),
      {
        method: 'GET',
        headers: {
          Authorization: auth.headers.Authorization,
          'X-Company-Slug': auth.headers['X-Company-Slug'] ?? '',
          Accept: 'application/json, application/pdf, video/mp4, */*',
        },
      },
      { timeoutMs: 120_000, retries: 1, retryDelayMs: 600 },
    );
    if (!res.ok) return { ok: false, message: messageForFileStatus(res.status) };
    const contentType = res.headers.get('content-type')?.split(';')?.[0]?.trim() || 'application/octet-stream';
    if (contentType.includes('json') || contentType.startsWith('text/')) {
      return { ok: false, message: 'Could not open this file.' };
    }
    const bytes = await res.arrayBuffer();
    if (!bodyLooksLikeMedia(bytes, contentType)) {
      return { ok: false, message: 'Could not open this file.' };
    }
    const named = safeOpenName(fileName, contentType);
    const path = await writeCachedBytes(blob, `training-${blockId}-${named}`, bytes);
    if (!path) return { ok: false, message: 'Could not save this file on your device.' };
    return openCachedFile(path, contentType, named);
  } catch {
    return { ok: false, message: 'Could not open this file. Check your connection.' };
  }
}

function messageForFileStatus(status: number): string {
  if (status === 401) return 'Sign in again, then try opening this file.';
  if (status === 403) return 'You do not have access to this file.';
  if (status === 404) return 'This file is no longer available.';
  return 'Could not open this file.';
}

function bodyLooksLikeMedia(bytes: ArrayBuffer, mime: string): boolean {
  if (bytes.byteLength < 8) return false;
  const head = new Uint8Array(bytes.slice(0, 12));
  const start = String.fromCharCode(head[0] ?? 0, head[1] ?? 0, head[2] ?? 0, head[3] ?? 0, head[4] ?? 0);
  if (start.startsWith('%PDF')) return true;
  if (start.startsWith('<') || start.startsWith('{')) return false;
  const brand = String.fromCharCode(head[4] ?? 0, head[5] ?? 0, head[6] ?? 0, head[7] ?? 0);
  if (brand === 'ftyp') return true;
  if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return true;
  const base = mime.split(';')[0]?.trim().toLowerCase() ?? '';
  return base === 'application/pdf' || base.startsWith('video/');
}

function safeOpenName(fileName: string, mime: string): string {
  const trimmed = fileName.trim() || 'training';
  const dot = trimmed.lastIndexOf('.');
  const rawExt = dot > 0 ? trimmed.slice(dot + 1).toLowerCase() : '';
  const stem = (dot > 0 ? trimmed.slice(0, dot) : trimmed).replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'training';
  let ext = ['pdf', 'mp4', 'mov', 'webm', 'm4v'].includes(rawExt) ? rawExt : '';
  const base = mime.split(';')[0]?.trim().toLowerCase() ?? '';
  if (!ext && base === 'application/pdf') ext = 'pdf';
  if (!ext && base === 'video/webm') ext = 'webm';
  if (!ext && base === 'video/quicktime') ext = 'mov';
  if (!ext && base.startsWith('video/')) ext = 'mp4';
  return ext ? `${stem}.${ext}` : stem;
}

async function writeCachedBytes(blob: SlideBlob, fileName: string, bytes: ArrayBuffer): Promise<string | null> {
  const cacheDir = blob.fs.dirs.CacheDir;
  if (!cacheDir) return null;
  const dest = `${cacheDir}/${fileName}`;
  const fs = blob.fs as SlideBlob['fs'] & {
    exists?: (path: string) => Promise<boolean>;
    unlink?: (path: string) => Promise<void>;
    appendFile?: (path: string, data: string, encoding?: string) => Promise<void>;
  };
  try {
    if (fs.exists && fs.unlink && (await fs.exists(dest))) await fs.unlink(dest);
  } catch {
    // A leftover copy is replaced by the write below.
  }
  try {
    const view = new Uint8Array(bytes);
    const chunkSize = 8184;
    for (let offset = 0; offset < view.length; offset += chunkSize) {
      const slice = view.subarray(offset, Math.min(offset + chunkSize, view.length));
      const copy = slice.buffer.slice(slice.byteOffset, slice.byteOffset + slice.byteLength);
      const encoded = arrayBufferToBase64(copy);
      if (offset === 0) await fs.writeFile(dest, encoded, 'base64');
      else if (fs.appendFile) await fs.appendFile(dest, encoded, 'base64');
      else return null;
    }
    return dest;
  } catch {
    return null;
  }
}

async function openCachedFile(
  path: string,
  mime: string,
  fileName: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const base = mime.split(';')[0]?.trim().toLowerCase() ?? '';
  const isPdf = base === 'application/pdf' || path.toLowerCase().endsWith('.pdf');
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const blob = require('react-native-blob-util').default as {
      ios?: { openDocument: (path: string) => void };
      android?: {
        actionViewIntent: (path: string, mime: string, title?: string | null) => Promise<void>;
        addCompleteDownload?: (config: {
          title: string;
          description: string;
          mime: string;
          path: string;
          showNotification: boolean;
        }) => Promise<void>;
      };
      MediaCollection?: {
        copyToMediaStore: (
          options: { name: string; parentFolder: string; mimeType: string },
          collection: 'Download' | 'Image' | 'Video' | 'Audio',
          path: string,
        ) => Promise<string>;
      };
    };
    if (Platform.OS === 'ios' && blob.ios?.openDocument) {
      blob.ios.openDocument(path);
      return { ok: true };
    }
    if (blob.android?.actionViewIntent) {
      const ext = path.split('.').pop()?.toLowerCase() ?? '';
      const preferred = isPdf
        ? 'application/pdf'
        : ext === 'mp4' || ext === 'm4v'
          ? 'video/mp4'
          : ext === 'mov'
            ? 'video/quicktime'
            : ext === 'webm'
              ? 'video/webm'
              : base || 'application/octet-stream';
      const candidates = isPdf
        ? ['application/pdf', 'application/octet-stream']
        : [preferred, base, 'application/octet-stream'].filter(
            (value, index, all) => value !== '' && all.indexOf(value) === index,
          );
      for (const candidate of candidates) {
        try {
          await blob.android.actionViewIntent(path, candidate, null);
          return { ok: true };
        } catch {
          // The download cache is not always readable by a PDF or video app.
        }
      }
      if (blob.MediaCollection?.copyToMediaStore) {
        try {
          const shared = await blob.MediaCollection.copyToMediaStore(
            { name: fileName, parentFolder: 'CruLynk', mimeType: preferred },
            ext === 'mp4' || ext === 'mov' || ext === 'webm' || ext === 'm4v' ? 'Video' : 'Download',
            path,
          );
          if (shared) {
            for (const candidate of candidates) {
              try {
                await blob.android.actionViewIntent(shared, candidate, null);
                return { ok: true };
              } catch {
                // Try the next type.
              }
            }
          }
        } catch {
          // Shared storage did not accept the file.
        }
      }
      if (blob.android.addCompleteDownload) {
        try {
          await blob.android.addCompleteDownload({
            title: fileName,
            description: isPdf ? 'Training PDF' : 'Training file',
            mime: preferred,
            path,
            showNotification: true,
          });
          return { ok: true };
        } catch {
          // The system download list could not take the file either.
        }
      }
      return {
        ok: false,
        message: isPdf
          ? 'Could not open this PDF. Install a PDF viewer, then try again.'
          : ext === 'mp4' || ext === 'mov' || ext === 'webm' || ext === 'm4v'
            ? 'Could not open this video. Install a video player, then try again.'
            : 'Could not open this file on your device.',
      };
    }
  } catch {
    return { ok: false, message: 'Could not open this file on your device.' };
  }
  return { ok: false, message: 'Could not open this file on your device.' };
}

export function safeTrainingHttpUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  if (!/^https?:\/\//i.test(trimmed)) return null;
  return trimmed;
}

async function writeSlideBytes(blob: SlideBlob, bytes: ArrayBuffer, mime: string): Promise<string | null> {
  const cacheDir = blob.fs.dirs.CacheDir;
  if (!cacheDir) return null;
  const path = `${cacheDir}/training-slide-${Date.now()}-${Math.floor(Math.random() * 1e6)}.${extFromContentType(mime)}`;
  await blob.fs.writeFile(path, arrayBufferToBase64(bytes), 'base64');
  return asFileImageUri(path);
}
