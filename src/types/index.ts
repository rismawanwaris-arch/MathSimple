export type Difficulty = 'Mudah' | 'Menengah' | 'Sulit';

export type Category = 
  | 'Pertambahan' 
  | 'Pengurangan' 
  | 'Penulisan Nominal' 
  | 'Penyebutan Nominal' 
  | 'Operasi Campuran';

export type QuestionType = 'mcq' | 'input';

export interface Question {
  id: number;
  question_order: number;
  difficulty: Difficulty;
  category: Category;
  question_type: QuestionType;
  question_text: string;
  options?: string[] | null;
  correct_answer: string;
  points?: number;
}

export interface Participant {
  id?: string;
  full_name: string;
  created_at?: string;
}

export interface ExamSettings {
  id?: number;
  duration_minutes: number;
  autosubmit: boolean;
  warning_minutes: number;
}

export interface ExamSession {
  id?: string;
  participant_id?: string;
  participant_name?: string;
  started_at: string;
  finished_at?: string;
  time_limit_minutes: number;
  total_score: number;
  total_correct: number;
  status: 'in_progress' | 'completed' | 'timed_out';
}

export interface ExamAnswer {
  id?: string;
  session_id?: string;
  question_id: number;
  submitted_answer: string;
  is_correct: boolean;
}
