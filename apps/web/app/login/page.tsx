'use client';
import { Suspense, useEffect, useState } from 'react';
import Image from 'next/image';
import { ArrowBigUp, Eye, EyeOff } from 'lucide-react';
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
  const [visible, setVisible] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const next = params.get('next');
  const target =
    next && next.startsWith('/') && !next.startsWith('//') ? next : '/';

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
      const { data } = await api.post<{ data: Schemas['User'] }>(
        '/auth/login',
        { email: email.trim(), password },
      );
      setUser(data);
      router.replace(target);
    } catch (err) {
      const apiErr = err as ApiError;
      setError(apiErr);
      if (apiErr.status === 429 && apiErr.retryAfter)
        setWait(apiErr.retryAfter);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="login">
      <div className="login-brand">
        <Image
          className="login-brand-logo"
          src="/brand/ceo-logo-blanco.png"
          alt="CEO Construcciones"
          priority
          width={414}
          height={307}
        />
        <div className="login-brand-copy">
          <div className="login-eyebrow">SISTEMA DE GESTIÓN</div>
          <h1>Gestión integral de obras.</h1>
          <p>
            Presupuestos, compras, stock y seguimiento de cada obra, con la
            información siempre al día.
          </p>
        </div>
        <Image
          className="login-watermark"
          src="/brand/ceo-isotipo-blanco.png"
          alt=""
          aria-hidden="true"
          width={388}
          height={220}
        />
      </div>
      <div className="login-side">
        <div className="login-mobile-top">
          <Image
            src="/brand/ceo-logo-blanco.png"
            alt="CEO Construcciones"
            width={414}
            height={307}
          />
          <div className="login-eyebrow">SISTEMA DE GESTIÓN</div>
        </div>
        <form className="login-card" onSubmit={submit} noValidate>
          <div className="login-card-head">
            <span className="login-card-mark" aria-hidden="true">
              <Image
                src="/brand/ceo-isotipo-blanco.png"
                alt=""
                width={388}
                height={220}
              />
            </span>
            <div>
              <h2>Ingresá a tu cuenta</h2>
              <p>Accedé con tu correo y contraseña.</p>
            </div>
          </div>
          <TextField
            label="Correo electrónico"
            type="email"
            autoComplete="username"
            autoFocus={!email}
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <div className="login-password">
            <TextField
              label="Contraseña"
              id="login-password"
              type={visible ? 'text' : 'password'}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => setCapsLock(e.getModifierState('CapsLock'))}
              onKeyUp={(e) => setCapsLock(e.getModifierState('CapsLock'))}
              onBlur={() => setCapsLock(false)}
              suffix={
                <button
                  className="login-password-toggle"
                  type="button"
                  aria-label={visible ? 'Ocultar' : 'Mostrar'}
                  aria-pressed={visible}
                  aria-controls="login-password"
                  onClick={() => setVisible((v) => !v)}
                >
                  {visible ? (
                    <EyeOff size={18} aria-hidden="true" />
                  ) : (
                    <Eye size={18} aria-hidden="true" />
                  )}
                </button>
              }
            />
            <div aria-live="polite">
              {capsLock && (
                <p className="login-caps">
                  <ArrowBigUp size={14} aria-hidden="true" />
                  Bloq Mayús está activado
                </p>
              )}
            </div>
          </div>
          {error && (
            <ErrorBox
              error={
                error.status === 401
                  ? new ApiError(
                      401,
                      error.code,
                      'Correo o contraseña incorrectos.',
                    )
                  : error
              }
            />
          )}
          <Button
            className="login-submit"
            type="submit"
            size="lg"
            loading={pending}
            disabled={!email || !password || wait > 0}
          >
            {wait > 0 ? `Esperá ${wait} s` : 'Ingresar'}
          </Button>
        </form>
        <p className="login-foot">Acceso exclusivo para personal autorizado.</p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  useEffect(() => {
    document.title = 'Ingresar · CEO Construcciones';
  }, []);

  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
