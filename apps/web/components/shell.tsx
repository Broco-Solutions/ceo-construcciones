'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useState } from 'react';
import { ChevronDown, LogOut, Menu, X } from 'lucide-react';
import { NAV, type NavItem } from '@/lib/nav';
import { useNavigation } from '@/lib/navigation';
import { useSession } from '@/lib/session';
import { ROLE_LABEL } from '@/lib/permissions';
import { Loading, ErrorBox, Button } from './ui';

function isActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/';
  if (href === '/stock') return pathname === '/stock';
  return pathname === href || pathname.startsWith(`${href}/`);
}

function useNavItems() {
  const { can, user } = useSession();
  return NAV.map((g) => ({
    ...g,
    items: g.items.filter(
      (i) =>
        (!i.perm || can(i.perm)) &&
        (user?.role !== 'ADMINISTRACION' ||
          ['/administracion', '/recepcion-delegada'].includes(i.href)),
    ),
  })).filter((g) => g.items.length);
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const groups = useNavItems();
  const activeGroup = groups.find((g) =>
    g.items.some((i) => isActive(pathname, i.href)),
  )?.label;
  const [expanded, setExpanded] = useState<string | null>(
    () => activeGroup ?? groups[0]?.label ?? null,
  );
  const groupId = useId();

  // Al navegar, mostrar la sección que contiene la ruta activa.
  useEffect(() => {
    if (activeGroup) setExpanded(activeGroup);
  }, [activeGroup]);

  return (
    <>
      {groups.map((g, index) => {
        const open = expanded === g.label;
        const panelId = groupId + '-section-' + index;
        return (
          <div key={g.label} className="nav-group">
            <button
              type="button"
              className={
                'grp grp-button' +
                (activeGroup === g.label ? ' active-group' : '')
              }
              aria-expanded={open}
              aria-controls={panelId}
              onClick={() =>
                setExpanded((old) => (old === g.label ? null : g.label))
              }
            >
              <span>{g.label}</span>
              <ChevronDown
                aria-hidden
                className={'grp-chevron' + (open ? ' expanded' : '')}
              />
            </button>
            <div id={panelId} className="nav-subnav" hidden={!open}>
              {g.items.map((i) => (
                <Link
                  key={i.href}
                  href={i.href}
                  className="nav nav-child"
                  aria-current={isActive(pathname, i.href) ? 'page' : undefined}
                  onClick={onNavigate}
                >
                  <i.icon aria-hidden /> {i.label}
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading, error, refresh, logout } = useSession();
  const [menu, setMenu] = useState(false);
  const { blocking } = useNavigation();
  useEffect(() => {
    if (blocking) setMenu(false);
  }, [blocking]);
  const pathname = usePathname();
  const mobileItems: NavItem[] = useNavItems()
    .flatMap((g) => g.items)
    .filter((i) => i.mobile);

  if (loading || (!user && !error))
    return <Loading label="Verificando sesión…" />;
  if (!user)
    return (
      <div style={{ padding: 24, maxWidth: 520, margin: '10vh auto' }}>
        <ErrorBox error={error} onRetry={refresh} />
      </div>
    );

  return (
    <div className="shell">
      <a href="#contenido" className="skip">
        Saltar al contenido
      </a>
      <aside className="side">
        <div
          className="logo"
          style={{
            color: '#fff',
            fontWeight: 800,
            fontSize: 18,
            letterSpacing: '-.01em',
          }}
        >
          CEO{' '}
          <span style={{ fontWeight: 600, opacity: 0.7 }}>Construcciones</span>
        </div>
        <nav className="side-nav" aria-label="Navegación principal">
          <NavLinks />
        </nav>
        <div className="foot">
          <div className="who">
            <b>{user.name}</b>
            {ROLE_LABEL[user.role]}
          </div>
          <button className="nav" onClick={logout}>
            <LogOut aria-hidden /> Cerrar sesión
          </button>
        </div>
      </aside>
      <div className="main" id="contenido">
        {children}
      </div>
      <nav className="bottomnav" aria-label="Navegación móvil">
        {mobileItems.map((i) => (
          <Link
            key={i.href}
            href={i.href}
            aria-current={isActive(pathname, i.href) ? 'page' : undefined}
          >
            <i.icon aria-hidden />
            {i.label}
          </Link>
        ))}
        <button onClick={() => setMenu(true)} aria-label="Abrir menú">
          <Menu aria-hidden />
          Menú
        </button>
      </nav>
      {menu && (
        <div
          className="mobmenu side-m"
          onMouseDown={(e) => e.target === e.currentTarget && setMenu(false)}
        >
          <nav
            className="side"
            style={{ display: 'flex', position: 'static', height: '100%' }}
            aria-label="Menú completo"
          >
            <div
              className="row"
              style={{ color: '#fff', padding: '0 8px 8px' }}
            >
              <b style={{ flex: 1 }}>{user.name}</b>
              <button
                className="x"
                onClick={() => setMenu(false)}
                aria-label="Cerrar menú"
              >
                <X size={16} />
              </button>
            </div>
            <div className="who" style={{ paddingTop: 0 }}>
              {ROLE_LABEL[user.role]}
            </div>
            <NavLinks onNavigate={() => setMenu(false)} />
            <button className="nav" onClick={logout} style={{ marginTop: 12 }}>
              <LogOut aria-hidden /> Cerrar sesión
            </button>
          </nav>
        </div>
      )}
    </div>
  );
}

/** Encabezado + área de trabajo de cada pantalla. */
export function Page({
  title,
  crumb,
  actions,
  children,
}: {
  title: string;
  crumb?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { user } = useSession();
  return (
    <>
      <header className="top">
        <div>
          {crumb && <div className="crumb">{crumb}</div>}
          <h1>{title}</h1>
        </div>
        <span className="sp" />
        {actions && <div className="row">{actions}</div>}
        {user && (
          <div className="me hide-m">
            <span className="av" aria-hidden>
              {initials(user.name)}
            </span>
            <div>
              <b>{user.name}</b>
              <span className="muted">{ROLE_LABEL[user.role]}</span>
            </div>
          </div>
        )}
      </header>
      <main className="content">{children}</main>
    </>
  );
}

/** Bloquea una pantalla cuando el rol no tiene el permiso: no se llaman endpoints. */
export function RequirePerm({
  ok,
  children,
}: {
  ok: boolean;
  children: React.ReactNode;
}) {
  if (ok) return <>{children}</>;
  return (
    <Page title="Acceso restringido">
      <div className="alert warn">Tu rol no tiene acceso a esta sección.</div>
      <div>
        <Button variant="sec" onClick={() => history.back()}>
          Volver
        </Button>
      </div>
    </Page>
  );
}
