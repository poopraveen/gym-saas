import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { storage } from './api/client';
import GlobalLoader from './components/GlobalLoader';
import ApiConnectionBanner from './components/ApiConnectionBanner';
import PWAInstallPrompt from './components/PWAInstallPrompt';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import PlatformAdmin from './pages/PlatformAdmin';
import Enquiries from './pages/Enquiries';
import Onboarding from './pages/Onboarding';
import NutritionAI from './pages/NutritionAI';
import MedicalHistory from './pages/MedicalHistory';
import WorkoutPlan from './pages/WorkoutPlan';
import TrainerDashboard from './pages/TrainerDashboard';
import CheckIn from './pages/CheckIn';
import Telegram from './pages/Telegram';
import Notifications from './pages/Notifications';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  if (!storage.getToken() || !storage.getTenantId()) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

/** Redirect TRAINER to / if they try to access any route other than allowed (/, nutrition-ai, workout-plan). */
function TrainerRestrict({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  if (storage.getRole() === 'TRAINER') {
    const path = location.pathname;
    if (path !== '/' && path !== '/nutrition-ai' && path !== '/workout-plan') {
      return <Navigate to="/" replace />;
    }
  }
  return <>{children}</>;
}

function MemberRoute({ children }: { children: React.ReactNode }) {
  if (!storage.getToken() || !storage.getTenantId()) {
    return <Navigate to="/login" replace />;
  }
  if (storage.getRole() === 'MEMBER') {
    return <Navigate to="/nutrition-ai" replace />;
  }
  return <>{children}</>;
}

function DashboardOrTrainerDashboard() {
  if (storage.getRole() === 'TRAINER') return <TrainerDashboard />;
  return <Dashboard />;
}

function PlatformRoute({ children }: { children: React.ReactNode }) {
  if (!storage.getToken()) return <Navigate to="/login" replace />;
  if (storage.getRole() !== 'SUPER_ADMIN') return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <GlobalLoader />
      <ApiConnectionBanner />
      <PWAInstallPrompt />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/login/trainer" element={<Login />} />
        <Route path="/checkin" element={<CheckIn />} />
        <Route
          path="/platform"
          element={
            <PlatformRoute>
              <PlatformAdmin />
            </PlatformRoute>
          }
        />
        <Route
          path="/enquiries"
          element={
            <ProtectedRoute>
              <TrainerRestrict>
                <Enquiries />
              </TrainerRestrict>
            </ProtectedRoute>
          }
        />
        <Route
          path="/onboarding"
          element={
            <ProtectedRoute>
              <Onboarding />
            </ProtectedRoute>
          }
        />
        <Route
          path="/nutrition-ai"
          element={
            <ProtectedRoute>
              <NutritionAI />
            </ProtectedRoute>
          }
        />
        <Route
          path="/medical-history"
          element={
            <ProtectedRoute>
              <TrainerRestrict>
                <MedicalHistory />
              </TrainerRestrict>
            </ProtectedRoute>
          }
        />
        <Route
          path="/workout-plan"
          element={
            <ProtectedRoute>
              <TrainerRestrict>
                <WorkoutPlan />
              </TrainerRestrict>
            </ProtectedRoute>
          }
        />
        <Route
          path="/telegram"
          element={
            <ProtectedRoute>
              <TrainerRestrict>
                <MemberRoute>
                  <Telegram />
                </MemberRoute>
              </TrainerRestrict>
            </ProtectedRoute>
          }
        />
        <Route
          path="/notifications"
          element={
            <ProtectedRoute>
              <TrainerRestrict>
                <MemberRoute>
                  <Notifications />
                </MemberRoute>
              </TrainerRestrict>
            </ProtectedRoute>
          }
        />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <TrainerRestrict>
                <MemberRoute>
                  <DashboardOrTrainerDashboard />
                </MemberRoute>
              </TrainerRestrict>
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
