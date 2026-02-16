import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, storage } from '../api/client';
import type { AiMember } from '../api/client';
import Layout from '../components/Layout';
import { AppIcons } from '../components/icons/AppIcons';
import './TrainerDashboard.css';

export default function TrainerDashboard() {
  const navigate = useNavigate();
  const [members, setMembers] = useState<AiMember[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.auth
      .getMyAssignedMembers()
      .then((list) => setMembers(Array.isArray(list) ? list : []))
      .catch(() => setMembers([]))
      .finally(() => setLoading(false));
  }, []);

  const handleNavChange = (id: string) => {
    if (id === 'nutrition-ai') navigate('/nutrition-ai');
    else if (id === 'workout-plan') navigate('/workout-plan');
    else if (id === 'onboarding') navigate('/onboarding');
  };

  const handleLogout = () => {
    storage.clear();
    navigate('/login');
  };

  return (
    <Layout activeNav="dashboard" onNavChange={handleNavChange} onLogout={handleLogout}>
      <div className="trainer-dashboard">
        <h1 className="trainer-dashboard-title">My assigned members</h1>
        <p className="trainer-dashboard-desc">
          View Nutrition AI and Workout info for each member assigned to you.
        </p>
        {loading ? (
          <div className="trainer-dashboard-loading">Loading…</div>
        ) : members.length === 0 ? (
          <div className="trainer-dashboard-empty">
            <p>No members assigned to you yet.</p>
            <p className="trainer-dashboard-empty-hint">
              Your admin can assign members from Onboarding → Members enrolled for AI.
            </p>
          </div>
        ) : (
          <div className="trainer-dashboard-list">
            {members.map((m) => (
              <div key={m.id} className="trainer-dashboard-card">
                <div className="trainer-dashboard-card-header">
                  <span className="trainer-dashboard-card-name">{m.name || m.email}</span>
                  {m.name && <span className="trainer-dashboard-card-email">{m.email}</span>}
                  {m.linkedRegNo != null && (
                    <span className="trainer-dashboard-card-reg">Reg No: {m.linkedRegNo}</span>
                  )}
                </div>
                <div className="trainer-dashboard-card-actions">
                  <button
                    type="button"
                    className="btn-primary trainer-dashboard-btn"
                    onClick={() => navigate(`/nutrition-ai?memberId=${encodeURIComponent(m.id)}`)}
                  >
                    <span className="trainer-dashboard-btn-icon">{AppIcons['nutrition-ai']?.() ?? null}</span>
                    Nutrition AI
                  </button>
                  <button
                    type="button"
                    className="btn-primary trainer-dashboard-btn"
                    onClick={() => navigate(`/workout-plan?memberId=${encodeURIComponent(m.id)}`)}
                  >
                    <span className="trainer-dashboard-btn-icon">{AppIcons['workout-plan']?.() ?? null}</span>
                    Workout Plan
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
