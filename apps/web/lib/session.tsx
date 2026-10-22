'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { api, ApiError, onUnauthorized, type Schemas } from './api';
import { can, type Perm } from './permissions';

type User = Schemas['User'];
type SessionState = { user: User | null; loading: boolean; error: ApiError | null };
type SessionCtx = SessionState & {
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  can: (perm: Perm) => boolean;
  setUser: (u: User | null) => void;
};

const Ctx = createContext<SessionCtx | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SessionState>({ user: null, loading: true, error: null });
  const router = useRouter();
  const pathname = usePathname();

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get<{ data: User }>('/auth/me');
      setState({ user: data, loading: false, error: null });
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError(0, 'NETWORK', 'Sin conexión');
      setState({ user: null, loading: false, error: err.status === 401 ? null : err });
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(
    () =>
      onUnauthorized(() => {
        setState({ user: null, loading: false, error: null });
        if (!window.location.pathname.startsWith('/login')) router.replace(`/login?next=${encodeURIComponent(window.location.pathname)}`);
      }),
    [router],
  );

  useEffect(() => {
    if (!state.loading && !state.user && !state.error && !pathname.startsWith('/login')) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [state, pathname, router]);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      setState({ user: null, loading: false, error: null });
      router.replace('/login');
    }
  }, [router]);

  return (
    <Ctx.Provider
      value={{ ...state, refresh, logout, can: (p) => can(state.user?.role, p), setUser: (user) => setState({ user, loading: false, error: null }) }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useSession() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSession fuera de SessionProvider');
  return ctx;
}
