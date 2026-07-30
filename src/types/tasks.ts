export type TaskPriority = 'high' | 'medium' | 'low';

export type TaskStatus = 'pending' | 'completed' | 'cancelled';

/** Normalized task row for the Tasks tab UI. */
export type EmployeeTask = {
  id: string;
  title: string;
  description: string;
  dueLabel: string;
  priority: TaskPriority;
  status: TaskStatus;
  completed: boolean;
  category: string;
  /** Optional site / location hint from backend. */
  locationLabel?: string;
  /** ISO date when due (for sorting). */
  dueAt?: string | null;
  /** When the employee completed the task (ISO). */
  completedAt?: string | null;
};

export type TasksListPayload = {
  tasks: EmployeeTask[];
  generated_at?: string;
};
