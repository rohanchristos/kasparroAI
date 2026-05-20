import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import DashboardLayout from './components/DashboardLayout';
import LoginPage from './pages/LoginPage';
import Dashboard from './pages/Dashboard';
import TicketsPage from './pages/TicketsPage';
import AnalyticsPage from './pages/AnalyticsPage';
import SettingsPage from './pages/SettingsPage';
import AuditPage from './pages/AuditPage';

/**
 * ProtectedRoute — redirects to /login if not authenticated.
 */
function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-50 dark:bg-surface-900">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-3 border-primary-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
        </div>
      </div>
    );
  }
  return isAuthenticated ? children : <Navigate to="/login" replace />;
}

/**
 * GuestRoute — redirects to /dashboard if already authenticated.
 */
function GuestRoute({ children }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <Navigate to="/dashboard" replace /> : children;
}

/**
 * App — root component with routing and context providers.
 */
export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        {/* Toast notifications */}
        <Toaster
          position="bottom-right"
          toastOptions={{
            duration: 3000,
            style: {
              background: '#1F2937',
              color: '#F9FAFB',
              fontSize: '14px',
              borderRadius: '12px',
              padding: '12px 16px',
              maxWidth: '400px',
            },
            success: {
              iconTheme: { primary: '#10B981', secondary: '#F9FAFB' },
            },
            error: {
              iconTheme: { primary: '#EF4444', secondary: '#F9FAFB' },
              duration: 5000,
            },
          }}
        />

        <Routes>
          {/* Public */}
          <Route
            path="/login"
            element={
              <GuestRoute>
                <LoginPage />
              </GuestRoute>
            }
          />

          {/* Protected — dashboard layout */}
          <Route
            element={
              <ProtectedRoute>
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/tickets" element={<TicketsPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/audit" element={<AuditPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>

          {/* Redirects */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
