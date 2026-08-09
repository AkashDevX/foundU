export type TrainingStatus = 'not_started' | 'studying' | 'in_quiz' | 'completed';

export type TrainingBand = 'strong' | 'pass' | 'weak' | 'fail' | 'pending';

export type TrainingSummary = {
  id: number;
  module_id: number | null;
  title: string;
  description: string | null;
  pass_percent: number | null;
  question_time_seconds: number;
  status: TrainingStatus;
  pages_count: number;
  questions_count: number;
  assigned_at: string | null;
  due_date: string | null;
  score: number | null;
  max_score: number | null;
  percent: number | null;
  passed: boolean | null;
  submitted_at: string | null;
  band: TrainingBand;
};

export type TrainingPageSection = {
  id: number;
  title: string;
  body: string;
  sort_order: number;
};

export type TrainingPage = {
  id: number;
  title: string;
  body: string;
  sort_order: number;
  sections: TrainingPageSection[];
};

export type TrainingOption = {
  id: number;
  option_text: string;
  is_correct?: boolean;
};

export type TrainingQuestion = {
  id: number;
  question_text: string;
  points: number;
  options: TrainingOption[];
  selected_option_id?: number | null;
  is_correct?: boolean | null;
};

export type TrainingResult = {
  score: number | null;
  max_score: number | null;
  percent: number | null;
  passed: boolean | null;
  pass_percent: number | null;
  band: TrainingBand;
  submitted_at: string | null;
};

export type TrainingDetail = {
  assignment: TrainingSummary;
  pages: TrainingPage[];
  quiz_unlocked: boolean;
  questions: TrainingQuestion[];
  result: TrainingResult | null;
};
