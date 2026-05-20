import React, { useState, useEffect, useCallback } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Navbar from './Navbar';
import api from '../services/api';

/**
 * DashboardLayout — wraps all authenticated pages with Sidebar + Navbar.
 * Fetches pending ticket count for sidebar badge.
 */
export default function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  const fetchPendingCount = useCallback(async () => {
    try {
      const res = await api.get('/tickets', { params: { status: 'pending', limit: 1 } });
      setPendingCount(res.data.pagination?.total || 0);
    } catch {}
  }, []);

  useEffect(() => {
    fetchPendingCount();
    const interval = setInterval(fetchPendingCount, 30000);
    return () => clearInterval(interval);
  }, [fetchPendingCount]);

  return (
    <div className="min-h-screen bg-surface-50 dark:bg-surface-900">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        pendingCount={pendingCount}
      />
      <div className="lg:ml-60">
        <Navbar onMenuToggle={() => setSidebarOpen(!sidebarOpen)} />
        <main className="p-4 lg:p-6 min-h-[calc(100vh-4rem)]">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
