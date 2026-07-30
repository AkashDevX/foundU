import type { EmployeeTask, TaskPriority, TaskStatus, TasksListPayload } from '../types/tasks';

export type ParsedTasksResult =
  | { ok: true; payload: TasksListPayload }
  | { ok: false; reason: 'invalid' | 'empty' };

function normalizePriority(raw: unknown): TaskPriority {
  const p = String(raw ?? 'medium').toLowerCase().trim();
  if (p === 'high' || p === 'urgent' || p === 'critical') return 'high';
  if (p === 'low' || p === 'minor') return 'low';
  return 'medium';
}

function normalizeStatus(raw: unknown, completedFlag?: unknown): TaskStatus {
  if (completedFlag === true || completedFlag === 1 || completedFlag === '1') return 'completed';
  const s = String(raw ?? 'pending').toLowerCase().trim();
  if (s === 'completed' || s === 'complete' || s === 'done') return 'completed';
  if (s === 'cancelled' || s === 'canceled') return 'cancelled';
  return 'pending';
}

function formatDueLabel(row: Record<string, unknown>): string {
  const explicit =
    (typeof row.due_label === 'string' && row.due_label.trim()) ||
    (typeof row.dueLabel === 'string' && row.dueLabel.trim()) ||
    (typeof row.due_display === 'string' && row.due_display.trim()) ||
    (typeof row.dueDisplay === 'string' && row.dueDisplay.trim());
  if (explicit) return explicit;

  const dueRaw =
    row.due_at ??
    row.dueAt ??
    row.due_date ??
    row.dueDate ??
    row.deadline ??
    row.deadline_at ??
    row.scheduled_date ??
    row.scheduledDate;
  if (typeof dueRaw === 'string' && dueRaw.trim() !== '') {
    const d = new Date(dueRaw.includes('T') ? dueRaw : `${dueRaw}T12:00:00`);
    if (!Number.isNaN(d.getTime())) {
      const today = new Date();
      const sameDay =
        d.getFullYear() === today.getFullYear() &&
        d.getMonth() === today.getMonth() &&
        d.getDate() === today.getDate();
      const timeRange =
        (typeof row.time_range === 'string' && row.time_range.trim()) ||
        (typeof row.timeRange === 'string' && row.timeRange.trim()) ||
        '';
      const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
      if (sameDay) {
        return timeRange ? `Today · ${timeRange}` : `Today · ${time}`;
      }
      const dateLabel = d.toLocaleDateString(undefined, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      });
      return timeRange ? `${dateLabel} · ${timeRange}` : dateLabel;
    }
    return dueRaw.trim();
  }

  if (row.completed_at || row.completedAt) return 'Completed';
  return 'No due date';
}

function unwrapTaskRow(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;

  const attrs =
    row.attributes && typeof row.attributes === 'object' && !Array.isArray(row.attributes)
      ? (row.attributes as Record<string, unknown>)
      : null;

  const nestedTask =
    row.task && typeof row.task === 'object' && !Array.isArray(row.task)
      ? (row.task as Record<string, unknown>)
      : null;

  const merged: Record<string, unknown> = {
    ...(nestedTask ?? {}),
    ...(attrs ?? {}),
    ...row,
  };

  if (attrs?.id != null && merged.id == null) merged.id = attrs.id;
  if (nestedTask?.id != null && merged.id == null) merged.id = nestedTask.id;

  return merged;
}

export function normalizeTask(raw: unknown, fallbackIndex?: number): EmployeeTask | null {
  const row = unwrapTaskRow(raw);
  if (!row) return null;

  const idRaw =
    row.id ??
    row.task_id ??
    row.taskId ??
    row.uuid ??
    row.site_task_id ??
    row.employee_task_id;
  let id = idRaw != null ? String(idRaw).trim() : '';

  const sourceRaw = String(row.source ?? 'employee').toLowerCase().trim();
  if (id && (sourceRaw === 'site' || sourceRaw === 'employee')) {
    id = `${sourceRaw}-${id}`;
  }

  const title =
    (typeof row.title === 'string' && row.title.trim()) ||
    (typeof row.task_title === 'string' && row.task_title.trim()) ||
    (typeof row.taskTitle === 'string' && row.taskTitle.trim()) ||
    (typeof row.task_name === 'string' && row.task_name.trim()) ||
    (typeof row.taskName === 'string' && row.taskName.trim()) ||
    (typeof row.name === 'string' && row.name.trim()) ||
    (typeof row.subject === 'string' && row.subject.trim()) ||
    '';

  if (!id && title) {
    id = `task-${fallbackIndex ?? 0}-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`;
  }
  if (!id) return null;

  const description =
    (typeof row.description === 'string' && row.description.trim()) ||
    (typeof row.task_description === 'string' && row.task_description.trim()) ||
    (typeof row.details === 'string' && row.details.trim()) ||
    (typeof row.body === 'string' && row.body.trim()) ||
    (typeof row.notes === 'string' && row.notes.trim()) ||
    (typeof row.instructions === 'string' && row.instructions.trim()) ||
    '';

  const categoryFromSource =
    sourceRaw === 'site'
      ? 'Site task'
      : sourceRaw === 'employee'
        ? 'Personal task'
        : 'Personal task';

  const category =
    categoryFromSource ||
    (typeof row.category === 'string' && row.category.trim()) ||
    (typeof row.category_label === 'string' && row.category_label.trim()) ||
    'Personal task';

  const workLocationRaw = row.work_location ?? row.workLocation;
  const workLocationName =
    workLocationRaw &&
    typeof workLocationRaw === 'object' &&
    !Array.isArray(workLocationRaw) &&
    typeof (workLocationRaw as Record<string, unknown>).name === 'string'
      ? String((workLocationRaw as Record<string, unknown>).name).trim()
      : '';

  const locationLabel =
    workLocationName ||
    (typeof row.location === 'string' && row.location.trim()) ||
    (typeof row.location_label === 'string' && row.location_label.trim()) ||
    (typeof row.site_name === 'string' && row.site_name.trim()) ||
    undefined;

  const status = normalizeStatus(row.status ?? row.state, row.completed ?? row.is_completed ?? row.isCompleted);
  const completed = status === 'completed';

  const dueAtRaw =
    row.due_at ??
    row.dueAt ??
    row.due_date ??
    row.dueDate ??
    row.scheduled_date ??
    row.scheduledDate;
  const dueAt = typeof dueAtRaw === 'string' ? dueAtRaw : null;
  const completedAtRaw = row.completed_at ?? row.completedAt;
  const completedAt = typeof completedAtRaw === 'string' ? completedAtRaw : null;

  return {
    id,
    title: title || 'Untitled task',
    description,
    dueLabel: formatDueLabel(row),
    priority: normalizePriority(row.priority ?? row.priority_level ?? row.urgency),
    status,
    completed,
    category,
    locationLabel,
    dueAt,
    completedAt,
  };
}

