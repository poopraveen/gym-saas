import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, storage } from '../api/client';
import Logo from '../components/Logo';
import './Login.css';

export default function Login() {
  const navigate = useNavigate();
  const [tenantId, setTenantId] = useState(storage.getTenantId() || '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const res = await api.auth.login(email, password, tenantId);
      storage.setToken(res.access_token);
      storage.setTenantId(tenantId);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <Logo />
        </div>
        <h1>Reps & Dips</h1>
        <h2>Sign in to your account</h2>
        <form onSubmit={handleSubmit} className="login-form">
          <label>Tenant ID</label>
          <input
            type="text"
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
            placeholder="Enter tenant ID"
            required
          />
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
