import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { api, storage } from '../api/client';
import { useI18n } from '../context/I18nContext';
import Logo from '../components/Logo';
import './Login.css';

type TenantConfig = {
  name: string;
  theme: string;
  logo?: string;
  backgroundImage?: string;
  primaryColor?: string;
};

function getLoginErrorMessage(err: unknown, t: (key: string) => string): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (!msg) return t('login.errors.generic');
  if (msg.includes('Invalid credentials') || (msg.toLowerCase().includes('invalid') && msg.toLowerCase().includes('credential'))) {
    return t('login.errors.invalidCredentials');
  }
  if (msg.includes('Multiple accounts') || msg.includes('multiple')) {
    return t('login.errors.multipleAccounts');
  }
  return msg;
}

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t, locale, setLocale } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [config, setConfig] = useState<TenantConfig>({ name: 'Reps & Dips', theme: 'dark' });

  const isTrainerLogin =
    location.pathname === '/login/trainer' ||
    new URLSearchParams(location.search).get('trainer') === '1';

  useEffect(() => {
    const host = typeof window !== 'undefined' ? window.location.hostname : '';
    if (host) {
      api.tenant.getConfig(host).then(setConfig).catch(() => {});
    }
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', config.theme);
    if (config.primaryColor) {
      document.documentElement.style.setProperty('--primary', config.primaryColor);
      document.documentElement.style.setProperty('--primary-hover', config.primaryColor);
    }
  }, [config.theme, config.primaryColor]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const res = await api.auth.login(email, password);
      storage.setToken(res.access_token);
      storage.setTenantId(res.user.tenantId as string);
      storage.setRole((res.user.role as string) || '');
      if (res.user.name != null) storage.setUserName(String(res.user.name));
      else if (res.user.email) storage.setUserName(String(res.user.email));
      navigate(res.user.role === 'SUPER_ADMIN' ? '/platform' : '/');
    } catch (err) {
      setError(getLoginErrorMessage(err, t));
    }
  };

  const handleLocaleChange = (next: 'en' | 'hi' | 'ta') => {
    setLocale(next);
    const url = new URL(window.location.href);
    url.searchParams.set('lang', next);
    window.history.replaceState({}, '', url.pathname + url.search);
  };

  return (
    <div
      className="login-page"
      style={
        config.backgroundImage
          ? { backgroundImage: `url(${config.backgroundImage})`, backgroundSize: 'cover', backgroundPosition: 'center' }
          : undefined
      }
    >
      <div className="login-card">
        <div className="login-lang-switcher">
          {(['en', 'ta', 'hi'] as const).map((loc) => (
            <button
              key={loc}
              type="button"
              className={`login-lang-btn ${locale === loc ? 'active' : ''}`}
              onClick={() => handleLocaleChange(loc)}
              aria-pressed={locale === loc}
            >
              {loc === 'en' ? 'EN' : loc === 'ta' ? 'தமிழ்' : 'हिंदी'}
            </button>
          ))}
        </div>
        <div className="login-logo">
          {config.logo ? (
            <img src={config.logo} alt={config.name} className="login-brand-logo" />
          ) : (
            <Logo />
          )}
        </div>
        <h1>{config.name}</h1>
        <h2>{t('login.signInToAccount')}</h2>
        {isTrainerLogin && (
          <p className="login-trainer-line">
            <strong>{t('login.trainerSignIn')}</strong> — {t('login.trainerHint')}
          </p>
        )}
        <form onSubmit={handleSubmit} className="login-form">
          <label>{t('login.email')}</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('login.placeholders.email')}
            required
          />
          <label>{t('login.password')}</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t('login.placeholders.password')}
            required
          />
          {error && <div className="login-error">{error}</div>}
          <button type="submit">{t('login.signIn')}</button>
          <button
            type="button"
            className="login-forgot-btn"
            onClick={() => setShowForgotModal(true)}
          >
            {t('login.forgotPassword')}
          </button>
        </form>
      </div>

      {showForgotModal && (
        <div className="login-forgot-overlay" onClick={() => setShowForgotModal(false)} role="presentation">
          <div className="login-forgot-modal" onClick={(e) => e.stopPropagation()}>
            <div className="login-forgot-modal-header">
              <span>{t('login.forgotPassword')}</span>
              <button type="button" className="login-forgot-close" onClick={() => setShowForgotModal(false)} aria-label={t('common.close')}>×</button>
            </div>
            <p className="login-forgot-body">{t('login.forgotPasswordPlaceholder')}</p>
          </div>
        </div>
      )}
    </div>
  );
}
