'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError, type Schemas } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Button, ErrorBox, TextField } from '@/components/ui';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { user, setUser } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [wait, setWait] = useState(0);
  const next = params.get('next');
  const target = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';

  useEffect(() => {
    if (user) router.replace(target);
  }, [user, router, target]);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending || wait > 0) return;
    setPending(true);
    setError(null);
    try {
      const { data } = await api.post<{ data: Schemas['User'] }>('/auth/login', { email: email.trim(), password });
      setUser(data);
      router.replace(target);
    } catch (err) {
      const apiErr = err as ApiError;
      setError(apiErr);
      if (apiErr.status === 429 && apiErr.retryAfter) setWait(apiErr.retryAfter);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="login">
      <div className="brand">
        <div style={{ color: '#fff', fontWeight: 800, fontSize: 22 }}>CEO Construcciones</div>
        <h1>Obras, presupuestos, compras e inventario en un solo lugar.</h1>
        <p>Del cómputo al material en obra, con trazabilidad de cada pedido, orden y movimiento de stock.</p>
        <ul>
          <li><b>1</b> Cómputo y presupuesto por versión</li>
          <li><b>2</b> Pedidos, cotizaciones y órdenes de compra</li>
          <li><b>3</b> Recepciones y stock por ubicación</li>
        </ul>
      </div>
      <form className="form" onSubmit={submit} noValidate>
        <div className="fieldwrap">
          <h2>Ingresar</h2>
          <p className="muted" style={{ margin: 0 }}>Usá el correo y la contraseña asignados por Gerencia.</p>
          <TextField label="Correo electrónico" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <TextField label="Contraseña" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && <ErrorBox error={error.status === 401 ? new ApiError(401, error.code, 'Correo o contraseña incorrectos.') : error} />}
          <Button type="submit" size="lg" loading={pending} disabled={!email || !password || wait > 0}>
            {wait > 0 ? `Esperá ${wait} s` : 'Ingresar'}
          </Button>
        </div>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
