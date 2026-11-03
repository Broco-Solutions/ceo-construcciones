'use client';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Button, Modal } from '@/components/ui';

type Blocker = {
  dirty: boolean;
  save: () => Promise<boolean>;
  onPrompt: () => void;
};
type Intent = () => void | Promise<void>;
type Navigation = {
  request: (intent: Intent, replace?: boolean) => void;
  register: (read: () => Blocker) => () => void;
  blocking: boolean;
};
const Context = createContext<Navigation | null>(null);
const positionKey = '__ceoNavigationPosition';

/** Explicit application navigation boundary. Does not patch Next/router or
 * History methods. Position metadata lets us restore a cancelled traversal
 * before Next consumes popstate, preserving both Back and Forward entries. */
export function NavigationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter(),
    pathname = usePathname();
  const blocker = useRef<(() => Blocker) | null>(null);
  const pending = useRef<Intent | null>(null);
  const [blocking, setBlocking] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const nextReplace = useRef(false),
    positioned = useRef(false);
  const busyRef = useRef(false),
    position = useRef(0),
    restoring = useRef(false),
    traversal = useRef(false);
  const register = useCallback((read: () => Blocker) => {
    blocker.current = read;
    return () => {
      if (blocker.current === read) blocker.current = null;
    };
  }, []);
  const request = useCallback((intent: Intent, replace = false) => {
    const perform = () => {
      nextReplace.current = replace;
      return intent();
    };
    if (pending.current) return; // Preserve the first destination, exactly once.
    const b = blocker.current?.();
    if (!b?.dirty) {
      void perform();
      return;
    }
    b.onPrompt();
    pending.current = perform;
    setMessage('');
    setBlocking(true);
  }, []);
  useLayoutEffect(() => {
    const state = window.history.state ?? {};
    if (typeof state[positionKey] === 'number')
      position.current = state[positionKey];
    else {
      if (!positioned.current) position.current = window.history.length - 1;
      else if (!nextReplace.current) position.current += 1;
      nextReplace.current = false;
      window.history.replaceState(
        { ...state, [positionKey]: position.current },
        '',
      );
    }
    positioned.current = true;
  }, [pathname]);
  useEffect(() => {
    const unload = (e: BeforeUnloadEvent) => {
      if (blocker.current?.().dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    const pop = (e: PopStateEvent) => {
      const target = e.state?.[positionKey];
      if (typeof target !== 'number') return; // External/full-document traversal uses native unload protection.
      if (restoring.current) {
        restoring.current = false;
        e.stopImmediatePropagation();
        return;
      }
      if (traversal.current) {
        traversal.current = false;
        position.current = target;
        return;
      }
      const delta = target - position.current;
      if (delta && blocker.current?.().dirty) {
        e.stopImmediatePropagation();
        restoring.current = true;
        window.history.go(-delta);
        request(() => {
          traversal.current = true;
          window.history.go(delta);
        });
      } else position.current = target;
    };
    window.addEventListener('beforeunload', unload);
    window.addEventListener('popstate', pop, true);
    return () => {
      window.removeEventListener('beforeunload', unload);
      window.removeEventListener('popstate', pop, true);
    };
  }, [request]);
  const cancel = () => {
    if (busyRef.current) return;
    pending.current = null;
    setBlocking(false);
    setMessage('');
  };
  const leave = async (save: boolean) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setMessage('');
    try {
      if (save && !(await blocker.current?.().save())) {
        setMessage(
          'No se salió. Revisá el error de guardado o los cambios posteriores y volvé a guardar.',
        );
        return;
      }
      const intent = pending.current;
      pending.current = null;
      setBlocking(false);
      await intent?.();
    } catch {
      setMessage(
        'No se pudo completar la salida. Tus cambios siguen disponibles.',
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const value = useMemo(
    () => ({ request, register, blocking }),
    [request, register, blocking],
  );
  return (
    <Context.Provider value={value}>
      <div
        style={{ display: 'contents' }}
        onClickCapture={(e) => {
          if (
            e.defaultPrevented ||
            e.button !== 0 ||
            e.metaKey ||
            e.ctrlKey ||
            e.shiftKey ||
            e.altKey
          )
            return;
          const a = (e.target as Element).closest?.(
            'a[href]',
          ) as HTMLAnchorElement | null;
          if (
            !a ||
            a.hasAttribute('download') ||
            (a.target && a.target !== '_self')
          )
            return;
          const target = new URL(a.href, location.href);
          if (
            target.pathname === location.pathname &&
            target.search === location.search
          )
            return;
          if (!blocker.current?.().dirty) return;
          e.preventDefault();
          e.stopPropagation();
          request(() => {
            if (target.origin === location.origin)
              router.push(target.pathname + target.search + target.hash);
            else location.assign(target.href);
          });
        }}
      >
        {children}
      </div>
      <Modal open={blocking} onClose={cancel} title="Cambios sin guardar">
        <p>
          Tenés cambios en el presupuesto. Elegí cómo continuar antes de salir.
        </p>
        {message && (
          <p className="err" role="alert">
            {message}
          </p>
        )}
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <Button onClick={() => leave(true)} loading={busy}>
            Guardar y salir
          </Button>
          <Button variant="sec" onClick={() => leave(false)} disabled={busy}>
            Salir sin guardar
          </Button>
          <Button variant="sec" onClick={cancel} disabled={busy}>
            Seguir editando
          </Button>
        </div>
      </Modal>
    </Context.Provider>
  );
}
export function useNavigation() {
  const c = useContext(Context);
  if (!c) throw Error('Falta NavigationProvider');
  return c;
}
export function useNavigationBlocker(value: Blocker) {
  const { register } = useNavigation(),
    current = useRef(value);
  current.current = value;
  useEffect(() => register(() => current.current), [register]);
}
/** Use for controlled programmatic exits. Browser Back/Forward are handled by popstate. */
export function useAppRouter() {
  const router = useRouter(),
    { request } = useNavigation();
  return useMemo(
    () => ({
      ...router,
      push: (...args: Parameters<typeof router.push>) =>
        request(() => router.push(...args)),
      replace: (...args: Parameters<typeof router.replace>) =>
        request(() => router.replace(...args), true),
    }),
    [router, request],
  );
}
