import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { UserRole, NotificationItem } from '../types';
import { api } from '../services/api';
import {
  ShieldCheck,
  Bell,
  Moon,
  Sun,
  Lock,
  LogOut,
  LogIn,
} from 'lucide-react';

export const Navbar: React.FC<{
  activeTab: string;
  setActiveTab: (tab: string) => void;
}> = ({ setActiveTab }) => {
  const {
    user,
    role,
    logout,
    setOpenLoginModal,
    darkMode,
    toggleDarkMode,
  } = useAuth();

  const [showNotifs, setShowNotifs] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  const fetchNotifs = async () => {
    try {
      const data = await api.getNotifications();

      if (data && data.notifications) {
        setNotifications(data.notifications);
      }
    } catch (e) {
      console.error('Failed to fetch notifications:', e);
    }
  };

  useEffect(() => {
    fetchNotifs();

    const interval = setInterval(fetchNotifs, 10000);

    return () => clearInterval(interval);
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleMarkRead = async () => {
    try {
      await api.markNotificationsRead();
      await fetchNotifs();
    } catch (e) {
      console.error('Failed to mark notifications as read:', e);
    }
  };

  const getRoleBadgeColor = (r: UserRole) => {
    switch (r) {
      case 'PATIENT':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200 border-blue-200 dark:border-blue-700';

      case 'DOCTOR':
        return 'bg-teal-100 text-teal-800 dark:bg-teal-900/60 dark:text-teal-200 border-teal-200 dark:border-teal-700';

      case 'HOSPITAL_ADMIN':
        return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/60 dark:text-indigo-200 border-indigo-200 dark:border-indigo-700';

      case 'SYSTEM_ADMIN':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-200 border-purple-200 dark:border-purple-700';

      default:
        return 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700';
    }
  };

  const getTrustBadgeColor = (score: number) => {
    if (score >= 80) {
      return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30';
    }

    if (score >= 40) {
      return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30';
    }

    return 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30';
  };

  return (
    <header className="sticky top-0 z-40 w-full bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">

        {/* Left: Brand Identity */}
        <div
          className="flex items-center gap-3 cursor-pointer"
          onClick={() => setActiveTab('dashboard')}
        >
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-700 via-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20">
            <ShieldCheck className="w-6 h-6" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg text-slate-900 dark:text-white tracking-tight">
                FedTrustMed
              </span>

              <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-semibold tracking-wider uppercase bg-blue-50 text-blue-700 dark:bg-blue-950/80 dark:text-blue-300 px-2 py-0.5 rounded-full border border-blue-200 dark:border-blue-800">
                Fabric Peer Active
              </span>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400 hidden sm:block">
              Federated Blockchain & Dynamic Trust Framework
            </p>
          </div>
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-2 sm:gap-3">

          {/* Accounts Portal */}
          <button
            onClick={() => setOpenLoginModal(true)}
            className="px-3 py-1.5 rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950/80 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900 border border-blue-200 dark:border-blue-800 text-xs font-bold flex items-center gap-1.5 transition-colors"
          >
            <LogIn className="w-3.5 h-3.5" />

            <span className="hidden sm:inline">
              Accounts Portal
            </span>
          </button>

          {/* Dark Mode Toggle */}
          <button
            onClick={toggleDarkMode}
            aria-label="Toggle theme"
            className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            {darkMode ? (
              <Sun className="w-5 h-5 text-amber-400" />
            ) : (
              <Moon className="w-5 h-5" />
            )}
          </button>

          {/* Notification Bell */}
          <div className="relative">
            <button
              onClick={() => {
                setShowNotifs(!showNotifs);

                if (unreadCount > 0) {
                  handleMarkRead();
                }
              }}
              aria-label="Notifications"
              className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors relative"
            >
              <Bell className="w-5 h-5" />

              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-rose-500 rounded-full ring-2 ring-white dark:ring-slate-900 animate-pulse" />
              )}
            </button>

            {/* Notification Drawer */}
            {showNotifs && (
              <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 p-4 z-50">

                <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100 dark:border-slate-800">
                  <h4 className="font-semibold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Bell className="w-4 h-4 text-blue-600" />

                    Security & System Alerts
                  </h4>

                  <span className="text-xs text-slate-400">
                    {notifications.length} total
                  </span>
                </div>

                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {notifications.length === 0 ? (
                    <div className="text-center py-6 text-xs text-slate-400">
                      No notifications
                    </div>
                  ) : (
                    notifications.map((n) => (
                      <div
                        key={n.id}
                        className={`p-2.5 rounded-xl text-xs border ${
                          n.type === 'ALERT'
                            ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900/50 text-rose-800 dark:text-rose-200'
                            : n.type === 'SUCCESS'
                            ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900/50 text-emerald-800 dark:text-emerald-200'
                            : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <div className="font-semibold flex items-center justify-between mb-1">
                          <span>{n.title}</span>

                          <span className="text-[10px] opacity-70">
                            {new Date(n.timestamp).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>

                        <p className="opacity-90 leading-relaxed">
                          {n.message}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* User Profile & Trust Badge */}
          <div className="flex items-center gap-2 pl-2 border-l border-slate-200 dark:border-slate-800">

            {/* User Information */}
            <div className="hidden sm:block text-right">
              <div className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1 justify-end">
                {user?.fullName || 'User'}

                {user?.isFrozen && (
                  <Lock className="w-3 h-3 text-rose-500" />
                )}
              </div>

              <div className="flex items-center gap-1 justify-end">
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${getRoleBadgeColor(
                    role
                  )}`}
                >
                  {role}
                </span>
              </div>
            </div>

            {/* Dynamic Trust Chip */}
            <div
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border cursor-pointer ${getTrustBadgeColor(
                user?.trustScore ?? 0
              )}`}
              onClick={() => setActiveTab('trust')}
              title="Click to inspect Dynamic Trust Engine Score"
            >
              <ShieldCheck className="w-3.5 h-3.5" />

              <span>
                TS: {user?.trustScore ?? 0}
              </span>
            </div>

            {/* Log Out */}
            <button
              onClick={logout}
              title="Log Out & Return to Landing Page"
              className="p-2 rounded-xl text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/60 transition-colors ml-1"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};