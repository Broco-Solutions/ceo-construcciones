'use client';
import Link from 'next/link';
import Image from 'next/image';
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

function SidebarUser({
  name,
  role,
  logout,
}: {
  name: string;
  role: string;
  logout: () => void;
}) {
  return (
    <div className="foot">
      <span className="av" aria-hidden>{initials(name)}</span>
      <div className="user-details">
        <b title={name}>{name}</b>
        <span>{role}</span>
      </div>
      <button
        type="button"
        className="logout"
        onClick={logout}
        aria-label="Cerrar sesión"
        title="Cerrar sesión"
      >
        <LogOut aria-hidden />
      </button>
    </div>
  );
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
              <g.icon aria-hidden className="grp-icon" />
              <span className="grp-label">{g.label}</span>
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
        <Link href="/" className="logo">
          <Image src="/brand/ceo-isotipo-blanco.png" alt="CEO Construcciones" priority width={388} height={220} />
        </Link>
        <nav className="side-nav" aria-label="Navegación principal">
          <NavLinks />
        </nav>
        <SidebarUser name={user.name} role={ROLE_LABEL[user.role]} logout={logout} />
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
            aria-label="Menú completo"
          >
            <div className="mobile-head">
              <Link href="/" className="logo" onClick={() => setMenu(false)}>
                <Image src="/brand/ceo-isotipo-blanco.png" alt="CEO Construcciones" priority width={388} height={220} />
              </Link>
              <button
                type="button"
                className="mobile-close"
                onClick={() => setMenu(false)}
                aria-label="Cerrar menú"
              >
                <X aria-hidden size={18} />
              </button>
            </div>
            <div className="side-nav">
              <NavLinks onNavigate={() => setMenu(false)} />
            </div>
            <SidebarUser name={user.name} role={ROLE_LABEL[user.role]} logout={logout} />
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
  useEffect(() => {
    document.title = `${title} · CEO Construcciones`;
  }, [title]);

  return (
    <>
      <header className="top">
        <div>
          {crumb && <div className="crumb">{crumb}</div>}
          <h1>{title}</h1>
        </div>
        <span className="sp" />
        {actions && <div className="row">{actions}</div>}
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
