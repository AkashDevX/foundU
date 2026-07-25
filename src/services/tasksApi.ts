import { API_BASE_URL } from '../config/api';
import { DEFAULT_APP_TIMEZONE } from '../config/timezone';
import type { EmployeeTask, TasksListPayload } from '../types/tasks';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import { tryParseApiJson } from '../utils/parseApiJson';
import {
  normalizeTask,
  parseTasksPayload,
  resolveTaskNumericId,
} from '../utils/tasksParse';
import { getAuthToken, getLastCompanySlug } from './authSessionStorage';
import { loadAccountProfile } from './accountProfileStorage';

export type FetchTasksResult =
  | { ok: true; payload: TasksListPayload }
  | { ok: false; message: string };

export type UpdateTaskResult =
  | { ok: true; task: EmployeeTask }
  | { ok: false; message: string };

export { normalizeTask } from '../utils/tasksParse';

const PRIMARY_TASKS_PATH = '/api/v1/tasks';

function todayIsoDate(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: DEFAULT_APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

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

function userFacingUpdateError(message: string): string {
  const lower = message.toLowerCase();
  if (
    lower.includes('api/v1') ||
    lower.includes('http://') ||
    lower.includes('https://') ||
    lower.includes('endpoint')
  ) {
    return 'Could not update this task. Pull down to refresh and try again.';
  }
  if (lower.includes('network') || lower.includes('connection') || lower.includes('reach')) {
    return 'Could not update this task. Check your connection and try again.';
  }
  return message.length > 160 ? 'Could not update this task. Try again.' : message;
}

function userFacingLoadError(message: string): string {
  const lower = message.toLowerCase();
  if (
    lower.includes('api/v1') ||
    lower.includes('http://') ||
    lower.includes('https://') ||
    lower.includes('endpoint')
  ) {
    return 'Could not load your tasks right now. Pull down to refresh.';
  }
  if (lower.includes('network') || lower.includes('connection') || lower.includes('reach')) {
    return 'Could not load your tasks. Check your connection and pull down to refresh.';
  }
  return message.length > 160 ? 'Could not load your tasks. Pull down to refresh.' : message;
}

function formatApiError(parsed: unknown, raw: string, forUpdate = false): string {
  const mapError = forUpdate ? userFacingUpdateError : userFacingLoadError;
  if (parsed && typeof parsed === 'object') {
    const msg = (parsed as { message?: unknown }).message;
    if (typeof msg === 'string' && msg.trim() !== '') return mapError(msg.trim());
  }
  const t = raw.trim();
  if (t !== '') return mapError(t.slice(0, 600));
  return forUpdate
    ? 'Could not update this task. Try again.'
    : 'Could not load your tasks. Pull down to refresh.';
}

function tasksListUrl(): string {
  const base = `${API_BASE_URL.replace(/\/$/, '')}${PRIMARY_TASKS_PATH}`;
  return `${base}?date=${encodeURIComponent(todayIsoDate())}`;
}

type UrlFetchOutcome = FetchTasksResult | 'not_found' | 'invalid' | 'network_error';

async function fetchTasksFromPrimaryEndpoint(
  headers: Record<string, string>,
): Promise<UrlFetchOutcome> {
  const url = tasksListUrl();

  let res: Response;
  try {
    res = await fetchWithTimeout(
      url,
      { method: 'GET', headers },
      { timeoutMs: 25_000, retries: 2, retryDelayMs: 800 },
    );
  } catch {
    return 'network_error';
  }

  const raw = await res.text();
  const parsed = tryParseApiJson(raw);

  if (res.status === 404) return 'not_found';
  if (res.status === 401 || res.status === 403) {
    return { ok: false, message: 'You do not have permission to view tasks. Try signing in again.' };
  }
  if (!res.ok) {
    return { ok: false, message: formatApiError(parsed, raw) };
  }

  const outcome = parseTasksPayload(parsed);
  if (!outcome.ok) {
    return 'invalid';
  }

  return { ok: true, payload: outcome.payload };
}

/**
 * Loads tasks assigned to the signed-in employee from `GET /api/v1/tasks`.
 */
export async function fetchAssignedTasks(): Promise<FetchTasksResult> {
  const auth = await tenantAuthHeaders();
  if (!auth.ok) return { ok: false, message: userFacingLoadError(auth.message) };

  const outcome = await fetchTasksFromPrimaryEndpoint(auth.headers);

  if (outcome === 'network_error') {
    return {
      ok: false,
      message: 'Could not load your tasks. Check your connection and pull down to refresh.',
    };
  }

  if (outcome === 'not_found') {
    return {
      ok: false,
      message:
        'Tasks are not available on this server yet. Make sure the latest backend is deployed, then try again.',
    };
  }

  if (outcome === 'invalid') {
    return {
      ok: false,
      message: 'Could not read tasks from the server. Pull down to refresh.',
    };
  }

  return outcome;
}

function buildFallbackTask(id: string, completed: boolean): EmployeeTask {
  return {
    id,
    title: 'Task',
    description: '',
    dueLabel: completed ? 'Completed' : 'Pending',
    priority: 'medium',
    status: completed ? 'completed' : 'pending',
    completed,
    category: 'Personal task',
  };
}

function parseUpdateTaskResponse(parsed: unknown, id: string, completed: boolean): UpdateTaskResult {
  const taskRaw =
    parsed && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>).task ??
        (parsed as Record<string, unknown>).data ??
        parsed
      : parsed;

  const task = normalizeTask(taskRaw);
  if (task) {
    return { ok: true, task };
  }
  return { ok: true, task: buildFallbackTask(id, completed) };
}

