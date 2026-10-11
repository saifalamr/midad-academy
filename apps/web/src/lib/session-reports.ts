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

export const reportTemplates = [
  {
    id: 'excellent',
    title: 'أداء ممتاز',
    attended: true,
    performance: 'EXCELLENT' as const,
    note: 'أظهر {name} فهمًا ممتازًا لمحتوى الحصة. أتقن: [اكتب المهارة]. للمراجعة في المنزل: [اكتب نشاطًا قصيرًا].',
  },
  {
    id: 'good',
    title: 'أداء جيد',
    attended: true,
    performance: 'GOOD' as const,
    note: 'تقدم {name} بشكل جيد في الحصة. نجح في: [اكتب المهارة]. يحتاج إلى تدريب إضافي على: [اكتب نقطة المراجعة].',
  },
  {
    id: 'support',
    title: 'يحتاج مراجعة',
    attended: true,
    performance: 'NEEDS_SUPPORT' as const,
    note: 'شارك {name} في أنشطة الحصة ويحتاج إلى دعم في: [اكتب المهارة]. نقترح في المنزل: [اكتب تدريبًا مناسبًا].',
  },
  {
    id: 'absent',
    title: 'غياب عن الحصة',
    attended: false,
    performance: 'NOT_ASSESSED' as const,
    note: 'لم يُسجل حضور {name} لهذه الحصة. يرجى التواصل مع الأكاديمية لترتيب متابعة المواد والواجب المطلوب.',
  },
];
