import React, { useState, useEffect, useRef } from 'react';
import {
  Bell,
  Sun,
  Moon,
  LogOut,
  AlertTriangle,
  Building,
  CheckCircle2,
  Clock,
  Sparkles,
  Check,
  Shield,
  Menu,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api, AppNotification } from '../services/api';

interface NavbarProps {
  onToggleSidebar?: () => void;
  onNavigate?: (item: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onToggleSidebar, onNavigate }) => {
  const { user, logout, simulationMode } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('fedtrustmed_theme');
    if (saved) return saved === 'dark';
    return document.documentElement.classList.contains('dark') || true;
  });

  const notifRef = useRef<HTMLDivElement>(null);

  // Sync theme with DOM on mount and change
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('fedtrustmed_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('fedtrustmed_theme', 'light');
    }
  }, [isDarkMode]);

  // Load notifications from GET /api/notifications
  const fetchNotifications = async () => {
    try {
      const items = await api.getNotifications();
      setNotifications(items);
    } catch (err) {
      console.warn('Failed to fetch notifications:', err);
    }
  };

  useEffect(() => {
    if (user) {
      fetchNotifications();
      const interval = setInterval(fetchNotifications, 15000);
      return () => clearInterval(interval);
    }
  }, [user]);

  // Close notifications dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setIsNotifOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleMarkAsRead = async (id: string) => {
    try {
      await api.markNotificationRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await api.markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    }
  };

  return (
    <header className="sticky top-0 z-30 w-full bg-slate-900 border-b border-slate-800 dark:bg-slate-950 dark:border-slate-800/80">
      {/* 1. FROZEN ACCOUNT BANNER */}
      {user?.isFrozen && (
        <div className="bg-rose-600 text-white px-4 py-2.5 flex items-center justify-center gap-2 text-xs font-bold tracking-wide shadow-inner animate-pulse">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>
            ACCOUNT FROZEN: Your account access has been suspended due to security policy or trust-score thresholds. Please contact your hospital administrator.
          </span>
        </div>
      )}

      {/* 2. MAIN NAVBAR CONTENT */}
      <div className="h-16 px-4 sm:px-6 flex items-center justify-between gap-4">
        
        {/* Left Side: Sidebar Toggle & Node / Hospital Info */}
        <div className="flex items-center space-x-3">
          {onToggleSidebar && (
            <button
              type="button"
              onClick={onToggleSidebar}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
              aria-label="Toggle sidebar"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}

          <div className="flex items-center gap-2">
            <Building className="w-4 h-4 text-teal-400 shrink-0" />
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-200 truncate max-w-[180px] sm:max-w-xs">
                {user?.hospitalName || 'FedTrustMed Central Network'}
              </span>
              <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Node Online
              </span>
            </div>
          </div>

          {simulationMode && (
            <span className="hidden md:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-300 border border-amber-500/20">
              <Sparkles className="w-3 h-3" />
              SIMULATION ACTIVE
            </span>
          )}
        </div>

        {/* Right Side: Notification Bell, Dark Mode Toggle, User Profile & Logout */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          
          {/* Notification Bell */}
          <div className="relative" ref={notifRef}>
            <button
              type="button"
              onClick={() => setIsNotifOpen(!isNotifOpen)}
              className="relative p-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
              aria-label="View notifications"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center ring-2 ring-slate-900">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {/* Notification Dropdown */}
            {isNotifOpen && (
              <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl overflow-hidden z-50 text-slate-200 animate-in fade-in zoom-in-95 duration-150">
                <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white uppercase tracking-wider">
                      Notifications
                    </span>
                    {unreadCount > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 font-semibold">
                        {unreadCount} new
                      </span>
                    )}
                  </div>
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={handleMarkAllAsRead}
                      className="text-[11px] text-teal-400 hover:text-teal-300 font-semibold"
                    >
                      Mark all as read
                    </button>
                  )}
                </div>

                <div className="max-h-80 overflow-y-auto divide-y divide-slate-800/80">
                  {notifications.length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-500">
                      No notifications yet
                    </div>
                  ) : (
                    notifications.map((n) => (
                      <div
                        key={n.id}
                        onClick={() => handleMarkAsRead(n.id)}
                        className={`p-3.5 hover:bg-slate-800/60 transition-colors cursor-pointer flex items-start gap-3 ${
                          !n.read ? 'bg-teal-500/5' : ''
                        }`}
                      >
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                            n.type === 'SUCCESS'
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : n.type === 'ALERT'
                              ? 'bg-rose-500/20 text-rose-400'
                              : n.type === 'WARNING'
                              ? 'bg-amber-500/20 text-amber-400'
                              : 'bg-teal-500/20 text-teal-400'
                          }`}
                        >
                          {n.type === 'SUCCESS' && <CheckCircle2 className="w-3.5 h-3.5" />}
                          {n.type === 'ALERT' && <AlertTriangle className="w-3.5 h-3.5" />}
                          {n.type === 'WARNING' && <Clock className="w-3.5 h-3.5" />}
                          {n.type === 'INFO' && <Shield className="w-3.5 h-3.5" />}
                        </div>
                        <div className="flex-1 overflow-hidden">
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-xs font-semibold text-slate-200 truncate">
                              {n.title}
                            </span>
                            {!n.read && (
                              <span className="w-1.5 h-1.5 rounded-full bg-teal-400 shrink-0" />
                            )}
                          </div>
                          <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                            {n.message}
                          </p>
                          <span className="text-[10px] text-slate-500 mt-1 block font-mono">
                            {new Date(n.created_at).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Dark Mode Toggle */}
          <button
            type="button"
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Toggle color theme"
            title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {isDarkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-300" />}
          </button>

          <div className="h-5 w-px bg-slate-800" />

          {/* User Information & Role */}
          {user && (
            <div className="flex items-center space-x-2">
              <div
                onClick={() => onNavigate && onNavigate('My Account')}
                className="flex items-center gap-2 cursor-pointer group"
                title="My Account"
              >
                <div className="w-8 h-8 rounded-full bg-teal-500/20 border border-teal-500/40 text-teal-300 flex items-center justify-center font-bold text-xs shrink-0 group-hover:border-teal-400 transition-colors">
                  {user.fullName.charAt(0)}
                </div>
                <div className="hidden lg:block text-left">
                  <div className="text-xs font-bold text-white group-hover:text-teal-300 transition-colors truncate max-w-[120px]">
                    {user.fullName}
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono">
                    {user.role}
                  </div>
                </div>
              </div>

              {/* Logout Button */}
              <button
                type="button"
                onClick={logout}
                className="p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                aria-label="Sign out"
                title="Sign out of account"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

      </div>
    </header>
  );
};
