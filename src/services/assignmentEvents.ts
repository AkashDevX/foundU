import type { UserProfileSnapshot } from '../types/userProfile';

export type AssignmentChangeEvent = {
  profile: UserProfileSnapshot;
  source: 'poll' | 'refresh' | 'monitor';
};

type Listener = (event: AssignmentChangeEvent) => void;

const listeners = new Set<Listener>();

export function subscribeAssignmentChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyAssignmentChange(event: AssignmentChangeEvent): void {
  for (const listener of listeners) {
    listener(event);
  }
}
