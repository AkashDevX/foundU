import type { BreakWindow, BreakWindowPhase } from './timeClockStatus';

export const BREAK_WINDOW_APPROACH_NOTIFICATION_ID = 2310;
export const BREAK_WINDOW_OPEN_NOTIFICATION_ID = 2311;

export function isInsideBreakWindow(window: BreakWindow, nowMs: number): boolean {
  const opens = Date.parse(window.opens_at);
  const closes = Date.parse(window.closes_at);
  if (!Number.isFinite(opens) || !Number.isFinite(closes)) return window.within_window;
  return nowMs >= opens && nowMs <= closes;
}

export function resolveBreakPhase(
  window: BreakWindow,
  nowMs: number,
  onBreak: boolean,
): BreakWindowPhase {
  if (onBreak || window.phase === 'on_break') return 'on_break';
  if (window.break_taken || window.phase === 'taken') return 'taken';

  const opens = Date.parse(window.opens_at);
  const closes = Date.parse(window.closes_at);
  if (!Number.isFinite(opens) || !Number.isFinite(closes)) return window.phase;

  const leadMs = Math.max(0, window.reminder_lead_minutes) * 60_000;
  if (nowMs < opens - leadMs) return 'upcoming';
  if (nowMs < opens) return 'approaching';
  if (nowMs <= closes) return 'open';
  return 'closed';
}

/** Extra line under the main "Please take your break between …" sentence. */
export function breakWindowDetail(phase: BreakWindowPhase): string | null {
  switch (phase) {
    case 'approaching':
      return 'Your break window opens soon.';
    case 'open':
      return 'Your break window is open now.';
    case 'closed':
      return 'This break window has closed.';
    case 'taken':
      return 'You have taken your break.';
    default:
      return null;
  }
}

export function breakReminderCopy(
  kind: 'approach' | 'open',
  message: string,
): { title: string; message: string } {
  if (kind === 'open') {
    return { title: 'Time for your break', message };
  }
  return { title: 'Break window soon', message };
}
