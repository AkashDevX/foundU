import AsyncStorage from '@react-native-async-storage/async-storage';

const FIRED_KEYS = 'foundu:break_window_reminders_v1';

function firedKey(opensAt: string, kind: 'approach' | 'open'): string {
  return `${opensAt}:${kind}`;
}

async function readFiredSet(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(FIRED_KEYS);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((value): value is string => typeof value === 'string'));
  } catch {
    return new Set();
  }
}

export async function hasFiredBreakReminder(
  opensAt: string,
  kind: 'approach' | 'open',
): Promise<boolean> {
  const set = await readFiredSet();
  return set.has(firedKey(opensAt, kind));
}

export async function markBreakReminderFired(
  opensAt: string,
  kind: 'approach' | 'open',
): Promise<void> {
  const set = await readFiredSet();
  set.add(firedKey(opensAt, kind));
  const trimmed = [...set].slice(-40);
  await AsyncStorage.setItem(FIRED_KEYS, JSON.stringify(trimmed));
}
