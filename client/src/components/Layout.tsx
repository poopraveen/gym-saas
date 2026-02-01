import React, { useState, useEffect, useRef } from 'react';
import { useTheme } from '../context/ThemeContext';
import Logo from './Logo';
import './Layout.css';

type NavItem = { id: string; label: string; icon: string };

export default function Layout({
  children,
  activeNav,
  onNavChange,
  onLogout,
}: {
  children: React.ReactNode;
  activeNav: 'dashboard' | 'main' | 'add' | 'checkin' | 'finance';
  onNavChange: (id: string) => void;
  onLogout: () => void;
}) {
  const { theme, toggleTheme } = useTheme();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const mainRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const onScroll = () => setShowScrollTop(el.scrollTop > 200);
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  const navItems: NavItem[] = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'main', label: 'People', icon: '👥' },
    { id: 'add', label: 'Add Member', icon: '➕' },
    { id: 'checkin', label: 'Attendance', icon: '✓' },
    { id: 'finance', label: 'Finance', icon: '💰' },
  ];

  const closeDrawer = () => setDrawerOpen(false);
  const toggleDrawer = () => setDrawerOpen((o) => !o);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) setDrawerOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleNav = (id: string) => {
    onNavChange(id);
    if (window.innerWidth < 768) closeDrawer();
  };

  return (
    <div className="layout">
      <header className="topbar">
        <button className="menu-btn" onClick={toggleDrawer} aria-label="Toggle menu">
          <span className={`hamburger ${drawerOpen ? 'open' : ''}`} />
          <span className={`hamburger ${drawerOpen ? 'open' : ''}`} />
          <span className={`hamburger ${drawerOpen ? 'open' : ''}`} />
        </button>
        <Logo compact />
      </header>

      <div className={`drawer-overlay ${drawerOpen ? 'visible' : ''}`} onClick={closeDrawer} aria-hidden />

      <aside className={`drawer ${drawerOpen ? 'open' : ''}`}>
        <div className="drawer-header">
          <Logo />
        </div>
        <nav className="drawer-nav">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${activeNav === item.id ? 'active' : ''}`}
              onClick={() => handleNav(item.id)}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="drawer-footer">
          <button className="nav-item" onClick={toggleTheme}>
            <span className="nav-icon">{theme === 'light' ? '🌙' : '☀️'}</span>
            <span className="nav-label">{theme === 'light' ? 'Dark Mode' : 'Light Mode'}</span>
          </button>
          <button className="nav-item logout" onClick={onLogout}>
            <span className="nav-icon">🚪</span>
            <span className="nav-label">Logout</span>
          </button>
        </div>
      </aside>

      <main ref={mainRef} className="main-content">{children}</main>

      <nav className="bottom-nav">
        <button className={`bn-item ${activeNav === 'main' ? 'active' : ''}`} onClick={() => handleNav('main')} title="People">
          <span className="bn-icon">👥</span>
        </button>
        <button className={`bn-item ${activeNav === 'dashboard' ? 'active' : ''}`} onClick={() => handleNav('dashboard')} title="Dashboard">
          <span className="bn-icon">📊</span>
        </button>
        <button className={`bn-item ${activeNav === 'finance' ? 'active' : ''}`} onClick={() => handleNav('finance')} title="Finance">
          <span className="bn-icon">💰</span>
        </button>
      </nav>

      {showScrollTop && (
        <button
          className="fab-scroll-top"
          onClick={() => mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
          title="Scroll to top"
          aria-label="Scroll to top"
        >
          <span className="fab-scroll-top-arrow">↑</span>
        </button>
      )}
    </div>
  );
}
