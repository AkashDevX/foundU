export type TrainingStatus =
  | 'not_started'
  | 'studying'
  | 'in_quiz'
  | 'pending_review'
  | 'failed'
  | 'completed';

export type TrainingQuestionType =
  | 'multiple_choice'
  | 'single_choice'
  | 'multiple_answer'
  | 'true_false'
  | 'yes_no'
  | 'short_answer'
  | 'scenario'
  | 'matching'
  | 'ordering'
  | 'fill_blank'
  | 'image'
  | 'video';

export type TrainingBand = 'strong' | 'pass' | 'weak' | 'fail' | 'pending';

export type TrainingSignature = {
  width: number;
  height: number;
  strokes: { x: number; y: number }[][];
};

export type TrainingCertificate = {
  reference_number: string;
  employee_name: string;
  training_name: string;
  company_name: string;
  completed_on: string | null;
  completed_on_label: string | null;
  expires_on: string | null;
  expires_on_label: string | null;
  signature?: TrainingSignature | null;
};

export type TrainingSummary = {
  id: number;
  module_id: number | null;
  title: string;
  description: string | null;
  pass_percent: number | null;
  question_time_seconds: number;
  issues_certificate?: boolean;
  quiz_required?: boolean;
  allow_retakes?: boolean;
  quiz_waived?: boolean;
  can_retry?: boolean;
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
  is_induction?: boolean;
  max_attempts?: number | null;
  attempts_used?: number;
  attempts_remaining?: number | null;
  certificate?: TrainingCertificate | null;
};

export type InductionAttemptState = {
  is_induction: boolean;
  can_retry: boolean;
  attempts_used: number;
  max_attempts: number;
  attempts_remaining: number;
  passed: boolean;
  locked: boolean;
};

export type TrainingBlockKind =
  | 'text'
  | 'pdf'
  | 'photo'
  | 'video'
  | 'link'
  | 'instruction'
  | 'note';

export type TrainingBlock = {
  id: number;
  kind: TrainingBlockKind;
  label: string | null;
  body: string | null;
  has_file: boolean;
  file_ext: string | null;
};

export type TrainingPageSection = {
  id: number;
  title: string;
  body: string;
  has_image: boolean;
  layout: string[] | null;
  blocks: TrainingBlock[];
  sort_order: number;
};

export type TrainingPage = {
  id: number;
  title: string;
  body: string;
  bullets: string[];
  has_image: boolean;
  layout: string[] | null;
  blocks: TrainingBlock[];
  sort_order: number;
  sections: TrainingPageSection[];
};

export type TrainingOption = {
  id: number;
  option_text: string;
  is_correct?: boolean;
  match_text?: string | null;
};

export type TrainingMatch = {
  option_id: number;
  match_text: string;
};

export type TrainingQuizDraft = {
  optionId?: number;
  optionIds?: number[];
  text?: string;
  order?: number[];
  matches?: Record<number, string>;
};

export type TrainingQuestion = {
  id: number;
  question_type: TrainingQuestionType;
  question_text: string;
  prompt: string | null;
  points: number;
  allow_multiple: boolean;
  requires_review: boolean;
  has_media: boolean;
  media_kind: 'image' | 'video' | null;
  media_version?: string | null;
  explanation: string | null;
  options: TrainingOption[];
  match_choices: string[];
  correct_option_ids?: number[];
  selected_option_id?: number | null;
  selected_option_ids?: number[];
  response_text?: string | null;
  response_order?: number[];
  response_matches?: TrainingMatch[];
  is_correct?: boolean | null;
  review_status?: 'pending' | 'approved' | 'rejected' | null;
  points_awarded?: number | null;
};

export type TrainingResult = {
  score: number | null;
  max_score: number | null;
  percent: number | null;
  passed: boolean | null;
  pass_percent: number | null;
  band: TrainingBand;
  submitted_at: string | null;
  quiz_waived?: boolean;
  pending_review?: boolean;
};

export type TrainingDetail = {
  assignment: TrainingSummary;
  pages: TrainingPage[];
  quiz_unlocked: boolean;
  questions: TrainingQuestion[];
  result: TrainingResult | null;
  induction?: InductionAttemptState | null;
};
