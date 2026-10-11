export type TaskPhotoRef = {
  index: number;
  name: string;
};

export type TaskSignature = {
  width: number;
  height: number;
  strokes: { x: number; y: number }[][];
};

export type TaskPriority = 'high' | 'medium' | 'low';

export type TaskStatus = 'pending' | 'completed' | 'cancelled';

/** Normalized task row for the Tasks tab UI. */
export type EmployeeTask = {
  id: string;
  title: string;
  description: string;
  /** Optional note from the person who assigned the task. */
  specialNote: string;
  dueLabel: string;
  priority: TaskPriority;
  status: TaskStatus;
  completed: boolean;
  /** True after the employee uploads before photos and starts the task. */
  started: boolean;
  startedAt?: string | null;
  category: string;
  /** Optional site / location hint from backend. */
  locationLabel?: string;
  /** ISO date when due (for sorting). */
  dueAt?: string | null;
  /** When the employee completed the task (ISO). */
  completedAt?: string | null;
  /** Photos the employee added when starting the task. */
  beforePhotos: TaskPhotoRef[];
  /** Photos the employee added when finishing the task. */
  afterPhotos: TaskPhotoRef[];
  /** Signature drawn when the employee finished the task. */
  signature: TaskSignature | null;
};

export type TasksListPayload = {
  tasks: EmployeeTask[];
  generated_at?: string;
};
