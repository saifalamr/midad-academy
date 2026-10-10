export const ACADEMY_WHATSAPP = '201039310464';

export type CourseInquiry = {
  title: string;
  month?: string | null;
  timeZone: string;
  sessions: { scheduledAt: string; durationMinutes: number }[];
};

export function sessionDate(value: string, timeZone: string) {
  return new Intl.DateTimeFormat('ar-EG', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  }).format(new Date(value));
}

export function courseInquiryUrl(course: CourseInquiry) {
  const dates = course.sessions.map((s) => sessionDate(s.scheduledAt, course.timeZone)).join('، ');
  const message = `مرحبًا، أنا مهتم بتسجيل ابني في دورة «${course.title}»${course.month ? ` لشهر ${course.month}` : ''}. ${dates ? `المواعيد المعروضة: ${dates} (${course.timeZone}).` : 'أرغب بمعرفة المواعيد المتاحة.'} أرجو التواصل معي لإكمال التسجيل.`;
  return `https://wa.me/${ACADEMY_WHATSAPP}?text=${encodeURIComponent(message)}`;
}

export const academyContactUrl = `https://wa.me/${ACADEMY_WHATSAPP}?text=${encodeURIComponent('مرحبًا، أحتاج مساعدة بخصوص حساب أبنائي وتسجيلهم في الأكاديمية.')}`;
