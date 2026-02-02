import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { storage } from './api/client';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import PlatformAdmin from './pages/PlatformAdmin';
import Enquiries from './pages/Enquiries';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  if (!storage.getToken() || !storage.getTenantId()) {
    return <Navigate to="/login" replace />;
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
      <Routes>
        <Route path="/login" element={<Login />} />
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
          path="/"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