function readCountTotal(value: unknown): number | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const total = (value as Record<string, unknown>).total;
  return typeof total === 'number' ? total : null;
}

/**
 * Pull task rows from every known foundUBackend / Laravel JSON shape.
 * Returns `[]` when the payload is a valid empty list, `null` when unrecognized.
 */
export function extractTaskRowsFromPayload(parsed: unknown): unknown[] | null {
  if (Array.isArray(parsed)) return parsed;
  if (!parsed || typeof parsed !== 'object') return null;

  const root = parsed as Record<string, unknown>;

  if (Array.isArray(root.tasks)) {
    return root.tasks;
  }

  const tasksNode = root.tasks;
  if (tasksNode && typeof tasksNode === 'object' && !Array.isArray(tasksNode)) {
    const wrapper = tasksNode as Record<string, unknown>;

    if (Array.isArray(wrapper.tasks)) {
      return wrapper.tasks;
    }

    const site = Array.isArray(wrapper.site_tasks)
      ? wrapper.site_tasks
      : Array.isArray(wrapper.siteTasks)
        ? wrapper.siteTasks
        : [];
    const assigned = Array.isArray(wrapper.assigned_tasks)
      ? wrapper.assigned_tasks
      : Array.isArray(wrapper.assignedTasks)
        ? wrapper.assignedTasks
        : [];

    if (
      site.length > 0 ||
      assigned.length > 0 ||
      'site_tasks' in wrapper ||
      'assigned_tasks' in wrapper ||
      'siteTasks' in wrapper ||
      'assignedTasks' in wrapper
    ) {
      return [...site, ...assigned];
    }

    const wrapperTotal = readCountTotal(wrapper.counts);
    if (wrapperTotal !== null) {
      return [];
    }
  }

  const data = root.data;
  if (data && typeof data === 'object') {
    const nested = extractTaskRowsFromPayload(data);
    if (nested !== null) return nested;
  }

  for (const key of ['assigned_tasks', 'assignedTasks', 'site_tasks', 'siteTasks', 'items', 'results']) {
    const value = root[key];
    if (Array.isArray(value) && value.length > 0) {
      return value;
    }
  }

  const rootTotal = readCountTotal(root.counts);
  if (rootTotal !== null) {
    return [];
  }

  return null;
}

function sortTasks(tasks: EmployeeTask[]): EmployeeTask[] {
  const priorityRank: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };
  return [...tasks].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    const pr = priorityRank[a.priority] - priorityRank[b.priority];
    if (pr !== 0) return pr;
    if (a.dueAt && b.dueAt) return a.dueAt.localeCompare(b.dueAt);
    if (a.dueAt) return -1;
    if (b.dueAt) return 1;
    return a.title.localeCompare(b.title);
  });
}

export function parseTasksPayload(parsed: unknown): ParsedTasksResult {
  const rows = extractTaskRowsFromPayload(parsed);
  if (rows === null) {
    return { ok: false, reason: 'invalid' };
  }

  const tasks = sortTasks(
    rows
      .map((item, index) => normalizeTask(item, index))
      .filter((task): task is EmployeeTask => task !== null),
  );

  const expectedTotal = (() => {
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const root = parsed as Record<string, unknown>;
    const tasksNode = root.tasks;
    if (tasksNode && typeof tasksNode === 'object' && !Array.isArray(tasksNode)) {
      return readCountTotal((tasksNode as Record<string, unknown>).counts);
    }
    return readCountTotal(root.counts);
  })();

  if (expectedTotal !== null && expectedTotal > 0 && tasks.length === 0) {
    return { ok: false, reason: 'invalid' };
  }

  const generatedAt =
    parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>).generated_at ??
        (parsed as Record<string, unknown>).generatedAt
      : undefined;

  return {
    ok: true,
    payload: {
      tasks,
      generated_at: typeof generatedAt === 'string' ? generatedAt : undefined,
    },
  };
}

/** Numeric id for PATCH /api/v1/tasks/{id} — supports `12` and legacy `employee-12`. */
export function resolveTaskNumericId(taskId: string): string | null {
  const trimmed = taskId.trim();
  const prefixed = trimmed.match(/^(?:site|employee)-(\d+)$/i);
  if (prefixed) return prefixed[1];
  if (/^\d+$/.test(trimmed)) return trimmed;
  return null;
}
