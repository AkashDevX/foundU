import { API_BASE_URL } from '../config/api';
import type { TrainingDetail, TrainingSummary } from '../types/training';
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
  };
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
                    title: typeof sec.title === 'string' ? sec.title : 'Subtopic',
                    body: typeof sec.body === 'string' ? sec.body : '',
                    sort_order: Number(sec.sort_order ?? 0),
                  };
                })
                .filter(Boolean)
            : [];
          return {
            id,
            title: typeof row.title === 'string' ? row.title : 'Page',
            body: typeof row.body === 'string' ? row.body : '',
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
                  };
                })
                .filter(Boolean)
            : [];
          return {
            id,
            question_text: typeof row.question_text === 'string' ? row.question_text : '',
            points: Number(row.points ?? 1),
            options: options as TrainingDetail['questions'][number]['options'],
            selected_option_id:
              row.selected_option_id != null ? Number(row.selected_option_id) : null,
            is_correct:
              typeof row.is_correct === 'boolean'
                ? row.is_correct
                : row.is_correct == null
                  ? null
                  : Boolean(row.is_correct),
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
    };
  }

  return {
    assignment,
    pages: pages as TrainingDetail['pages'],
    quiz_unlocked: Boolean(r.quiz_unlocked),
    questions: questions as TrainingDetail['questions'],
    result,
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
    const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/training/${assignmentId}`, {
      method: 'GET',
      headers: auth.headers,
    });
    const raw = await res.text();
    const parsed = tryParseApiJson(raw);
    if (!res.ok) {
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
  answers: { question_id: number; option_id: number }[],
): Promise<FetchTrainingDetailResult> {
  const auth = await tenantAuthHeaders();
  if (!auth.ok) return auth;

  try {
    const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/training/${assignmentId}/submit`, {
      method: 'POST',
      headers: auth.headers,
      body: JSON.stringify({ answers }),
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
