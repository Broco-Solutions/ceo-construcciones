'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { ApiError, friendlyError } from '@/lib/api';

/* ---------- notificaciones globales ---------- */
export type NoticeTone = 'success' | 'error' | 'warning' | 'info';
export type NoticeOptions = {
  /** Detalle opcional en una segunda línea (nombre de archivo, siguiente paso). */
  description?: string;
  /** Milisegundos visibles; null la deja abierta hasta que se cierre. */
  duration?: number | null;
};
type Notice = { id: number; tone: NoticeTone; title: string; description?: string; duration: number | null; seq: number; leaving: boolean };
type Show = (title: string, opts?: NoticeOptions) => number;
export type Notify = {
  success: Show;
  error: Show;
  warning: Show;
  info: Show;
  /** Error de una operación: usa el mensaje del servidor traducido a lenguaje de usuario. */
  failure: (title: string, error: unknown) => number;
  dismiss: (id: number) => void;
};

/** Éxito e información se van solos; las advertencias duran más y los errores esperan a que se cierren. */
export const NOTICE_DURATION: Record<NoticeTone, number | null> = { success: 4500, info: 5500, warning: 8000, error: null };
export const MAX_NOTICES = 4;
const EXIT_MS = 160;
const LABEL: Record<NoticeTone, string> = { success: 'Listo', error: 'Error', warning: 'Atención', info: 'Información' };
const ICON = { success: CheckCircle2, error: XCircle, warning: AlertTriangle, info: Info };

const noop = () => 0;
const NotifyCtx = createContext<Notify>({ success: noop, error: noop, warning: noop, info: noop, failure: noop, dismiss: () => {} });

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Notice[]>([]);
  const seq = useRef(0);
  const exits = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    if (exits.current.has(id)) return;
    setItems((list) => list.map((n) => (n.id === id ? { ...n, leaving: true } : n)));
    exits.current.set(
      id,
      setTimeout(() => {
        exits.current.delete(id);
        setItems((list) => list.filter((n) => n.id !== id));
      }, EXIT_MS),
    );
  }, []);

  const show = useCallback(
    (tone: NoticeTone, title: string, opts: NoticeOptions = {}) => {
      const id = ++seq.current;
      const duration = opts.duration === undefined ? NOTICE_DURATION[tone] : opts.duration;
      setItems((list) => {
        // El mismo aviso repetido no se apila: se reinicia el que ya está visible.
        const same = list.find((n) => !n.leaving && n.tone === tone && n.title === title && n.description === opts.description);
        if (same) return list.map((n) => (n === same ? { ...n, seq: id } : n));
        return [...list, { id, tone, title, description: opts.description, duration, seq: id, leaving: false }];
      });
      return id;
    },
    [],
  );

  // Como máximo MAX_NOTICES a la vista: se retiran primero los avisos más viejos que no sean errores.
  useEffect(() => {
    const live = items.filter((n) => !n.leaving);
    if (live.length <= MAX_NOTICES) return;
    const order = [...live.filter((n) => n.tone !== 'error'), ...live.filter((n) => n.tone === 'error')];
    order.slice(0, live.length - MAX_NOTICES).forEach((n) => dismiss(n.id));
  }, [items, dismiss]);

  useEffect(() => {
    const pending = exits.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  const api = useMemo<Notify>(
    () => ({
      success: (t, o) => show('success', t, o),
      error: (t, o) => show('error', t, o),
      warning: (t, o) => show('warning', t, o),
      info: (t, o) => show('info', t, o),
      failure: (t, e) => show(e instanceof ApiError && (e.status === 409 || e.status === 429) ? 'warning' : 'error', t, { description: friendlyError(e) }),
      dismiss,
    }),
    [show, dismiss],
  );

  const errors = items.filter((n) => n.tone === 'error');
  const rest = items.filter((n) => n.tone !== 'error');
  return (
    <NotifyCtx.Provider value={api}>
      {children}
      <div className="toasts">
        <div className="toast-region" role="alert" aria-live="assertive" aria-label="Errores">
          {errors.map((n) => (
            <NoticeItem key={n.id} n={n} onClose={dismiss} />
          ))}
        </div>
        <div className="toast-region" role="status" aria-live="polite" aria-label="Notificaciones">
          {rest.map((n) => (
            <NoticeItem key={n.id} n={n} onClose={dismiss} />
          ))}
        </div>
      </div>
    </NotifyCtx.Provider>
  );
}

function NoticeItem({ n, onClose }: { n: Notice; onClose: (id: number) => void }) {
  const [paused, setPaused] = useState(false);
  const remaining = useRef(n.duration ?? 0);
  // Un aviso repetido vuelve a contar desde el principio.
  useEffect(() => {
    remaining.current = n.duration ?? 0;
  }, [n.seq, n.duration]);
  // Pausado mientras el puntero o el foco están encima, para poder leerlo con calma.
  useEffect(() => {
    if (n.duration === null || paused || n.leaving) return;
    const start = Date.now();
    const t = setTimeout(() => onClose(n.id), Math.max(remaining.current, 0));
    return () => {
      clearTimeout(t);
      remaining.current -= Date.now() - start;
    };
  }, [n.id, n.seq, n.duration, n.leaving, paused, onClose]);
  const Icon = ICON[n.tone];
  return (
    <div
      className={`toast ${n.tone}${n.leaving ? ' leaving' : ''}`}
      data-tone={n.tone}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <Icon className="toast-ic" aria-hidden />
      <div className="toast-body">
        <p className="toast-title">
          <span className="sr-only">{LABEL[n.tone]}: </span>
          {n.title}
        </p>
        {n.description && <p className="toast-desc">{n.description}</p>}
      </div>
      <button type="button" className="toast-x" aria-label="Cerrar notificación" onClick={() => onClose(n.id)}>
        <X aria-hidden />
      </button>
    </div>
  );
}

export const useToast = () => useContext(NotifyCtx);
