"use client";
import Link from 'next/link';
import Icon from './Icon';
import WorkspaceShell from './WorkspaceShell';
import { dashboardPath, useAuth } from './AuthProvider';
export default function HomeExperience({ children }: { children: React.ReactNode }) {
  const { user, status, refresh } = useAuth();
  if (status === 'loading') return <main className="midad connection-state" role="status">جارٍ فتح الأكاديمية…</main>;
  if (!user && status === 'error') return <main className="midad connection-state"><h1>تعذر تحميل حسابك</h1><p>أعد المحاولة للمتابعة، لا تحتاج إلى تسجيل الدخول مجددًا.</p><button className="btn btn-gold" onClick={() => void refresh()}>إعادة المحاولة</button></main>;
  if (!user) return <>{children}</>;
  const target = dashboardPath(user.role);
  return <WorkspaceShell><main className="workspace-home"><div className="workspace-welcome"><span className="eyebrow">مساحة العمل · WORKSPACE</span><h1>أهلاً، {user.name}</h1><p>{user.role === 'TEACHER' ? 'صفوفك وطلابك وموادك التعليمية، في مكان واحد.' : user.role === 'PARENT' ? 'تابع حصص أبنائك وتقدمهم في التعلم.' : 'تابع دروسك وافتح حصتك من مكان واحد.'}</p><Link className="btn btn-gold" href={target}><Icon name="calendar" />{user.role === 'PARENT' ? 'متابعة أبنائي' : 'فتح صفوفي وحصصي'}</Link></div><section className="workspace-actions" aria-label="الوصول السريع"><Link className="card" href={target}><Icon name="calendar" size={28} /><h2>الحصص والتقدم</h2><p>الجلسات القادمة ودوراتك الحالية</p><span>فتح مساحة التعلم <Icon name="right" /></span></Link><Link className="card" href="/courses"><Icon name="book" size={28} /><h2>الدورات</h2><p>تصفح الدورات والمحتوى المتاح لك</p><span>عرض الدورات <Icon name="right" /></span></Link><Link className="card" href="/account"><Icon name="family" size={28} /><h2>حسابي</h2><p>بياناتك الشخصية وإعدادات الحساب</p><span>إدارة الحساب <Icon name="right" /></span></Link></section>{user.role === 'TEACHER' && <div className="workspace-teacher-tools"><Link href="/teacher/students"><Icon name="graduate" /> قائمة الطلاب</Link><Link href="/teacher/review-answers"><Icon name="edit" /> مراجعة الإجابات</Link></div>}</main></WorkspaceShell>;
}
