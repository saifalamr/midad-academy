'use client';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { dashboardPath, useAuth } from './AuthProvider';
import WorkspaceShell from './WorkspaceShell';
export default function DashboardTools({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const { user, status, refresh } = useAuth();
  const area = path.split('/')[1];
  const wrongRole =
    user &&
    ['teacher', 'student', 'parent', 'admin'].includes(area) &&
    user.role.toLowerCase() !== area;
  useEffect(() => {
    if (status === 'ready' && !user) router.replace('/login');
    else if (wrongRole && user) router.replace(dashboardPath(user.role));
  }, [user, status, wrongRole, router]);
  if (status === 'error' && !user)
    return (
      <main className="midad wrap connection-state">
        <h1>تعذر الاتصال بالأكاديمية</h1>
        <p>حسابك محفوظ. أعد المحاولة للمتابعة.</p>
        <button className="btn btn-gold" onClick={() => void refresh()}>
          إعادة المحاولة
        </button>
      </main>
    );
  if (status === 'loading' || !user || wrongRole)
    return (
      <main className="midad wrap connection-state" role="status">
        جارٍ فتح مساحة عملك…
      </main>
    );
  return <WorkspaceShell>{children}</WorkspaceShell>;
}
