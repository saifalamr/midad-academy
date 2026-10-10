export const performanceLabels = {
  NOT_ASSESSED: 'لم يُقيّم',
  EXCELLENT: 'ممتاز',
  GOOD: 'جيد',
  NEEDS_SUPPORT: 'يحتاج دعمًا',
} as const;
export const homeworkLabels = {
  NOT_ASSIGNED: 'لم يُكلّف بواجب',
  COMPLETED: 'أنجز الواجب',
  PARTIAL: 'أنجز جزءًا منه',
  NOT_DONE: 'لم ينجزه',
} as const;
export type Report = {
  id: string;
  performance: keyof typeof performanceLabels;
  participationCount: number;
  homework: keyof typeof homeworkLabels;
  note: string;
  version: number;
  publishedAt: string | null;
};
