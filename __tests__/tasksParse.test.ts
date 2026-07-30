import {
  extractTaskRowsFromPayload,
  normalizeTask,
  parseTasksPayload,
  resolveTaskNumericId,
} from '../src/utils/tasksParse';

describe('tasksParse', () => {
  const assignment = {
    id: 20,
    title: 'Cover break at register 3',
    description: 'Help on register 3',
    scheduled_date: '2026-06-28',
    time_range: '12:00 – 12:30',
    work_location: { id: 2, name: 'Rose City Shopping Centre' },
    completed: false,
  };

  it('parses flat foundUBackend mobile payload', () => {
    const parsed = {
      date: '2026-06-28',
      tasks: [assignment],
      counts: { total: 1, completed: 0, pending: 1 },
    };

    const result = parseTasksPayload(parsed);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.payload.tasks).toHaveLength(1);
    expect(result.payload.tasks[0]?.title).toBe('Cover break at register 3');
    expect(result.payload.tasks[0]?.id).toBe('employee-20');
  });

  it('parses legacy double-nested tasks wrapper', () => {
    const parsed = {
      tasks: {
        date: '2026-06-28',
        tasks: [assignment],
        counts: { total: 1 },
      },
    };

    const rows = extractTaskRowsFromPayload(parsed);
    expect(rows).toHaveLength(1);
    expect(parseTasksPayload(parsed).ok).toBe(true);
  });

  it('parses legacy site_tasks and assigned_tasks wrapper', () => {
    const parsed = {
      tasks: {
        site_tasks: [{ id: 1, source: 'site', title: 'Site tidy' }],
        assigned_tasks: [assignment],
        counts: { total: 2 },
      },
    };

    const result = parseTasksPayload(parsed);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.payload.tasks).toHaveLength(2);
    expect(result.payload.tasks.map((task) => task.id).sort()).toEqual(['employee-20', 'site-1']);
  });

  it('returns invalid when counts say tasks exist but rows cannot be parsed', () => {
    const parsed = {
      tasks: [],
      counts: { total: 3 },
    };

    const result = parseTasksPayload(parsed);
    expect(result.ok).toBe(false);
  });

  it('resolves numeric and prefixed task ids', () => {
    expect(resolveTaskNumericId('20')).toBe('20');
    expect(resolveTaskNumericId('employee-20')).toBe('20');
    expect(resolveTaskNumericId('site-7')).toBe('7');
    expect(resolveTaskNumericId('task-abc')).toBeNull();
  });

  it('normalizes assignment without explicit source as personal task', () => {
    const task = normalizeTask(assignment);
    expect(task?.category).toBe('Personal task');
    expect(task?.locationLabel).toBe('Rose City Shopping Centre');
  });
});
