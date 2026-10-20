'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import { PopupNotice, showPopup } from '@/components/FeedbackProvider';
import { academyContactUrl } from '@/lib/academy-contact';
import {
  academyApi as api,
  statusLabels as labels,
  localTime,
  courseEnd,
  type Child,
  type Course,
  type ScheduleItem,
  type Application,
  type ServiceRequest,
  type Notice,
  type Policy,
  type Skills,
} from '@/lib/academy-workflow';
import '@/components/academy-workflow.css';
type Ops = {
  pending: number;
  requests: number;
  sessions: {
    id: string;
    title: string;
    courseTitle: string;
    missingReports: number;
    pendingHomework: number;
    absent: number;
  }[];
};
type Audit = {
  id: string;
  createdAt: string;
  action: string;
  targetId: string;
  details: unknown;
  actor: { name: string } | null;
};
export default function AcademyPage() {
  const { user } = useAuth();
  const role = user?.role;
  const admin = role === 'ADMIN',
    parent = role === 'PARENT',
    staff = admin || role === 'TEACHER';
  const [tab, setTab] = useState('home');
  const [children, setChildren] = useState<Child[]>([]),
    [courses, setCourses] = useState<Course[]>([]),
    [catalog, setCatalog] = useState<Course[]>([]);
  const [applications, setApplications] = useState<Application[]>([]),
    [requests, setRequests] = useState<ServiceRequest[]>([]),
    [schedule, setSchedule] = useState<ScheduleItem[]>([]),
    [notices, setNotices] = useState<Notice[]>([]);
  const [policy, setPolicy] = useState<Policy | null>(null),
    [ops, setOps] = useState<Ops | null>(null),
    [audit, setAudit] = useState<Audit[]>([]);
  const [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0);
  const [selectedCourse, setSelectedCourse] = useState(''),
    [skillData, setSkillData] = useState<Skills | null>(null);
  useEffect(() => {
    if (!user) return;
    let active = true;
    setLoading(true);
    setError('');
    Promise.all([
      api<Course[]>('/academy/courses'),
      api<ScheduleItem[]>('/academy/schedule'),
      api<Notice[]>('/academy/notices'),
      api<Policy | null>('/academy/policy'),
      ...(parent || admin
        ? [api<Application[]>('/academy/applications'), api<ServiceRequest[]>('/academy/requests')]
        : []),
      ...(parent ? [api<Child[]>('/academy/children'), api<Course[]>('/courses/catalog')] : []),
      ...(admin ? [api<Ops>('/academy/operations'), api<Audit[]>('/academy/audit')] : []),
    ])
      .then((values) => {
        if (!active) return;
        setCourses(values[0] as Course[]);
        setSchedule(values[1] as ScheduleItem[]);
        setNotices(values[2] as Notice[]);
        setPolicy(values[3] as Policy | null);
        if (parent || admin) {
          setApplications(values[4] as Application[]);
          setRequests(values[5] as ServiceRequest[]);
        }
        if (parent) {
          setChildren(values[6] as Child[]);
          setCatalog(values[7] as Course[]);
        }
        if (admin) {
          setOps(values[6] as Ops);
          setAudit(values[7] as Audit[]);
        }
        const pending = new URLSearchParams(location.search).get('course');
        if (pending && parent) {
          setSelectedCourse(pending);
          setTab('apply');
        }
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
  }, [user, parent, admin, revision]);
  async function action(work: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await work();
      setRevision((x) => x + 1);
      showPopup('تم حفظ التحديث بنجاح');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر الحفظ');
    } finally {
      setBusy(false);
    }
  }
  async function openSkills(id: string) {
    setSelectedCourse(id);
    setSkillData(null);
    setTab('skills');
    setError('');
    try {
      setSkillData(await api<Skills>(`/academy/courses/${id}/skills`));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل المهارات');
    }
  }
  const tabs = [
    { id: 'home', title: 'الخطوة التالية' },
    ...(parent
      ? [
          { id: 'children', title: 'أبنائي ودخولهم' },
          { id: 'apply', title: 'تسجيل وتجديد' },
        ]
      : []),
    ...(parent || admin
      ? [
          { id: 'applications', title: admin ? 'طلبات التسجيل والدفع' : 'تسجيلاتي والدفع' },
          { id: 'requests', title: 'الغياب والتعويض والمساعدة' },
        ]
      : []),
    { id: 'schedule', title: 'الحصص' },
    { id: 'skills', title: 'مهارات التعلّم' },
    { id: 'notices', title: `الإشعارات (${notices.filter((n) => !n.readAt).length})` },
    { id: 'policy', title: 'سياسات الأكاديمية' },
    ...(admin ? [{ id: 'audit', title: 'سجل التعديلات' }] : []),
  ];
  return (
    <main className="academy-flow wrap" dir="rtl">
      <header className="flow-head">
        <div>
          <span className="eyebrow">مداد أكاديمي</span>
          <h1>
            {admin
              ? 'متابعة تشغيل الأكاديمية'
              : parent
                ? 'رحلة أسرتك مع مداد'
                : 'حصصك وخطوتك القادمة'}
          </h1>
          <p>التسجيل، المواعيد، التعلم والمتابعة في مكان واحد.</p>
        </div>
        <button
          className="btn btn-outline"
          disabled={loading || busy}
          onClick={() => setRevision((x) => x + 1)}
        >
          تحديث البيانات
        </button>
      </header>
      <nav className="flow-tabs" aria-label="أقسام المتابعة">
        {tabs.map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? 'active' : ''}
            aria-pressed={tab === t.id}
            onClick={() => setTab(t.id)}
          >
            {t.title}
          </button>
        ))}
      </nav>
      {error && <PopupNotice>{error}</PopupNotice>}
      {loading && <p role="status">جارٍ تحديث بيانات المتابعة…</p>}
      {!loading && (
        <fieldset disabled={busy} className="flow-body">
          {tab === 'home' && (
            <>
              <section className="flow-grid">
                {parent && (
                  <article className="card pad">
                    <h2>{children.length ? 'سجّل طفلك في رحلته القادمة' : 'ابدأ بإضافة طفلك'}</h2>
                    <p>اختر طفلًا ودورة وأرسل الطلب. تأكيد التسجيل يظهر هنا بعد اعتماد الإدارة.</p>
                    <button
                      className="btn btn-gold"
                      onClick={() => setTab(children.length ? 'apply' : 'children')}
                    >
                      {children.length ? 'اختيار الدورة' : 'إضافة طفل'}
                    </button>
                  </article>
                )}
                {admin && ops && (
                  <article className="card pad">
                    <h2>بانتظار الإدارة</h2>
                    <p>
                      {ops.pending} طلب تسجيل أو انتظار · {ops.requests} طلب خدمة مفتوح.
                    </p>
                    <button className="btn btn-gold" onClick={() => setTab('applications')}>
                      مراجعة الطلبات
                    </button>
                  </article>
                )}
                <article className="card pad">
                  <h2>الحصة القادمة</h2>
                  {schedule
                    .filter(
                      (s) =>
                        s.status === 'LIVE' ||
                        (s.status === 'SCHEDULED' && new Date(s.scheduledAt) > new Date())
                    )
                    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
                    .slice(0, 1)
                    .map((s) => (
                      <div key={s.id}>
                        <h3>{s.title}</h3>
                        <p>
                          {s.course.title} · {localTime(s.scheduledAt)}
                        </p>
                        <Link className="btn btn-gold" href={`/sessions/${s.id}`}>
                          فتح صفحة الحصة
                        </Link>
                      </div>
                    ))}
                  {!schedule.some(
                    (s) =>
                      s.status === 'LIVE' ||
                      (s.status === 'SCHEDULED' && new Date(s.scheduledAt) > new Date())
                  ) && <p>لا توجد حصة قادمة حاليًا. راجع حالة التسجيل أو تواصل مع الإدارة.</p>}
                </article>
              </section>
              {admin &&
                ops?.sessions
                  .filter((s) => s.missingReports || s.pendingHomework || s.absent)
                  .map((s) => (
                    <article className="card pad" key={s.id}>
                      <h3>
                        {s.courseTitle} — {s.title}
                      </h3>
                      <p>
                        {s.missingReports} تقرير لم يُنشر · {s.pendingHomework} واجب ينتظر التصحيح ·{' '}
                        {s.absent} لم يسجل له حضور.
                      </p>
                      <Link href={`/sessions/${s.id}`} className="btn btn-outline">
                        مراجعة الحصة
                      </Link>
                    </article>
                  ))}
              <h2>دوراتك ومتابعة الشهر</h2>
              <section className="flow-grid">
                {courses.map((c) => (
                  <article className="card pad" key={c.id}>
                    <h3>{c.title}</h3>
                    <p>
                      شهر {c.month || 'غير محدد'} · نهاية الشهر: {courseEnd(c.month)}
                    </p>
                    {c.enrollments?.map((e) => (
                      <p key={e.studentId}>
                        {e.student.user.name}: {labels[e.status] || e.status}
                      </p>
                    ))}
                    <div className="flow-actions">
                      <button className="btn btn-outline" onClick={() => void openSkills(c.id)}>
                        التقدم والمهارات
                      </button>
                      {parent && (
                        <button
                          className="btn btn-outline"
                          onClick={() => {
                            setSelectedCourse('');
                            setTab('apply');
                          }}
                        >
                          اختيار دورة للتجديد
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </section>
              {!courses.length && <p>ستظهر الدورات هنا بعد تأكيد التسجيل.</p>}
            </>
          )}
          {tab === 'children' && parent && (
            <section className="flow-grid">
              <article className="card pad">
                <h2>إضافة طفل</h2>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = e.currentTarget,
                      d = new FormData(f);
                    void action(async () => {
                      await api('/academy/children', 'POST', {
                        name: d.get('name'),
                        age: Number(d.get('age')),
                      });
                      f.reset();
                    });
                  }}
                >
                  <label className="field">
                    اسم الطفل
                    <input name="name" className="input" required minLength={2} maxLength={100} />
                  </label>
                  <label className="field">
                    العمر
                    <input name="age" type="number" className="input" required min={5} max={15} />
                  </label>
                  <button className="btn btn-gold">إضافة الطفل</button>
                </form>
              </article>
              {children.map((c) => (
                <article className="card pad" key={c.id}>
                  <h3>{c.user.name}</h3>
                  <p>{c.age} سنوات</p>
                  <p>
                    اسم الدخول: <b dir="ltr">{c.user.username || 'تواصل مع الإدارة'}</b>
                  </p>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = e.currentTarget;
                      const password = new FormData(f).get('password');
                      void action(async () => {
                        await api(`/academy/children/${c.id}/password`, 'POST', { password });
                        f.reset();
                      });
                    }}
                  >
                    <label className="field">
                      كلمة مرور جديدة للطفل
                      <input
                        name="password"
                        type="password"
                        autoComplete="new-password"
                        className="input"
                        minLength={10}
                        maxLength={128}
                        required
                      />
                    </label>
                    <p className="flow-muted">
                      10 أحرف على الأقل. حفظها يغلق جلسات الطفل السابقة. لا تشارك كلمة مرور حسابك
                      أنت.
                    </p>
                    <button className="btn btn-outline">تجهيز / استعادة دخول الطفل</button>
                  </form>
                </article>
              ))}
            </section>
          )}
          {tab === 'apply' && parent && (
            <article className="card pad">
              <h2>طلب تسجيل أو تجديد</h2>
              {!children.length ? (
                <button className="btn btn-gold" onClick={() => setTab('children')}>
                  أضف طفلك أولًا
                </button>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const d = new FormData(e.currentTarget);
                    void action(async () => {
                      await api('/academy/applications', 'POST', {
                        studentId: d.get('studentId'),
                        courseId: selectedCourse,
                        kind: d.get('kind'),
                        preferredTime: d.get('preferredTime'),
                        levelNotes: d.get('levelNotes'),
                        needsAssessment: d.get('assessment') === 'on',
                      });
                      history.replaceState(history.state, '', '/academy');
                      setTab('applications');
                    });
                  }}
                >
                  <div className="flow-grid">
                    <label className="field">
                      الطفل
                      <select name="studentId" className="input" required>
                        <option value="">اختر الطفل</option>
                        {children.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.user.name} — {c.age} سنوات
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      الدورة
                      <select
                        className="input"
                        value={selectedCourse}
                        onChange={(e) => setSelectedCourse(e.target.value)}
                        required
                      >
                        <option value="">اختر الدورة</option>
                        {catalog.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.title} · {c.month} · الأعمار {c.ageGroup} · {c.price} {c.currency} ·{' '}
                            {c.availableSeats
                              ? `${c.availableSeats} مقاعد`
                              : 'مكتملة — قائمة انتظار'}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label className="field">
                    نوع الطلب
                    <select name="kind" className="input">
                      <option value="NEW">تسجيل جديد</option>
                      <option value="RENEWAL">تجديد لدورة الشهر القادم</option>
                    </select>
                  </label>
                  <label className="field">
                    الوقت المناسب لكم (تراجع الإدارة الخيارات)
                    <input
                      name="preferredTime"
                      className="input"
                      maxLength={1000}
                      placeholder="مثال: مساء الثلاثاء بتوقيت إسطنبول"
                    />
                  </label>
                  <label className="field">
                    ما الذي يعرفه طفلك بالعربية؟
                    <textarea
                      name="levelNotes"
                      className="input"
                      maxLength={3000}
                      placeholder="هل يعرف الحروف؟ هل يقرأ كلمات؟"
                    />
                  </label>
                  <label className="flow-check">
                    <input type="checkbox" name="assessment" /> نحتاج مساعدة في تحديد المستوى قبل
                    البداية
                  </label>
                  <p>
                    إرسال الطلب لا يحجز مقعدًا ولا يخصم مبلغًا. لا تدفع قبل تأكيد الإدارة. التجديد
                    يكون في دورة جديدة للشهر القادم.
                  </p>
                  <button className="btn btn-gold">إرسال طلب التسجيل</button>
                </form>
              )}
            </article>
          )}
          {tab === 'applications' && (
            <>
              <p>
                الأسعار المسجلة هنا تخص الطلب وقت إرساله. الدفع والاسترجاع يسجلهما المسؤول بعد
                العملية الفعلية.
              </p>
              {applications.map((a) => (
                <ApplicationCard
                  key={`${a.id}-${a.version}`}
                  item={a}
                  admin={admin}
                  action={action}
                />
              ))}
              {!applications.length && <p>لا توجد طلبات تسجيل بعد.</p>}
            </>
          )}
          {tab === 'requests' && (
            <>
              {parent && (
                <article className="card pad">
                  <h2>طلب غياب أو تعويض أو مساعدة</h2>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = e.currentTarget,
                        d = new FormData(f),
                        sid = String(d.get('sessionId') || '');
                      void action(async () => {
                        await api('/academy/requests', 'POST', {
                          studentId: d.get('studentId'),
                          courseId: d.get('courseId'),
                          ...(sid ? { sessionId: sid } : {}),
                          kind: d.get('kind'),
                          reason: d.get('reason'),
                        });
                        f.reset();
                      });
                    }}
                  >
                    <div className="flow-grid">
                      <label className="field">
                        الطفل
                        <select name="studentId" className="input" required>
                          <option value="">اختر الطفل</option>
                          {children.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.user.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        الدورة
                        <select name="courseId" className="input" required>
                          <option value="">اختر الدورة</option>
                          {courses.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.title}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        نوع الطلب
                        <select name="kind" className="input">
                          {['ABSENCE', 'MAKEUP', 'WITHDRAWAL', 'REFUND', 'SUPPORT'].map((k) => (
                            <option key={k} value={k}>
                              {labels[k]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        الحصة (ضرورية للغياب والتعويض)
                        <select name="sessionId" className="input">
                          <option value="">بدون حصة محددة</option>
                          {schedule.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.course.title} — {s.title} · {localTime(s.scheduledAt)}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <label className="field">
                      السبب أو تفاصيل المشكلة
                      <textarea
                        name="reason"
                        className="input"
                        minLength={3}
                        maxLength={3000}
                        required
                      />
                    </label>
                    <button className="btn btn-gold">إرسال الطلب</button>
                  </form>
                </article>
              )}
              {requests.map((r) => (
                <article key={`${r.id}-${r.version}`} className="card pad">
                  <h3>
                    {labels[r.kind]} · {r.student.user.name}
                  </h3>
                  <p>
                    {r.course.title}
                    {r.session ? ` — ${r.session.title}` : ''}
                  </p>
                  <b>{labels[r.status]}</b>
                  <p>{r.reason}</p>
                  {r.response && <p>رد الإدارة: {r.response}</p>}
                  {r.kind === 'REFUND' && (
                    <small>
                      الرد على الطلب لا يعني تنفيذ التحويل. تأكيد الاسترجاع المالي يظهر في سجل
                      التسجيل.
                    </small>
                  )}
                  {admin && r.status === 'OPEN' && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const d = new FormData(e.currentTarget);
                        void action(() =>
                          api(`/academy/requests/${r.id}`, 'PATCH', {
                            version: r.version,
                            status: d.get('status'),
                            response: d.get('response'),
                          })
                        );
                      }}
                    >
                      <label className="field">
                        الرد للأسرة
                        <textarea name="response" className="input" required minLength={3} />
                      </label>
                      <label className="field">
                        القرار
                        <select name="status" className="input">
                          <option value="RESOLVED">
                            تمت المعالجة
                            {r.kind === 'WITHDRAWAL' ? ' — إلغاء التسجيل وحفظ السجل' : ''}
                          </option>
                          <option value="DECLINED">لم يعتمد</option>
                        </select>
                      </label>
                      <button className="btn btn-gold">حفظ الرد</button>
                    </form>
                  )}
                </article>
              ))}
            </>
          )}
          {tab === 'schedule' && (
            <>
              <p>
                المواعيد أدناه بتوقيت جهازك: {Intl.DateTimeFormat().resolvedOptions().timeZone}.
                صفحة كل حصة تعرض أيضًا توقيت الأكاديمية.
              </p>
              {schedule.map((s) => (
                <article key={s.id} className="card pad">
                  <span className="tag">{labels[s.status]}</span>
                  <h3>{s.title}</h3>
                  <p>
                    {s.course.title} · {localTime(s.scheduledAt)} · {s.durationMinutes} دقيقة
                  </p>
                  {s.changeReason && <p>تحديث الموعد: {s.changeReason}</p>}
                  <Link className="btn btn-outline" href={`/sessions/${s.id}`}>
                    الموعد والمحتوى والواجب والتقرير
                  </Link>
                </article>
              ))}
            </>
          )}
          {tab === 'skills' && (
            <>
              <label className="field">
                اختر الدورة
                <select
                  className="input"
                  value={selectedCourse}
                  onChange={(e) => void openSkills(e.target.value)}
                >
                  <option value="">اختر الدورة</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </label>
              {skillData && (
                <SkillPanel
                  key={skillData.course.id}
                  data={skillData}
                  staff={staff}
                  action={async (work) => {
                    await action(async () => {
                      await work();
                      setSkillData(await api<Skills>(`/academy/courses/${selectedCourse}/skills`));
                    });
                  }}
                />
              )}
            </>
          )}
          {tab === 'notices' && (
            <>
              {!notices.length && <p>لا توجد إشعارات جديدة.</p>}
              {notices.map((n) => (
                <article key={n.id} className="card pad">
                  <h3>
                    {n.title}
                    {!n.readAt ? ' · جديد' : ''}
                  </h3>
                  <p>{n.body}</p>
                  <small>{localTime(n.createdAt)}</small>
                  <div className="flow-actions">
                    <Link className="btn btn-outline" href={n.href}>
                      فتح التفاصيل
                    </Link>
                    {!n.readAt && (
                      <button
                        className="btn btn-outline"
                        onClick={() =>
                          void action(() => api(`/academy/notices/${n.id}/read`, 'PATCH'))
                        }
                      >
                        اطلعت على الإشعار
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </>
          )}
          {tab === 'policy' && (
            <article className="card pad">
              <h2>الغياب والتعويض والإلغاء والاسترجاع</h2>
              {admin ? (
                <form
                  key={policy?.version || 0}
                  onSubmit={(e) => {
                    e.preventDefault();
                    const d = new FormData(e.currentTarget);
                    void action(() =>
                      api('/academy/policy', 'PUT', {
                        content: d.get('content'),
                        published: d.get('published') === 'on',
                        version: policy?.version || 0,
                      })
                    );
                  }}
                >
                  <p>
                    اكتب قواعد الأكاديمية المعتمدة: موعد الإبلاغ عن الغياب، استحقاق التعويض، الإلغاء
                    والاسترجاع. نشر النص يجعله ظاهرًا للأسر.
                  </p>
                  <label className="field">
                    نص السياسات
                    <textarea
                      name="content"
                      className="input"
                      defaultValue={policy?.content || ''}
                      required
                      minLength={10}
                      maxLength={12000}
                      rows={12}
                    />
                  </label>
                  <label className="flow-check">
                    <input type="checkbox" name="published" defaultChecked={policy?.published} />{' '}
                    نشر النص المعتمد للأسر
                  </label>
                  <button className="btn btn-gold">حفظ السياسات</button>
                </form>
              ) : policy?.published ? (
                <div className="flow-text">{policy.content}</div>
              ) : (
                <p>
                  لم تنشر الأكاديمية سياسات الغياب والتعويض والاسترجاع بعد. اطلب توضيحها قبل الدفع.
                </p>
              )}
            </article>
          )}
          {tab === 'audit' && admin && (
            <>
              <p>أحدث 100 تعديل. بيانات الدخول وكلمات المرور لا تُحفظ في السجل.</p>
              {audit.map((a) => (
                <details className="card pad" key={a.id}>
                  <summary>
                    {a.actor?.name || 'مستخدم سابق'} · {localTime(a.createdAt)} · {a.action}
                  </summary>
                  <p dir="ltr">{a.targetId}</p>
                  <pre dir="ltr">{JSON.stringify(a.details, null, 2)}</pre>
                </details>
              ))}
            </>
          )}
        </fieldset>
      )}
      <footer className="flow-support">
        <p>مشكلة في الحصة؟ أعد الدخول وتأكد من أذونات الصوت، أو أرسل طلب مساعدة.</p>
        <Link href="/help">خطوات المساعدة</Link>
        <a href={academyContactUrl} target="_blank" rel="noopener noreferrer">
          تواصل مع الأكاديمية
        </a>
      </footer>
    </main>
  );
}
function ApplicationCard({
  item: a,
  admin,
  action,
}: {
  item: Application;
  admin: boolean;
  action: (work: () => Promise<unknown>) => Promise<void>;
}) {
  const [decision, setDecision] = useState('APPROVE');
  return (
    <article className="card pad">
      <span className="tag">{labels[a.status]}</span>
      <h3>
        {a.student.user.name} · {a.course.title}
      </h3>
      <p>
        شهر {a.course.month} · {a.quotedAmount} {a.currency} · {labels[a.paymentStatus]}
      </p>
      {a.paidAt && <p>سُجل الدفع: {localTime(a.paidAt)}</p>}
      {a.paymentReference && <p>مرجع العملية: {a.paymentReference}</p>}
      {a.response && <p>رد الإدارة: {a.response}</p>}
      {admin && (
        <>
          <p>
            ولي الأمر: {a.parent.user.name} · {a.parent.user.email}
          </p>
          <p>
            الوقت المفضل: {a.preferredTime || 'لم يحدد'} ·{' '}
            {a.needsAssessment ? 'يحتاج تقييم مستوى' : ''}
          </p>
          <p>{a.levelNotes}</p>
        </>
      )}
      {['PENDING', 'WAITLIST'].includes(a.status) &&
        (admin ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const d = new FormData(e.currentTarget);
              void action(() =>
                api(`/academy/applications/${a.id}`, 'PATCH', {
                  version: a.version,
                  action: decision,
                  response: d.get('response'),
                  ...(decision === 'APPROVE'
                    ? {
                        paymentStatus: d.get('paymentStatus'),
                        paymentReference: d.get('paymentReference'),
                      }
                    : {}),
                })
              );
            }}
          >
            <label className="field">
              قرار الإدارة
              <select
                className="input"
                value={decision}
                onChange={(e) => setDecision(e.target.value)}
              >
                <option value="APPROVE">تأكيد التسجيل والمقعد</option>
                <option value="WAITLIST">قائمة الانتظار</option>
                <option value="REJECT">عدم اعتماد الطلب</option>
              </select>
            </label>
            {decision === 'APPROVE' && (
              <>
                <label className="field">
                  حالة الدفع
                  <select name="paymentStatus" className="input">
                    <option value="PAID">تم استلام الدفع فعليًا</option>
                    <option value="WAIVED">مجاني / إعفاء معتمد</option>
                  </select>
                </label>
                <label className="field">
                  مرجع الدفع أو سبب الإعفاء
                  <input
                    name="paymentReference"
                    className="input"
                    required={a.quotedAmount > 0}
                    maxLength={200}
                  />
                </label>
              </>
            )}
            <label className="field">
              رد يظهر للأسرة
              <textarea name="response" className="input" maxLength={3000} />
            </label>
            <button className="btn btn-gold">حفظ القرار</button>
          </form>
        ) : (
          <button
            className="btn btn-outline"
            onClick={() =>
              void action(() =>
                api(`/academy/applications/${a.id}`, 'PATCH', {
                  version: a.version,
                  action: 'CANCEL',
                })
              )
            }
          >
            إلغاء الطلب
          </button>
        ))}
      {admin && a.status === 'APPROVED' && (
        <details>
          <summary>تسجيل تحديث مالي بعد العملية الفعلية</summary>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const d = new FormData(e.currentTarget);
              void action(() =>
                api(`/academy/applications/${a.id}`, 'PATCH', {
                  version: a.version,
                  action: 'PAYMENT',
                  paymentStatus: d.get('paymentStatus'),
                  paymentReference: d.get('paymentReference'),
                  response: d.get('response'),
                })
              );
            }}
          >
            <label className="field">
              العملية
              <select name="paymentStatus" className="input">
                <option value="PAID">دفع فعلي</option>
                <option value="WAIVED">إعفاء معتمد</option>
                <option value="REFUNDED">استرجاع مالي نُفذ فعليًا</option>
              </select>
            </label>
            <label className="field">
              مرجع العملية
              <input name="paymentReference" className="input" required maxLength={200} />
            </label>
            <label className="field">
              توضيح للأسرة
              <textarea name="response" className="input" />
            </label>
            <button className="btn btn-outline">تسجيل العملية</button>
          </form>
        </details>
      )}
    </article>
  );
}
function SkillPanel({
  data,
  staff,
  action,
}: {
  data: Skills;
  staff: boolean;
  action: (work: () => Promise<unknown>) => Promise<void>;
}) {
  return (
    <>
      <p>التقييم يسجله المعلم بناءً على تعلّم الطفل. إكمال المواد وحده لا يعني إتقان المهارة.</p>
      {staff && (
        <form
          className="card pad"
          onSubmit={(e) => {
            e.preventDefault();
            const f = e.currentTarget;
            void action(async () => {
              await api(`/academy/courses/${data.course.id}/skills`, 'POST', {
                title: new FormData(f).get('title'),
              });
              f.reset();
            });
          }}
        >
          <label className="field">
            مهارة من منهج الدورة
            <input
              name="title"
              className="input"
              required
              minLength={3}
              maxLength={200}
              placeholder="مثال: يميّز صوت حرف الباء"
            />
          </label>
          <button className="btn btn-gold">إضافة مهارة للمتابعة</button>
        </form>
      )}
      {!data.skills.length && <p>لم يضف المعلم مهارات المنهج بعد.</p>}
      {data.students.map((s) => (
        <article key={s.id} className="card pad">
          <h2>{s.user.name}</h2>
          <p>
            أتقن{' '}
            {
              data.skills.filter((k) =>
                k.progress.some((p) => p.studentId === s.id && p.status === 'MASTERED')
              ).length
            }{' '}
            من {data.skills.length} مهارات.
          </p>
          {data.skills.map((k) => {
            const p = k.progress.find((p) => p.studentId === s.id);
            return (
              <section className="flow-skill" key={`${k.id}-${p?.version || 0}`}>
                <h3>{k.title}</h3>
                {staff ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const d = new FormData(e.currentTarget);
                      void action(() =>
                        api(`/academy/skills/${k.id}/progress`, 'PUT', {
                          studentId: s.id,
                          version: p?.version || 0,
                          status: d.get('status'),
                          note: d.get('note'),
                        })
                      );
                    }}
                  >
                    <label className="field">
                      التقييم
                      <select
                        name="status"
                        defaultValue={p?.status || 'NOT_STARTED'}
                        className="input"
                      >
                        {['NOT_STARTED', 'PRACTICING', 'MASTERED'].map((v) => (
                          <option key={v} value={v}>
                            {labels[v]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      ما الذي يراجع في البيت؟
                      <textarea
                        name="note"
                        className="input"
                        maxLength={1000}
                        defaultValue={p?.note || ''}
                      />
                    </label>
                    <button className="btn btn-outline">حفظ تقييم المهارة</button>
                  </form>
                ) : (
                  <>
                    <b>{labels[p?.status || 'NOT_STARTED']}</b>
                    {p?.note && <p>{p.note}</p>}
                  </>
                )}
              </section>
            );
          })}
        </article>
      ))}
    </>
  );
}
