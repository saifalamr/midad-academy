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
  const { confirm } = useFeedback();
  const [user, setUser] = useState<Account | null>(null);
  const [status, setStatus] = useState<Auth['status']>('loading');
  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    const revision = ++sequence.current;
    const token = localStorage.getItem('token') ?? sessionStorage.getItem('token');
    if (!token) {
      setUser(null);
      setStatus('ready');
      return;
    }
    setStatus('loading');
    try {
      const res = await fetch(`${API_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
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
      setUser(data);
      setStatus('ready');
    } catch {
      if (revision === sequence.current) setStatus('error');
    }
  }, []);
  const logout = useCallback(async () => {
    if (!(await confirm('هل تريد تسجيل الخروج من حسابك؟'))) return false;
    ++sequence.current;
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    setUser(null);
    setStatus('ready');
    window.dispatchEvent(new Event('midad-auth'));
    return true;
  }, [confirm]);
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
