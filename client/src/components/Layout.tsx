import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import { useI18n } from '../context/I18nContext';
import { storage, api } from '../api/client';
import { runDashboardTour, runEnquiriesTour } from '../utils/guidedTour';
import Logo from './Logo';
import PushNotificationSettings from './PushNotificationSettings';
import { AppIcons, BottomNavIcons, type NavIconId } from './icons/AppIcons';
import './Layout.css';

type NavItem = { id: NavIconId; label: string };

type TenantConfig = { name: string; logo?: string; showFinanceTab?: boolean };

export default function Layout({
  children,
  activeNav,
  onNavChange,
  onLogout,
}: {
  children: React.ReactNode;
  activeNav: 'dashboard' | 'main' | 'add' | 'checkin' | 'finance' | 'enquiries' | 'onboarding' | 'nutrition-ai' | 'medical-history' | 'workout-plan' | 'telegram' | 'notifications';
  onNavChange: (id: string) => void;
  onLogout: () => void;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const { t, locale, setLocale } = useI18n();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const isSuperAdmin = storage.getRole() === 'SUPER_ADMIN';
  const [showScrollTop, setShowScrollTop] = useState(false);
  const mainRef = useRef<HTMLDivElement>(null);
  const [tenantConfig, setTenantConfig] = useState<TenantConfig | null>(null);
  const [userName, setUserNameState] = useState(() => storage.getUserName() || 'User');
  const [isPwa, setIsPwa] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as { standalone?: boolean }).standalone === true;
    setIsPwa(standalone);
  }, []);

  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const onScroll = () => setShowScrollTop(el.scrollTop > 200);
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const tenantId = storage.getTenantId();
    if (!tenantId) {
      setTenantConfig(null);
      return;
    }
    api.tenant.getConfig(undefined, tenantId)
      .then((c) => setTenantConfig({ name: c.name, logo: c.logo, showFinanceTab: c.showFinanceTab }))
      .catch(() => setTenantConfig(null));
  }, []);

  useEffect(() => {
    const stored = storage.getUserName();
    if (stored) setUserNameState(stored);
    if (storage.getToken() && !stored) {
      api.auth.getMe()
        .then((me) => {
          const name = me.name ? String(me.name) : me.email ? String(me.email) : '';
          if (name) {
            storage.setUserName(name);
            setUserNameState(name);
          }
        })
        .catch(() => {});
    }
  }, []);

  const isMember = storage.getRole() === 'MEMBER';
  const isTrainer = storage.getRole() === 'TRAINER';
  const showFinanceTab = tenantConfig?.showFinanceTab !== false;
  const navItems: NavItem[] = isTrainer
    ? [
        { id: 'dashboard', label: t('trainer.nav.myMembers') },
        { id: 'nutrition-ai', label: t('trainer.nav.nutritionAI') },
        { id: 'workout-plan', label: t('trainer.nav.workoutPlan') },
      ]
    : (isMember
    ? [
        { id: 'nutrition-ai', label: 'Nutrition AI' },
        { id: 'medical-history', label: 'Medical History' },
        { id: 'workout-plan', label: 'Workout Plan' },
      ]
    : [
        { id: 'dashboard', label: 'Dashboard' },
        { id: 'main', label: 'Members' },
        { id: 'enquiries', label: 'Enquiry Members' },
        { id: 'checkin', label: 'Attendance' },
        { id: 'finance', label: 'Finance' },
        { id: 'onboarding', label: 'Onboarding' },
        { id: 'nutrition-ai', label: 'Nutrition AI' },
        { id: 'telegram', label: 'Telegram' },
        { id: 'notifications', label: 'Notifications' },
      ]
  ).filter((item) => item.id !== 'finance' || showFinanceTab);

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
    <div className={`layout ${isPwa ? 'layout--pwa' : ''}`}>
      <header className="topbar">
        <button className="menu-btn" onClick={toggleDrawer} aria-label="Toggle menu">
          <span className={`hamburger ${drawerOpen ? 'open' : ''}`} />
          <span className={`hamburger ${drawerOpen ? 'open' : ''}`} />
          <span className={`hamburger ${drawerOpen ? 'open' : ''}`} />
        </button>
        <span className="topbar-user-name">{userName}</span>
        {isTrainer && (
          <div className="topbar-lang-switcher">
            {(['en', 'ta', 'hi'] as const).map((loc) => (
              <button
                key={loc}
                type="button"
                className={`topbar-lang-btn ${locale === loc ? 'active' : ''}`}
                onClick={() => setLocale(loc)}
                aria-pressed={locale === loc}
                title={loc === 'en' ? 'English' : loc === 'ta' ? 'Tamil' : 'Hindi'}
              >
                {loc === 'en' ? 'EN' : loc === 'ta' ? 'தமிழ்' : 'हिंदी'}
              </button>
            ))}
          </div>
        )}
      </header>

      <div className={`drawer-overlay ${drawerOpen ? 'visible' : ''}`} onClick={closeDrawer} aria-hidden />

      <aside className={`drawer ${drawerOpen ? 'open' : ''}`}>
        <div className="drawer-header">
          <Logo tenantName={tenantConfig?.name} logoUrl={tenantConfig?.logo} />
        </div>
        <nav className="drawer-nav">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${activeNav === item.id ? 'active' : ''}`}
              onClick={() => handleNav(item.id)}
              data-tour={`nav-${item.id}`}
            >
              <span className="nav-icon">{AppIcons[item.id]?.() ?? null}</span>
              <span className="nav-label">{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="drawer-footer">
          {!isMember && isSuperAdmin && (
            <button className="nav-item" onClick={() => { closeDrawer(); navigate('/platform'); }}>
              <span className="nav-icon">{AppIcons.settings()}</span>
              <span className="nav-label">Platform Admin</span>
            </button>
          )}
          {!isMember && (
            <button
              type="button"
              className="nav-item"
              onClick={() => {
                closeDrawer();
                if (location.pathname === '/enquiries') {
                  runEnquiriesTour();
                } else {
                  onNavChange('main');
                  setTimeout(() => runDashboardTour(), 500);
                }
              }}
              data-tour="tour-trigger"
            >
              <span className="nav-icon">{AppIcons.guide()}</span>
              <span className="nav-label">Guide</span>
            </button>
          )}
          <div className="drawer-push-settings">
            <PushNotificationSettings variant="drawer" />
          </div>
          {!isMember && (
            <button type="button" className="nav-item" onClick={toggleTheme} data-tour="theme-toggle">
            <span className="nav-icon">{theme === 'light' ? AppIcons.moon() : AppIcons.sun()}</span>
            <span className="nav-label">{theme === 'light' ? 'Dark Mode' : 'Light Mode'}</span>
          </button>
          )}
          <button className="nav-item logout" onClick={onLogout}>
            <span className="nav-icon">{AppIcons.logout()}</span>
            <span className="nav-label">Logout</span>
          </button>
          <div className="drawer-footer-brand">
            <Logo tenantName={tenantConfig?.name} logoUrl={tenantConfig?.logo} />
          </div>
        </div>
      </aside>

      <main ref={mainRef} className="main-content">
        <div className="motivation-bg" aria-hidden="true">
          {/* Single full background image - fitness / motivation */}
          <img
            src="https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=1600&q=85"
            alt=""
            width={1600}
            height={1200}
            decoding="async"
            className="motivation-img-single"
          />
        </div>
        <div className="main-content-inner">{children}</div>
      </main>

      {!isMember && !isTrainer && (
      <nav className="bottom-nav">
        <button className={`bn-item ${activeNav === 'main' ? 'active' : ''}`} onClick={() => handleNav('main')} title="People">
          <span className="bn-icon">{BottomNavIcons.main()}</span>
        </button>
        <button className={`bn-item ${activeNav === 'dashboard' ? 'active' : ''}`} onClick={() => handleNav('dashboard')} title="Dashboard">
          <span className="bn-icon">{BottomNavIcons.dashboard()}</span>
        </button>
        {showFinanceTab ? (
          <button className={`bn-item ${activeNav === 'finance' ? 'active' : ''}`} onClick={() => handleNav('finance')} title="Finance">
            <span className="bn-icon">{BottomNavIcons.finance()}</span>
          </button>
        ) : (
          <button type="button" className="bn-item bn-item-logout" onClick={onLogout} title="Logout" aria-label="Logout">
            <span className="bn-icon">{BottomNavIcons.logout()}</span>
          </button>
        )}
      </nav>
      )}

      {showScrollTop && (
        <button
          className="fab-scroll-top"
          onClick={() => mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
          title="Scroll to top"
          aria-label="Scroll to top"
        >
          <span className="fab-scroll-top-arrow">{AppIcons.chevronUp()}</span>
        </button>
      )}
    </div>
  );
}
