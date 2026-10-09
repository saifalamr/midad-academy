'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/Icon';
import { API_URL } from '@/lib/config';
import './admin.css';
type Person = {
  id: string;
  name: string;
  email: string;
  username: string | null;
  whatsappPhone: string | null;
};
type Teacher = { id: string; user: Person };
type Parent = Teacher & { _count: { children: number } };
type Student = Teacher & { age: number; parent: Teacher | null };
type Session = {
  id: string;
  title: string;
  scheduledAt: string;
  durationMinutes: number;
  status: string;
};
type Course = {
  id: string;
  title: string;
  description: string;
  month: string | null;
  timeZone: string;
  price: number;
  currency: string;
  ageGroup: string;
  maxStudents: number;
  teacher: Teacher;
  classSessions: Session[];
  enrollments: { studentId: string; status: string; student: { user: Person } }[];
};
type Overview = { teachers: Teacher[]; parents: Parent[]; students: Student[]; courses: Course[] };
const empty: Overview = { teachers: [], parents: [], students: [], courses: [] };
async function api(path: string, method = 'GET', body?: unknown) {
  const res = await fetch(`${API_URL}/api/admin${path}`, {
    method,
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem('token') ?? sessionStorage.getItem('token')}`,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.issues?.[0]?.message || json.error || 'تعذر حفظ التعديل');
  return json.data;
}
function values(form: HTMLFormElement) {
  return Object.fromEntries(new FormData(form));
}
function Field({
  label,
  name,
  type = 'text',
  required = true,
  value,
  min,
  max,
  disabled = false,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  value?: string | number;
  min?: number;
  max?: number;
  disabled?: boolean;
}) {
  return (
    <label className="field">
      {label}
      <input
        className="input"
        name={name}
        type={type}
        required={required}
        disabled={disabled}
        step={name === 'price' ? '0.01' : undefined}
        defaultValue={value}
        min={min}
        max={max}
        minLength={type === 'password' ? 10 : undefined}
        autoComplete={type === 'password' ? 'new-password' : undefined}
      />
    </label>
  );
}
function CourseFields({ item, teachers }: { item?: Course; teachers: Teacher[] }) {
  return (
    <>
      <Field label="اسم الدورة" name="title" value={item?.title} />
      <label className="field">
        وصف الدورة
        <textarea
          className="input"
          name="description"
          required
          minLength={10}
          defaultValue={item?.description}
          rows={3}
        />
      </label>
      <div className="admin-fields">
        <label className="field">
          المعلم المسؤول
          <select
            aria-label="المعلم المسؤول"
            className="input"
            name="teacherId"
            required
            defaultValue={item?.teacher.id ?? ''}
          >
            <option value="" disabled>
              اختر المعلم
            </option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.user.name}
              </option>
            ))}
          </select>
        </label>
        <Field
          label="شهر الدورة"
          name="month"
          type="month"
          disabled={!!item && !item.month && item.classSessions.length > 0}
          value={item?.month ?? new Date().toISOString().slice(0, 7)}
        />
        <label className="field">
          الفئة العمرية
          <select
            aria-label="الفئة العمرية"
            className="input"
            name="ageGroup"
            defaultValue={item?.ageGroup ?? '5–7'}
          >
            {['5–7', '8–10', '11–13', '14–15'].map((age) => (
              <option key={age}>{age}</option>
            ))}
          </select>
        </label>
        <Field
          label="السعر الشهري بالدولار"
          name="price"
          type="number"
          value={item?.price ?? 0}
          min={0}
          max={100000}
        />
        <Field
          label="عدد المقاعد"
          name="maxStudents"
          type="number"
          value={item?.maxStudents ?? 10}
          min={1}
          max={100}
        />
        <label className="field">
          المنطقة الزمنية للدورة
          <select
            aria-label="المنطقة الزمنية للدورة"
            className="input"
            name="timeZone"
            defaultValue={item?.timeZone ?? 'Europe/Istanbul'}
          >
            {[
              'Europe/Istanbul',
              'Asia/Riyadh',
              'Asia/Dubai',
              'America/New_York',
              'America/Chicago',
              'America/Denver',
              'America/Los_Angeles',
              'Europe/London',
              'UTC',
            ].map((tz) => (
              <option key={tz}>{tz}</option>
            ))}
          </select>
        </label>
      </div>
    </>
  );
}
export default function AdminPage() {
  const [data, setData] = useState<Overview>(empty);
  const [tab, setTab] = useState('courses');
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const mutation = useRef(false);
  const load = useCallback(async () => {
    setData(await api('/overview'));
  }, []);
  useEffect(() => {
    let active = true;
    api('/overview')
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  async function save(path: string, method: string, body?: unknown, form?: HTMLFormElement) {
    if (mutation.current) return;
    mutation.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api(path, method, body);
      form?.reset();
      setMessage('تم حفظ التعديل.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر الاتصال');
    } finally {
      mutation.current = false;
      setBusy(false);
    }
  }
  function courseBody(form: HTMLFormElement) {
    const v = values(form);
    return { ...v, price: Number(v.price), maxStudents: Number(v.maxStudents) };
  }
  const course = data.courses.find((c) => c.id === selected);

  return (
    <main className="admin-page" dir="rtl">
      <header className="admin-heading">
        <div>
          <span className="eyebrow">MIDAD ACADEMY</span>
          <h1>إدارة الأكاديمية</h1>
          <p>نظّم الدورات الشهرية، والأسر، والمعلمين ومواعيد الحصص.</p>
        </div>
        <button
          className="btn btn-outline"
          disabled={busy || loading}
          onClick={async () => {
            setError('');
            setLoading(true);
            try {
              await load();
            } catch {
              setError('تعذر تحديث البيانات');
            } finally {
              setLoading(false);
            }
          }}
        >
          <Icon name="refresh" /> تحديث
        </button>
      </header>
      <nav className="admin-tabs" aria-label="أقسام الإدارة">
        {[
          ['courses', 'الدورات والمواعيد'],
          ['families', 'الأسر والطلاب'],
          ['teachers', 'المعلمون'],
        ].map(([id, label]) => (
          <button
            key={id}
            className={tab === id ? 'active' : ''}
            onClick={() => setTab(id)}
            aria-pressed={tab === id}
          >
            {label}
          </button>
        ))}
      </nav>
      {error && (
        <div className="auth-error" role="alert">
          {error}
        </div>
      )}
      {message && (
        <p className="admin-success" role="status">
          {message}
        </p>
      )}
      {loading && <p role="status">جارٍ تحميل بيانات الأكاديمية…</p>}
      {!loading && (
        <fieldset disabled={busy} className="admin-body">
          {tab === 'teachers' && (
            <div className="admin-columns">
              <section className="card pad">
                <h2>إضافة معلم</h2>
                <p>سلّم المعلم بيانات دخوله بعد إنشاء الحساب.</p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const form = e.currentTarget;
                    void save('/teachers', 'POST', values(form), form);
                  }}
                >
                  <Field label="اسم المعلم" name="name" />
                  <Field label="البريد الإلكتروني" name="email" type="email" />
                  <Field label="كلمة المرور (10 أحرف على الأقل)" name="password" type="password" />
                  <button className="btn btn-gold">إنشاء حساب المعلم</button>
                </form>
              </section>
              <section className="card pad">
                <h2>المعلمون ({data.teachers.length})</h2>
                {data.teachers.map((t) => (
                  <div className="admin-row" key={t.id}>
                    <b>{t.user.name}</b>
                    <span dir="ltr">{t.user.email}</span>
                    <small>{data.courses.filter((c) => c.teacher.id === t.id).length} دورات</small>
                  </div>
                ))}
                {!data.teachers.length && <p>أضف أول معلم لتعيينه على دورة.</p>}
              </section>
            </div>
          )}
          {tab === 'families' && (
            <>
              <div className="admin-columns">
                <section className="card pad">
                  <h2>إضافة ابن لولي الأمر</h2>
                  <p>ولي الأمر يسجّل بنفسه؛ هنا ننشئ حساب الطفل ونربطه بأسرته.</p>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const form = e.currentTarget;
                      const v = values(form);
                      void save('/students', 'POST', { ...v, age: Number(v.age) }, form);
                    }}
                  >
                    <label className="field">
                      ولي الأمر
                      <select
                        aria-label="ولي الأمر"
                        name="parentId"
                        className="input"
                        required
                        defaultValue=""
                      >
                        <option value="" disabled>
                          اختر ولي الأمر
                        </option>
                        {data.parents.map((p) => (
                          <option value={p.id} key={p.id}>
                            {p.user.name} — {p.user.email}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Field label="اسم الطالب" name="name" />
                    <Field label="اسم المستخدم (حروف إنجليزية وأرقام)" name="username" />
                    <Field
                      label="كلمة المرور (10 أحرف على الأقل)"
                      name="password"
                      type="password"
                    />
                    <Field label="العمر" name="age" type="number" min={5} max={15} />
                    <button className="btn btn-gold" disabled={!data.parents.length}>
                      إنشاء حساب الطالب
                    </button>
                  </form>
                  {!data.parents.length && (
                    <p>لا يوجد أولياء أمور بعد. يبدأ ولي الأمر من صفحة التسجيل.</p>
                  )}
                </section>
                <section className="card pad">
                  <h2>أولياء الأمور ({data.parents.length})</h2>
                  {data.parents.map((p) => (
                    <div className="admin-row" key={p.id}>
                      <b>{p.user.name}</b>
                      <span dir="ltr">{p.user.email}</span>
                      <span dir="ltr">{p.user.whatsappPhone || 'رقم واتساب غير مضاف'}</span>
                      <small>{p._count.children} أبناء</small>
                    </div>
                  ))}
                </section>
              </div>
              <section className="card pad">
                <h2>الطلاب وربط الأسرة</h2>
                {data.students.map((s) => (
                  <div className="admin-student" key={s.id}>
                    <div>
                      <b>{s.user.name}</b>
                      <span dir="ltr">{s.user.username || s.user.email}</span>
                      <small>
                        {s.age} سنوات · {s.parent?.user.name || 'غير مرتبط بولي أمر'}
                      </small>
                    </div>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const v = values(e.currentTarget);
                        void save(`/students/${s.id}/parent`, 'PATCH', v);
                      }}
                    >
                      <label className="field">
                        ولي أمر {s.user.name}
                        <select
                          aria-label="ولي الأمر"
                          className="input"
                          name="parentId"
                          defaultValue={s.parent?.id ?? ''}
                          required
                        >
                          <option value="" disabled>
                            اختر ولي الأمر
                          </option>
                          {data.parents.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.user.name} — {p.user.email}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button className="btn btn-outline btn-sm">حفظ الربط</button>
                    </form>
                  </div>
                ))}
                {!data.students.length && <p>لم تُضف حسابات الطلاب بعد.</p>}
              </section>
            </>
          )}
          {tab === 'courses' && (
            <>
              <div className="admin-columns">
                <section className="card pad">
                  <h2>إنشاء دورة شهرية</h2>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const form = e.currentTarget;
                      void save('/courses', 'POST', courseBody(form), form);
                    }}
                  >
                    <CourseFields teachers={data.teachers} />
                    <button className="btn btn-gold" disabled={!data.teachers.length}>
                      إنشاء الدورة
                    </button>
                  </form>
                  {!data.teachers.length && <p>أضف المعلم من قسم المعلمين أولًا.</p>}
                </section>
                <section className="card pad">
                  <h2>الدورات ({data.courses.length})</h2>
                  <div className="admin-course-list">
                    {data.courses.map((c) => (
                      <button
                        key={c.id}
                        aria-pressed={selected === c.id}
                        className={selected === c.id ? 'selected' : ''}
                        onClick={() => setSelected(c.id)}
                      >
                        <b>{c.title}</b>
                        <span>
                          {c.month || 'دورة سابقة'} · {c.teacher.user.name}
                        </span>
                        <small>
                          {c.enrollments.filter((e) => e.status === 'ACTIVE').length} /{' '}
                          {c.maxStudents} طالب · ${c.price} / شهر
                        </small>
                      </button>
                    ))}
                  </div>
                  {!data.courses.length && <p>ابدأ بإنشاء أول دورة شهرية.</p>}
                </section>
              </div>
              {course && (
                <section className="card pad admin-detail" key={course.id}>
                  <div className="admin-heading">
                    <h2>{course.title}</h2>
                    <Link className="btn btn-outline" href={`/courses/${course.id}/content`}>
                      <Icon name="book" /> إدارة المنهج والمواد
                    </Link>
                  </div>
                  <details>
                    <summary>تعديل بيانات الدورة وتعيين المعلم</summary>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void save(`/courses/${course.id}`, 'PATCH', courseBody(e.currentTarget));
                      }}
                    >
                      <CourseFields item={course} teachers={data.teachers} />
                      <button className="btn btn-gold">حفظ بيانات الدورة</button>
                    </form>
                  </details>
                  <div className="admin-columns">
                    <div>
                      <h3>الطلاب المسجلون</h3>
                      {course.enrollments
                        .filter((e) => e.status === 'ACTIVE')
                        .map((en) => (
                          <div className="admin-row" key={en.studentId}>
                            <b>{en.student.user.name}</b>
                            <button
                              className="btn btn-outline btn-sm"
                              onClick={() => {
                                if (
                                  window.confirm(
                                    `إلغاء تسجيل ${en.student.user.name} في هذه الدورة؟`
                                  )
                                )
                                  void save(
                                    `/courses/${course.id}/enrollments/${en.studentId}`,
                                    'DELETE'
                                  );
                              }}
                            >
                              إلغاء التسجيل
                            </button>
                          </div>
                        ))}
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          void save(
                            `/courses/${course.id}/enrollments`,
                            'POST',
                            values(e.currentTarget)
                          );
                        }}
                      >
                        <label className="field">
                          تسجيل طالب في الدورة
                          <select
                            aria-label="تسجيل طالب في الدورة"
                            className="input"
                            name="studentId"
                            required
                            defaultValue=""
                          >
                            <option value="" disabled>
                              اختر الطالب المرتبط بأسرته
                            </option>
                            {data.students
                              .filter(
                                (s) =>
                                  s.parent &&
                                  !course.enrollments.some(
                                    (en) => en.studentId === s.id && en.status === 'ACTIVE'
                                  )
                              )
                              .map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.user.name} — {s.parent?.user.name}
                                </option>
                              ))}
                          </select>
                        </label>
                        <button className="btn btn-gold">تسجيل الطالب</button>
                      </form>
                    </div>
                    <div>
                      <h3>إضافة موعد حصة</h3>
                      <p>
                        أدخل الموعد بتوقيت جهازك ({Intl.DateTimeFormat().resolvedOptions().timeZone}
                        ). تُراجع حدود الشهر بتوقيت الدورة: {course.timeZone}.
                      </p>
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const form = e.currentTarget;
                          const v = values(form);
                          void save(
                            `/courses/${course.id}/sessions`,
                            'POST',
                            {
                              ...v,
                              scheduledAt: new Date(String(v.scheduledAt)).toISOString(),
                              durationMinutes: Number(v.durationMinutes),
                            },
                            form
                          );
                        }}
                      >
                        <Field label="عنوان الحصة" name="title" />
                        <Field
                          label="التاريخ والوقت بتوقيت جهازك"
                          name="scheduledAt"
                          type="datetime-local"
                        />
                        <Field
                          label="المدة بالدقائق"
                          name="durationMinutes"
                          type="number"
                          value={50}
                          min={5}
                          max={240}
                        />
                        <button className="btn btn-gold">إضافة الموعد</button>
                      </form>
                    </div>
                  </div>
                  <h3>مواعيد الدورة</h3>
                  {course.classSessions.map((s) => (
                    <div className="admin-session" key={s.id}>
                      <div>
                        <b>{s.title}</b>
                        <span>
                          {new Date(s.scheduledAt).toLocaleString('ar', {
                            timeZone: course.timeZone,
                          })}{' '}
                          · {course.timeZone} · {s.durationMinutes} دقيقة
                        </span>
                      </div>
                      <span>
                        {(
                          {
                            SCHEDULED: 'مجدولة',
                            LIVE: 'مباشرة',
                            COMPLETED: 'منتهية',
                            CANCELLED: 'ملغاة',
                          } as Record<string, string>
                        )[s.status] || s.status}
                      </span>
                      {s.status === 'SCHEDULED' && (
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={() => {
                            if (window.confirm('إلغاء هذا الموعد؟'))
                              void save(`/sessions/${s.id}/cancel`, 'PATCH');
                          }}
                        >
                          إلغاء الموعد
                        </button>
                      )}
                    </div>
                  ))}
                  {!course.classSessions.length && <p>لا توجد مواعيد لهذه الدورة بعد.</p>}
                </section>
              )}
            </>
          )}
        </fieldset>
      )}
      {busy && <p role="status">جارٍ حفظ التعديل…</p>}
    </main>
  );
}
