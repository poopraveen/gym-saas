import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { storage } from './api/client';
import GlobalLoader from './components/GlobalLoader';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import PlatformAdmin from './pages/PlatformAdmin';
import Enquiries from './pages/Enquiries';
import Onboarding from './pages/Onboarding';
import NutritionAI from './pages/NutritionAI';
import MedicalHistory from './pages/MedicalHistory';
import WorkoutPlan from './pages/WorkoutPlan';
import CheckIn from './pages/CheckIn';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  if (!storage.getToken() || !storage.getTenantId()) {
    return <Navigate to="/login" replace />;
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

function PlatformRoute({ children }: { children: React.ReactNode }) {
  if (!storage.getToken()) return <Navigate to="/login" replace />;
  if (storage.getRole() !== 'SUPER_ADMIN') return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <GlobalLoader />
      <Routes>
        <Route path="/login" element={<Login />} />
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
              <Enquiries />
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
              <MedicalHistory />
            </ProtectedRoute>
          }
        />
        <Route
          path="/workout-plan"
          element={
            <ProtectedRoute>
              <WorkoutPlan />
            </ProtectedRoute>
          }
        />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <MemberRoute>
                <Dashboard />
              </MemberRoute>
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
