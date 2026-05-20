import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Ticket, BarChart3, Settings, X, Zap, FileText } from 'lucide-react';

/**
 * Sidebar — left navigation panel.
 * Collapses to overlay on mobile.
 */
export default function Sidebar({ isOpen, onClose, pendingCount = 0 }) {
  const navItems = [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/tickets', icon: Ticket, label: 'Tickets', badge: pendingCount },
    { to: '/analytics', icon: BarChart3, label: 'Analytics' },
    { to: '/audit', icon: FileText, label: 'Audit Log' },
    { to: '/settings', icon: Settings, label: 'Settings' },
  ];

  const linkClasses = ({ isActive }) =>
    `flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group ${
      isActive
        ? 'bg-primary-500/10 text-primary-600 dark:text-primary-400'
        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-200'
    }`;

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center justify-between px-5 h-16 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-gradient-to-br from-primary-500 to-grok rounded-lg flex items-center justify-center">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <span className="text-lg font-bold text-gray-900 dark:text-white tracking-tight">
            KASPARRO
          </span>
        </div>
        {/* Mobile close */}
        <button
          onClick={onClose}
          className="lg:hidden p-1 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={linkClasses}
            onClick={onClose}
            id={`nav-${item.label.toLowerCase()}`}
          >
            <item.icon className="w-5 h-5 flex-shrink-0" />
            <span className="flex-1">{item.label}</span>
            {item.badge > 0 && (
              <span className="min-w-[20px] h-5 px-1.5 flex items-center justify-center rounded-full bg-red-500 text-white text-xs font-bold">
                {item.badge > 99 ? '99+' : item.badge}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-800">
        <p className="text-[10px] text-gray-400 dark:text-gray-600 text-center">
          Kasparro AI v2.0
        </p>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:left-0 lg:w-60 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 z-30">
        {sidebarContent}
      </aside>

      {/* Mobile sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 w-64 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 z-50 transform transition-transform duration-300 lg:hidden ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
