import type { TimeClockStatus } from '../services/timeClockApi';

export type TimeClockChangeEvent = {
  timeClock: TimeClockStatus;
  message?: string;
  source: 'manual' | 'auto_geofence_exit' | 'refresh';
};

type Listener = (event: TimeClockChangeEvent) => void;

const listeners = new Set<Listener>();

export function subscribeTimeClockChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyTimeClockChange(event: TimeClockChangeEvent): void {
  for (const listener of listeners) {
    listener(event);
  }
}
