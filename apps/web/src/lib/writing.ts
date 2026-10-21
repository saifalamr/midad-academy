export type WritingPoint = { x: number; y: number };
export type WritingStrokes = WritingPoint[][];
export type WritingGuideResult = {
  status: 'ON_TRACK' | 'PRACTICE';
  steps: { index: number; passed: boolean; message: string }[];
  extra: number;
  note: string;
};
export type WritingTemplate = {
  id: string;
  word: string;
  fontSize: number;
  mode: 'SIMPLE' | 'GUIDED';
  guides: WritingStrokes;
};
export type WritingTask = WritingTemplate & {
  title: string;
  sessionId: string;
  useAs: 'ACTIVITY' | 'HOMEWORK';
};
export type WritingAttempt = {
  id: string;
  strokes: WritingStrokes;
  guidance: WritingGuideResult | null;
  verdict: 'PENDING' | 'ACHIEVED' | 'PRACTICE';
  feedback: string;
  version: number;
  submittedAt: string;
  student: { user: { name: string } };
};
export const writingVerdicts = {
  PENDING: 'بانتظار مراجعة المعلم',
  ACHIEVED: 'أتقن التمرين',
  PRACTICE: 'يحتاج تدريبًا إضافيًا',
};
