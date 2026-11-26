'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useFeedback } from './FeedbackProvider';
import { API_URL } from '@/lib/config';
export type Account = {
  id: string;
  name: string;
  role: 'TEACHER' | 'STUDENT' | 'PARENT' | 'ADMIN';
};
export const dashboardPath = (role: Account['role']) => `/${role.toLowerCase()}`;
type Auth = {
  user: Account | null;
  status: 'loading' | 'ready' | 'error';
  refresh: () => Promise<void>;
  logout: () => Promise<boolean>;
};
const Context = createContext<Auth | null>(null);
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { confirm, notice } = useFeedback();
  const [user, setUser] = useState<Account | null>(null);
  const [status, setStatus] = useState<Auth['status']>('loading');
  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    const revision = ++sequence.current;
    setStatus('loading');
    try {
      const stored = localStorage.getItem('token') ?? sessionStorage.getItem('token');
      if (stored && stored !== 'cookie') {
        const remembered = localStorage.getItem('token') === stored;
        localStorage.removeItem('token');
        sessionStorage.removeItem('token');
        const upgrade = await fetch(`${API_URL}/api/auth/session`, {
          method: 'POST', headers: { Authorization: `Bearer ${stored}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ remember: remembered }),
        });
        if (upgrade.ok) (remembered ? localStorage : sessionStorage).setItem('token', 'cookie');
      }
      const res = await fetch(`${API_URL}/api/auth/me`, {
        cache: 'no-store',
      });
      if (revision !== sequence.current) return;
      if (res.status === 401) {
        localStorage.removeItem('token');
        sessionStorage.removeItem('token');
        setUser(null);
        setStatus('ready');
        return;
      }
      if (!res.ok) throw new Error('Connection failed');
      const { data } = await res.json();
      if (revision !== sequence.current) return;
      if (!localStorage.getItem('token') && !sessionStorage.getItem('token'))
        sessionStorage.setItem('token', 'cookie');
      setUser(data);
      setStatus('ready');
    } catch {
      if (revision === sequence.current) setStatus('error');
    }
  }, []);
  const logout = useCallback(async () => {
    if (!(await confirm('هل تريد تسجيل الخروج من حسابك؟', { title: 'تأكيد تسجيل الخروج', confirmLabel: 'تسجيل الخروج' }))) return false;
    try {
      const res = await fetch(`${API_URL}/api/auth/logout`, { method: 'POST' });
      if (!res.ok) throw new Error('Could not end the session');
    } catch {
      notice('logout-error', 'تعذر تسجيل الخروج الآن. تحقق من الاتصال وأعد المحاولة.');
      return false;
    }
    ++sequence.current;
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    setUser(null);
    setStatus('ready');
    window.dispatchEvent(new Event('midad-auth'));
    return true;
  }, [confirm, notice]);
  useEffect(() => {
    const requests = sequence;
    void refresh();
    const update = () => {
      void refresh();
    };
    // Drafts saved by an embedded activity also emit storage events in this tab.
    // Only credential changes should revalidate authentication and replace protected views.
    const storageUpdate = (event: StorageEvent) => {
      if (event.key === 'token' || event.key === null) void refresh();
    };
    const restore = (event: PageTransitionEvent) => {
      if (event.persisted) void refresh();
    };
    window.addEventListener('pageshow', restore);
    window.addEventListener('midad-auth', update);
    window.addEventListener('storage', storageUpdate);
    return () => {
      ++requests.current;
      window.removeEventListener('pageshow', restore);
      window.removeEventListener('midad-auth', update);
      window.removeEventListener('storage', storageUpdate);
    };
  }, [refresh]);
  return <Context.Provider value={{ user, status, refresh, logout }}>{children}</Context.Provider>;
}
export function useAuth() {
  const auth = useContext(Context);
  if (!auth) throw new Error('AuthProvider missing');
  return auth;
}
