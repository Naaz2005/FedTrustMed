import React from 'react';
import {
  Home,
  FileText,
  Share2,
  User,
  Users,
  Activity,
  Key,
  ShieldAlert,
  Shield,
  Database,
  Microscope,
  CheckCircle,
  FolderLock,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export type UserRole = 'PATIENT' | 'DOCTOR' | 'HOSPITAL_ADMIN' | 'SYSTEM_ADMIN';

/**
 * EXACT sidebar items specification per role from Master Prompt
 */
export const ROLE_SIDEBAR_ITEMS: Record<UserRole, readonly string[]> = {
  PATIENT: ['Home', 'My Records', 'Sharing', 'My Account'],
  DOCTOR: ['Home', 'Patients and Records', 'Access Requests', 'My Account'],
  HOSPITAL_ADMIN: ['Home', 'Staff and Patients', 'Hospital Activity', 'My Account'],
  SYSTEM_ADMIN: ['Approvals', 'Users', 'Security', 'Ledger', 'Research', 'My Account'],
} as const;

// Icon mapping for every item
const ITEM_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Home: Home,
  'My Records': FileText,
  Sharing: Share2,
  'My Account': User,
  'Patients and Records': FolderLock,
  'Access Requests': Key,
  'Staff and Patients': Users,
  'Hospital Activity': Activity,
  Approvals: CheckCircle,
  Users: Users,
  Security: Shield,
  Ledger: Database,
  Research: Microscope,
};

interface SidebarProps {
  currentRole: UserRole;
  activeItem: string;
  onNavigate: (item: string) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentRole,
  activeItem,
  onNavigate,
  isCollapsed = false,
}) => {
  const { user } = useAuth();
  const items = ROLE_SIDEBAR_ITEMS[currentRole] || [];

  return (
    <aside
      className={`h-full flex flex-col justify-between border-r transition-all duration-300 select-none ${
        isCollapsed ? 'w-20' : 'w-64'
      } bg-slate-900 border-slate-800 text-slate-200 dark:bg-slate-950 dark:border-slate-800/80`}
    >
      {/* Top Header / Branding */}
      <div>
        <div className="h-16 flex items-center px-4 border-b border-slate-800 gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-teal-500 to-emerald-400 flex items-center justify-center text-slate-950 shrink-0 shadow-md shadow-teal-500/20">
            <ShieldCheck className="w-5 h-5 stroke-[2.5]" />
          </div>
          {!isCollapsed && (
            <div className="overflow-hidden">
              <span className="font-bold text-sm tracking-tight text-white block truncate">
                FedTrustMed
              </span>
              <span className="text-[10px] text-teal-400 font-mono tracking-wider block uppercase">
                {currentRole.replace('_', ' ')}
              </span>
            </div>
          )}
        </div>

        {/* Navigation Items */}
        <nav className="p-3 space-y-1" aria-label="Sidebar Navigation">
          {items.map((item) => {
            const Icon = ITEM_ICONS[item] || FileText;
            const isActive = activeItem === item;

            return (
              <button
                key={item}
                type="button"
                onClick={() => onNavigate(item)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all group cursor-pointer ${
                  isActive
                    ? 'bg-teal-500/15 text-teal-400 border border-teal-500/30 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
                }`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 transition-colors ${
                    isActive ? 'text-teal-400' : 'text-slate-400 group-hover:text-slate-200'
                  }`}
                />
                {!isCollapsed && (
                  <span className="truncate flex-1 text-left">{item}</span>
                )}
                {!isCollapsed && isActive && (
                  <ChevronRight className="w-3.5 h-3.5 text-teal-400/80 shrink-0" />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Profile Status */}
      {!isCollapsed && user && (
        <div className="p-4 border-t border-slate-800/80 bg-slate-900/40">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-teal-400 font-bold text-xs shrink-0">
              {user.fullName.charAt(0)}
            </div>
            <div className="overflow-hidden">
              <p className="text-xs font-semibold text-slate-200 truncate">{user.fullName}</p>
              <p className="text-[10px] text-slate-400 font-mono truncate">{user.email}</p>
            </div>
          </div>
          <div className="mt-2.5 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[10px] text-slate-400">
            {user.role === 'PATIENT' || user.role === 'DOCTOR' ? (
              <>
                <span>Status</span>
                <span className={`font-semibold ${user.isFrozen ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {user.isFrozen ? 'Frozen (contact admin)' : 'Good standing'}
                </span>
              </>
            ) : (
              <>
                <span>Trust Score</span>
                <span className="font-semibold text-emerald-400">{user.trustScore} / 100</span>
              </>
            )}
          </div>
        </div>
      )}
    </aside>
  );
};