async function updateTaskCompletionViaPost(
  numericId: string,
  completed: boolean,
  headers: Record<string, string>,
): Promise<UpdateTaskResult> {
  const action = completed ? 'complete' : 'reopen';
  const url = `${API_BASE_URL.replace(/\/$/, '')}/api/v1/tasks/${encodeURIComponent(numericId)}/${action}`;

  let res: Response;
  try {
    res = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          completed,
          date: todayIsoDate(),
        }),
      },
      { timeoutMs: 20_000, retries: 0 },
    );
  } catch {
    return {
      ok: false,
      message: completed
        ? 'Could not mark the task complete. Check your connection and try again.'
        : 'Could not reopen the task. Check your connection and try again.',
    };
  }

  const raw = await res.text();
  const parsed = tryParseApiJson(raw);

  if (!res.ok) {
    return { ok: false, message: formatApiError(parsed, raw, true) };
  }

  return parseUpdateTaskResponse(parsed, numericId, completed);
}

export async function updateTaskCompletion(
  taskId: string,
  completed: boolean,
): Promise<UpdateTaskResult> {
  const auth = await tenantAuthHeaders();
  if (!auth.ok) return { ok: false, message: auth.message };

  const numericId = resolveTaskNumericId(taskId);
  if (!numericId) {
    return { ok: false, message: 'This task cannot be updated from the app.' };
  }

  const url = `${API_BASE_URL.replace(/\/$/, '')}/api/v1/tasks/${encodeURIComponent(numericId)}`;
  const body = {
    completed,
    date: todayIsoDate(),
  };

  let res: Response;
  try {
    res = await fetchWithTimeout(
      url,
      {
        method: 'PATCH',
        headers: auth.headers,
        body: JSON.stringify(body),
      },
      { timeoutMs: 20_000, retries: 1, retryDelayMs: 800 },
    );
  } catch {
    return {
      ok: false,
      message: completed
        ? 'Could not mark the task complete. Check your connection and try again.'
        : 'Could not reopen the task. Check your connection and try again.',
    };
  }

  const raw = await res.text();
  const parsed = tryParseApiJson(raw);

  if (res.status === 404 || res.status === 405) {
    return updateTaskCompletionViaPost(numericId, completed, auth.headers);
  }

  if (!res.ok) {
    return { ok: false, message: formatApiError(parsed, raw, true) };
  }

  return parseUpdateTaskResponse(parsed, numericId, completed);
}
