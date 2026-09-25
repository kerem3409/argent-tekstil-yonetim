import { Fragment, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { navigation, pages } from '../app/navigation';
import { Icon } from './Icon';

export function Layout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();
  const currentPage = pages.find((page) => page.path === pathname);
  const currentGroup = navigation.find((group) => group.pages.some((page) => page.path === pathname));

  return <div className="app-shell">
    <a className="skip-link" href="#main-content">İçeriğe geç</a>
    {menuOpen && <button className="sidebar-backdrop" aria-label="Menüyü kapat" onClick={() => setMenuOpen(false)} />}
    <aside id="sidebar" className={`sidebar ${menuOpen ? 'is-open' : ''}`}>
      <div className="brand"><span className="brand-mark">A</span><div><strong>ARGENT <span>TEKSTİL</span></strong><small>Atölye Yönetimi</small></div></div>
      <nav aria-label="Ana menü" onClick={(event) => { if ((event.target as HTMLElement).closest('a')) setMenuOpen(false); }}>
        <NavLink to="/" end className="home-link"><Icon name="home" />Ana Sayfa</NavLink>
        {navigation.map((group) => <details key={group.title} open className="nav-group">
          <summary><Icon name={group.symbol} /><span>{group.title}</span><span className="chevron">⌄</span></summary>
          <div className="nav-children">{group.pages.map((page, index) => <Fragment key={page.id}>
            {page.subgroup && group.pages[index - 1]?.subgroup !== page.subgroup && <div className="nav-subgroup">{page.subgroup}</div>}
            <NavLink to={page.path} end className={page.subgroup ? 'nested-link' : ''}>{page.title}</NavLink>
          </Fragment>)}</div>
        </details>)}
      </nav>
      <div className="sidebar-footer"><span className="status-dot" />Yerel çalışma alanı</div>
    </aside>
    <div className="workspace">
      <header className="header">
        <div className="breadcrumb"><button className="menu-toggle" onClick={() => setMenuOpen(!menuOpen)} aria-label="Ana menüyü aç veya kapat" aria-expanded={menuOpen} aria-controls="sidebar"><Icon name="menu" /></button><span>Atölye Yönetimi</span><span className="breadcrumb-divider">/</span><strong>{currentGroup?.title ?? (pathname === '/' ? 'Ana Sayfa' : 'Sayfa bulunamadı')}</strong></div>
        <span className="workspace-label">Argent Tekstil</span>
      </header>
      <main id="main-content" key={pathname} tabIndex={-1} aria-label={currentPage?.title ?? 'Ana içerik'}><Outlet /></main>
      <footer className="workspace-footer"><span>Argent Tekstil · Atölye Yönetimi</span></footer>
      <small className="version-label">Sürüm: {typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'local'}</small>
    </div>
  </div>;
}
