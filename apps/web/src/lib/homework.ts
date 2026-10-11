import { API_URL } from './config';
export type HomeworkQuestion = {
  id: string;
  text: string;
  type: 'MCQ' | 'TRUE_FALSE' | 'MATCHING';
  points: number;
  options?: string[];
  correctAnswer?: string;
  pairs?: { left: string; right: string }[];
  left?: string[];
};
export type HomeworkAnswer = string | string[];
export type Submission = {
  id: string;
  studentName?: string;
  answers: Record<string, HomeworkAnswer>;
  grades?: Record<string, number>;
  feedback?: string;
  version: number;
  publishedAt: string | null;
  submittedAt: string;
};
export type HomeworkData = {
  session: { id: string; title: string; status: string; course: { title: string } };
  homework: { title: string; questions: HomeworkQuestion[]; version: number } | null;
  submission?: Submission | null;
  submissions?: Submission[];
};
export async function homeworkApi(path: string, options: RequestInit = {}) {
  const response = await fetch(`${API_URL}/api/homework${path}`, {
    ...options,
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem('token') ?? sessionStorage.getItem('token')}`,
    },
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.issues?.[0]?.message || result.error || 'تعذر تحميل الواجب');
  return result.data;
}
export const answerLabel = (answer: HomeworkAnswer) =>
  Array.isArray(answer)
    ? answer.join(' · ')
    : answer === 'true'
      ? 'صح'
      : answer === 'false'
        ? 'خطأ'
        : answer;
