import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, storage } from '../api/client';
import Logo from '../components/Logo';
import './Login.css';

type TenantConfig = {
  name: string;
  theme: string;
  logo?: string;
  backgroundImage?: string;
  primaryColor?: string;
};

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [config, setConfig] = useState<TenantConfig>({ name: 'Reps & Dips', theme: 'dark' });

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
      setError(err instanceof Error ? err.message : 'Login failed');
    }
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
        <div className="login-logo">
          {config.logo ? (
            <img src={config.logo} alt={config.name} className="login-brand-logo" />
          ) : (
            <Logo />
          )}
        </div>
        <h1>{config.name}</h1>
        <h2>Sign in to your account</h2>
        <form onSubmit={handleSubmit} className="login-form">
          <label>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
          />
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
          />
          {error && <div className="login-error">{error}</div>}
          <button type="submit">Sign in</button>
        </form>
      </div>
    </div>
  );
}
