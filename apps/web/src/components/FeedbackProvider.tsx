'use client';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { usePathname } from 'next/navigation';
import Icon from './Icon';

type Entry = { id: string; content: ReactNode; title: string; confirm?: (answer: boolean) => void };
type Feedback = {
  notice: (id: string, content: ReactNode, title?: string) => void;
  remove: (id: string) => void;
  confirm: (message: string) => Promise<boolean>;
};
const Context = createContext<Feedback | null>(null);
export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<Entry[]>([]);
  const queueRef = useRef(queue);
  queueRef.current = queue;
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const path = usePathname();
  const notice = useCallback((id: string, content: ReactNode, title = 'تنبيه') => {
    setQueue((q) =>
      q.some((e) => e.id === id)
        ? q.map((e) => (e.id === id ? { ...e, content, title } : e))
        : [...q, { id, content, title }]
    );
  }, []);
  const remove = useCallback((id: string) => setQueue((q) => q.filter((e) => e.id !== id)), []);
  const confirm = useCallback(
    (message: string) =>
      new Promise<boolean>((resolve) => {
        setQueue((q) => [
          {
            id: 'confirm-' + Date.now(),
            title: 'تأكيد تسجيل الخروج',
            content: message,
            confirm: resolve,
          },
          ...q,
        ]);
      }),
    []
  );
  const finish = useCallback((answer: boolean) => {
    const current = queueRef.current[0];
    if (!current) return;
    current.confirm?.(answer);
    setQueue((q) => q.filter((e) => e.id !== current.id));
  }, []);
  useEffect(() => {
    return () => {
      queueRef.current.forEach((e) => e.confirm?.(false));
      setQueue([]);
    };
  }, [path]);
  useEffect(() => {
    let validationPending = false;
    const invalid = (event: Event) => {
      const field = event.target;
      if (
        !(
          field instanceof HTMLInputElement ||
          field instanceof HTMLSelectElement ||
          field instanceof HTMLTextAreaElement
        )
      )
        return;
      event.preventDefault();
      if (validationPending) return;
      validationPending = true;
      queueMicrotask(() => {
        validationPending = false;
      });
      field.focus();
      const label =
        field.labels?.[0]?.textContent?.trim() || field.getAttribute('aria-label') || 'هذا الحقل';
      notice(
        'form-validation',
        <p>
          {label}: {field.validationMessage}
        </p>,
        'راجع البيانات'
      );
    };
    const external = (event: Event) =>
      notice('external-notice', (event as CustomEvent<string>).detail);
    document.addEventListener('invalid', invalid, true);
    window.addEventListener('midad-notice', external);
    return () => {
      document.removeEventListener('invalid', invalid, true);
      window.removeEventListener('midad-notice', external);
    };
  }, [notice]);
  const current = queue[0];
  useEffect(() => {
    const node = dialog.current;
    if (current && node && !node.open) node.showModal();
    if (!current && node?.open) node.close();
    if (current?.confirm) cancel.current?.focus();
  }, [current?.id, current?.confirm, current]);
  const value = useMemo(() => ({ notice, remove, confirm }), [notice, remove, confirm]);
  return (
    <Context.Provider value={value}>
      {children}
      <dialog
        className="feedback-dialog midad"
        ref={dialog}
        dir="rtl"
        role="alertdialog"
        aria-labelledby="feedback-title"
        aria-describedby="feedback-description"
        onCancel={(e) => {
          e.preventDefault();
          finish(false);
        }}
      >
        {current && (
          <>
            <div className="feedback-heading">
              <span className="feedback-symbol">
                <Icon name={current.confirm ? 'logout' : 'warning'} size={22} />
              </span>
              <h2 id="feedback-title">{current.title}</h2>
              <button
                className="feedback-close"
                aria-label="إغلاق التنبيه"
                onClick={() => finish(false)}
              >
                <Icon name="close" />
              </button>
            </div>
            <div
              id="feedback-description"
              className="feedback-body"
              role={current.confirm ? undefined : 'alert'}
            >
              {current.content}
            </div>
            <div className="feedback-actions">
              {current.confirm ? (
                <>
                  <button ref={cancel} className="btn btn-outline" onClick={() => finish(false)}>
                    إلغاء
                  </button>
                  <button className="btn btn-gold" onClick={() => finish(true)}>
                    تسجيل الخروج
                  </button>
                </>
              ) : (
                <button className="btn btn-gold" onClick={() => finish(false)}>
                  حسنًا
                </button>
              )}
            </div>
          </>
        )}
      </dialog>
    </Context.Provider>
  );
}
export function useFeedback() {
  const value = useContext(Context);
  if (!value) throw new Error('FeedbackProvider missing');
  return value;
}
function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(' ');
  if (node && typeof node === 'object' && 'props' in node)
    return textOf((node as { props: { children?: ReactNode } }).props.children);
  return '';
}
export function PopupNotice({
  children,
  title = 'تنبيه',
}: {
  children: ReactNode;
  title?: string;
  [key: string]: unknown;
}) {
  const { notice, remove } = useFeedback();
  const id = useId();
  const key = textOf(children);
  const content = useRef(children);
  content.current = children;
  useEffect(() => {
    notice(id, content.current, title);
    return () => remove(id);
  }, [id, key, title, notice, remove]);
  return (
    <button
      type="button"
      className="feedback-reopen"
      onClick={() => notice(id, content.current, title)}
    >
      <Icon name="warning" size={16} /> عرض التنبيه
    </button>
  );
}

export function showPopup(message: string) {
  window.dispatchEvent(new CustomEvent('midad-notice', { detail: message }));
}
