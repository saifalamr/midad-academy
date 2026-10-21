'use client';
import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import { PopupNotice, showPopup } from '@/components/FeedbackProvider';
import {
  academyApi as api,
  statusLabels as labels,
  localTime,
  type Course,
} from '@/lib/academy-workflow';
import { academyContactUrl, sessionDate } from '@/lib/academy-contact';
import { performanceLabels, homeworkLabels, type Report } from '@/lib/session-reports';
import '@/components/academy-workflow.css';
type Detail = {
  id: string;
  title: string;
  scheduledAt: string;
  durationMinutes: number;
  status: string;
  updatedAt: string;
  changeReason: string | null;
  makeupForId: string | null;
  makeups: { id: string; scheduledAt: string; status: string }[];
  course: Pick<Course, 'id' | 'title' | 'timeZone' | 'month'>;
  teacherName: string;
  notificationReceipts?: {
    id: string;
    title: string;
    createdAt: string;
    readAt: string | null;
    user: { name: string; role: string };
  }[];
  materials: { title: string; type: string }[];
  canJoin: boolean;
  observer: boolean;
  students: {
    id: string;
    name: string;
    attended: boolean;
    report: Report | null;
    homework: {
      title: string;
      submission: { submittedAt: string; publishedAt: string | null } | null;
    } | null;
    assessment: string | null;
  }[];
};
export default function SessionWorkspace({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useAuth();
  const [data, setData] = useState<Detail | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0);
  const [operation, setOperation] = useState('RESCHEDULE');
  useEffect(() => {
    let active = true;
    setError('');
    api<Detail>(`/academy/sessions/${id}`)
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [id, revision]);
  return (
    <main className="academy-flow wrap" dir="rtl">
      <Link href="/academy">العودة إلى المتابعة</Link>
      {error && (
        <PopupNotice>
          {error}
          <button className="btn btn-outline" onClick={() => setRevision((v) => v + 1)}>
            إعادة المحاولة
          </button>
        </PopupNotice>
      )}
      {!data ? (
        <p role="status">جارٍ فتح تفاصيل الحصة…</p>
      ) : (
        <>
          <header className="flow-head">
            <div>
              <span className="tag">{labels[data.status]}</span>
              <h1>{data.title}</h1>
              <p>
                {data.course.title} · المعلم: {data.teacherName}
              </p>
            </div>
            <button className="btn btn-outline" onClick={() => setRevision((v) => v + 1)}>
              تحديث حالة الحصة
            </button>
          </header>
          <section className="card pad">
            <h2>أنشطة الحصة</h2>
            <p>تدرّب على كتابة الحروف والكلمات المرتبطة بهذا الدرس، وتابع تقييم المعلم.</p>
            <Link className="btn btn-gold" href={'/sessions/' + data.id + '/writing'}>
              {user?.role === 'TEACHER' || user?.role === 'ADMIN'
                ? 'إعداد ومتابعة تمارين الكتابة'
                : 'نتدرّب على الكتابة'}
            </Link>
          </section>
          <section className="flow-grid">
            <article className="card pad">
              <h2>الموعد والدخول</h2>
              <p>
                <b>{localTime(data.scheduledAt)}</b> بتوقيت جهازك (
                {Intl.DateTimeFormat().resolvedOptions().timeZone})
              </p>
              <p>
                توقيت الأكاديمية: {sessionDate(data.scheduledAt, data.course.timeZone)} (
                {data.course.timeZone})
              </p>
              <p>المدة: {data.durationMinutes} دقيقة</p>
              {data.changeReason && <p>سبب التحديث: {data.changeReason}</p>}
              {data.makeupForId && (
                <Link href={`/sessions/${data.makeupForId}`}>هذه حصة تعويضية — الحصة الأصلية</Link>
              )}
              {data.makeups.map((m) => (
                <p key={m.id}>
                  <Link href={`/sessions/${m.id}`}>
                    التعويض: {localTime(m.scheduledAt)} · {labels[m.status]}
                  </Link>
                </p>
              ))}
              {data.canJoin ? (
                <Link
                  className="btn btn-gold"
                  href={`/classroom/${data.course.id}${data.observer ? '?observer=1' : ''}`}
                >
                  {data.observer ? 'مراقبة الحصة بدون مايك أو كاميرا' : 'دخول الحصة'}
                </Link>
              ) : (
                <p>
                  {data.status === 'SCHEDULED'
                    ? 'زر الدخول يتاح عندما يبدأ المعلم الحصة.'
                    : data.status === 'CANCELLED'
                      ? 'الحصة ملغاة؛ راجع التعويض أو أرسل طلبًا للإدارة.'
                      : 'انتهت الحصة؛ تابع الواجب والتقرير أدناه.'}
                </p>
              )}
              {user?.role === 'TEACHER' && data.status === 'SCHEDULED' && (
                <Link className="btn btn-gold" href={`/classroom/${data.course.id}`}>
                  تجهيز وبدء الحصة
                </Link>
              )}
            </article>
            <article className="card pad">
              <h2>محتوى الحصة</h2>
              {data.materials.length ? (
                <ul>
                  {data.materials.map((m, i) => (
                    <li key={i}>{m.title}</li>
                  ))}
                </ul>
              ) : (
                <p>لم تحدد مواد لهذه الحصة بعد.</p>
              )}
              {user?.role === 'STUDENT' && (
                <Link href={`/courses/${data.course.id}/lessons`} className="btn btn-outline">
                  فتح مواد الدورة
                </Link>
              )}
              {user?.role === 'TEACHER' && (
                <div className="flow-actions">
                  <Link href="/teacher/reports" className="btn btn-outline">
                    كتابة ونشر تقارير الطلاب
                  </Link>
                  <Link href="/teacher/homework" className="btn btn-outline">
                    تصحيح الواجبات
                  </Link>
                </div>
              )}
              {user?.role === 'ADMIN' && (
                <Link className="btn btn-outline" href="/admin">
                  إعداد المحتوى والواجب من الإدارة
                </Link>
              )}
              <Link className="btn btn-outline" href="/academy">
                مهارات المنهج ومتابعة التقدم
              </Link>
            </article>
          </section>
          <section className="flow-grid">
            {data.students.map((s) => (
              <article className="card pad" key={s.id}>
                <h2>{s.name}</h2>
                {data.status === 'COMPLETED' && (
                  <p>الحضور: {s.attended ? 'سُجل حضور الطالب' : 'لم يسجل حضور'}</p>
                )}
                {data.status !== 'COMPLETED' && <p>يُعرض ملخص الحضور بعد انتهاء الحصة.</p>}
                {s.assessment !== null && (
                  <p>ملاحظة طلب تحديد المستوى: {s.assessment || 'يحتاج تقييمًا قبل البداية'}</p>
                )}
                <h3>الواجب</h3>
                {s.homework ? (
                  <>
                    <p>
                      {s.homework.title} ·{' '}
                      {!s.homework.submission
                        ? 'بانتظار تسليم الطالب'
                        : s.homework.submission.publishedAt
                          ? 'تم نشر التقييم'
                          : 'سُلّم — بانتظار تصحيح المعلم'}
                    </p>
                    {user?.role !== 'ADMIN' && (
                      <Link
                        href={`/${user?.role.toLowerCase()}/homework/${data.id}`}
                        className="btn btn-outline"
                      >
                        فتح الواجب والتقييم
                      </Link>
                    )}
                  </>
                ) : (
                  <p>
                    {data.status === 'COMPLETED'
                      ? 'لم يُكلف بواجب لهذه الحصة.'
                      : 'الواجب يظهر بعد انتهاء الحصة.'}
                  </p>
                )}
                <h3>تقرير المعلم</h3>
                {s.report ? (
                  <>
                    <p>{s.report.publishedAt ? 'منشور للأسرة' : 'مسودة خاصة بالمعلم'}</p>
                    <p>
                      الأداء: {performanceLabels[s.report.performance]} · المشاركات:{' '}
                      {s.report.participationCount}
                    </p>
                    <p>الواجب: {homeworkLabels[s.report.homework]}</p>
                    <div className="flow-text">{s.report.note}</div>
                  </>
                ) : (
                  <p>لم ينشر المعلم التقرير بعد.</p>
                )}
              </article>
            ))}
          </section>
          {user?.role === 'PARENT' && (
            <div className="flow-actions">
              <Link className="btn btn-outline" href="/academy">
                إبلاغ غياب أو طلب تعويض
              </Link>
            </div>
          )}
          {user?.role === 'ADMIN' && (
            <article className="card pad">
              <h2>إدارة الموعد والتعويض</h2>
              <p>
                كل تغيير يُحفظ في السجل ويصل كإشعار داخل حساب المعلم والأسرة والطالب. الاطلاع على
                الإشعار مسجّل، ولا نفترض وصول واتساب.
              </p>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const d = new FormData(e.currentTarget);
                  setBusy(true);
                  setError('');
                  try {
                    await api(`/academy/sessions/${data.id}/schedule`, 'PATCH', {
                      action: operation,
                      updatedAt: data.updatedAt,
                      reason: d.get('reason'),
                      ...(operation !== 'CANCEL'
                        ? {
                            scheduledAt: new Date(String(d.get('scheduledAt'))).toISOString(),
                            durationMinutes: Number(d.get('durationMinutes')),
                          }
                        : {}),
                    });
                    showPopup('حُفظ الموعد وأُرسلت إشعارات داخل الحسابات');
                    setRevision((v) => v + 1);
                  } catch (e) {
                    setError(e instanceof Error ? e.message : 'تعذر تحديث الموعد');
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <fieldset disabled={busy} className="flow-body">
                  <label className="field">
                    الإجراء
                    <select
                      className="input"
                      value={operation}
                      onChange={(e) => setOperation(e.target.value)}
                    >
                      <option value="RESCHEDULE">تغيير الموعد</option>
                      <option value="CANCEL">إلغاء حصة قادمة</option>
                      <option value="MAKEUP">إنشاء حصة تعويضية للمجموعة كاملة</option>
                    </select>
                  </label>
                  {operation !== 'CANCEL' && (
                    <div className="flow-grid">
                      <label className="field">
                        الموعد الجديد بتوقيت جهازك
                        <input
                          name="scheduledAt"
                          type="datetime-local"
                          className="input"
                          required
                        />
                      </label>
                      <label className="field">
                        المدة بالدقائق
                        <input
                          name="durationMinutes"
                          type="number"
                          className="input"
                          min={5}
                          max={240}
                          required
                          defaultValue={data.durationMinutes}
                        />
                      </label>
                    </div>
                  )}
                  <label className="field">
                    سبب يظهر للأسرة
                    <textarea
                      className="input"
                      name="reason"
                      required
                      minLength={3}
                      maxLength={1000}
                    />
                  </label>
                  <button className="btn btn-gold">حفظ وإشعار المشاركين</button>
                </fieldset>
              </form>
              <h3>تأكيد الاطلاع على إشعارات هذه الحصة</h3>
              <p>التأكيد يظهر عندما يضغط المستلم «اطلعت على الإشعار». آخر 100 إشعار.</p>
              {data.notificationReceipts?.length ? (
                <ul>
                  {data.notificationReceipts.map((n) => (
                    <li key={n.id}>
                      {n.user.name} · {n.title} · أُرسل {localTime(n.createdAt)} ·{' '}
                      {n.readAt ? `أكد الاطلاع ${localTime(n.readAt)}` : 'لم يؤكد الاطلاع بعد'}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>لم تُرسل إشعارات تغيير لهذه الحصة بعد.</p>
              )}
            </article>
          )}
          <aside className="flow-help">
            <h2>تحتاج مساعدة في الدخول؟</h2>
            <p>
              تأكد من اتصال الإنترنت، واسمح للمتصفح باستخدام الميكروفون والكاميرا عند دخول الطالب أو
              المعلم. إذا انقطع الاتصال، أعد دخول الحصة من هذه الصفحة. ولي الأمر يراقب دون تشغيل
              أجهزة.
            </p>
            <Link href="/help">خطوات المساعدة</Link> ·{' '}
            <a href={academyContactUrl} target="_blank" rel="noopener noreferrer">
              التواصل مع الأكاديمية
            </a>
          </aside>
        </>
      )}
    </main>
  );
}
