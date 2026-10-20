import { API_URL } from './config';
export const statusLabels: Record<string, string> = {
  PENDING: 'قيد مراجعة الإدارة',
  WAITLIST: 'قائمة الانتظار',
  APPROVED: 'التسجيل مؤكد',
  REJECTED: 'لم يعتمد الطلب',
  CANCELLED: 'ملغى',
  OPEN: 'بانتظار الرد',
  RESOLVED: 'تمت المعالجة',
  DECLINED: 'لم يعتمد',
  PAID: 'مدفوع',
  UNPAID: 'لم يسجل دفع',
  WAIVED: 'مجاني / إعفاء معتمد',
  REFUNDED: 'سُجل استرجاع فعلي',
  ACTIVE: 'مسجل',
  PAUSED: 'متوقف',
  COMPLETED: 'مكتملة',
  SCHEDULED: 'قادمة',
  LIVE: 'مباشرة الآن',
  NOT_STARTED: 'لم يبدأ',
  PRACTICING: 'يتدرّب',
  MASTERED: 'أتقن المهارة',
  ABSENCE: 'إبلاغ غياب',
  MAKEUP: 'طلب تعويض',
  WITHDRAWAL: 'طلب انسحاب',
  REFUND: 'طلب استرجاع',
  SUPPORT: 'طلب مساعدة',
  NEW: 'تسجيل جديد',
  RENEWAL: 'تجديد للشهر القادم',
};
export async function academyApi<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const token = localStorage.getItem('token') ?? sessionStorage.getItem('token');
  const res = await fetch(`${API_URL}/api${path}`, {
    method,
    cache: 'no-store',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const json = await res.json();
  if (!res.ok)
    throw new Error(
      json.issues?.map((x: { message: string }) => x.message).join('، ') ||
        json.error ||
        'تعذر إكمال العملية. حاول مجددًا.'
    );
  return json.data;
}
export function localTime(value: string) {
  return new Intl.DateTimeFormat('ar', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value)
  );
}
export function courseEnd(month: string | null) {
  if (!month) return 'حسب جدول الدورة';
  const [y, m] = month.split('-').map(Number);
  return new Intl.DateTimeFormat('ar', { dateStyle: 'medium', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m, 0))
  );
}
export type Child = {
  id: string;
  age: number;
  level: string;
  user: { name: string; username: string | null };
};
export type Course = {
  id: string;
  title: string;
  month: string | null;
  price: number;
  currency: string;
  ageGroup: string;
  timeZone: string;
  availableSeats?: number;
  enrollments?: { studentId: string; status: string; student: { user: { name: string } } }[];
};
export type ScheduleItem = {
  id: string;
  title: string;
  scheduledAt: string;
  durationMinutes: number;
  status: string;
  changeReason: string | null;
  makeupForId: string | null;
  course: Pick<Course, 'id' | 'title' | 'month' | 'timeZone'>;
};
export type Application = {
  id: string;
  version: number;
  status: string;
  kind: string;
  preferredTime: string;
  needsAssessment: boolean;
  levelNotes: string;
  response: string;
  quotedAmount: number;
  currency: string;
  paymentStatus: string;
  paymentReference: string;
  paidAt: string | null;
  course: Course;
  student: { id: string; age: number; user: { name: string; username: string | null } };
  parent: { user: { name: string; email: string } };
};
export type ServiceRequest = {
  id: string;
  version: number;
  kind: string;
  reason: string;
  response: string;
  status: string;
  student: { user: { name: string } };
  course: { title: string };
  session: { title: string; scheduledAt: string } | null;
};
export type Notice = {
  id: string;
  title: string;
  body: string;
  href: string;
  readAt: string | null;
  createdAt: string;
};
export type Policy = { content: string; published: boolean; version: number };
export type Skills = {
  course: { id: string; title: string };
  students: { id: string; level: string; user: { name: string } }[];
  skills: {
    id: string;
    title: string;
    progress: { studentId: string; status: string; note: string; version: number }[];
  }[];
};
