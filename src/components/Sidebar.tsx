import React from 'react';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard,
  FileKey2,
  FileCheck2,
  Blocks,
  ShieldAlert,
  BrainCircuit,
  Building2,
  FileText,
  Lock,
  ChevronRight,
  TrendingUp,
} from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
}) => {
  const { user, role } = useAuth();

  /*
   * Modules available to each authenticated role.
   *
   * IMPORTANT:
   * The role comes from the authenticated user account.
   * There is no role/persona switching here.
   */
  const roleModules: Record<string, string[]> = {
    PATIENT: [
      'dashboard',
      'records',
      'consent',
      'trust',
    ],

    DOCTOR: [
      'dashboard',
      'records',
      'consent',
      'blockchain',
      'trust',
      'federated',
    ],

    HOSPITAL_ADMIN: [
      'dashboard',
      'records',
      'consent',
      'blockchain',
      'trust',
      'threats',
      'admin',
    ],

    SYSTEM_ADMIN: [
      'dashboard',
      'records',
      'consent',
      'blockchain',
      'trust',
      'threats',
      'federated',
      'admin',
      'docs',
    ],
  };

  const navItems = [
    {
      id: 'dashboard',
      label: 'Role Dashboard',
      icon: LayoutDashboard,
      badge: role,
    },
    {
      id: 'records',
      label: 'Medical Records',
      icon: FileKey2,
      desc: 'AES-256 + ECC Vault',
    },
    {
      id: 'consent',
      label: 'Consent Manager',
      icon: FileCheck2,
      desc: 'Patient Controlled',
    },
    {
      id: 'blockchain',
      label: 'Hyperledger Fabric',
      icon: Blocks,
      desc: 'Block Explorer',
    },
    {
      id: 'trust',
      label: 'Dynamic Trust Engine',
      icon: TrendingUp,
      desc: `Score: ${user?.trustScore ?? 0}`,
    },
    {
      id: 'threats',
      label: 'AI Threat Detector',
      icon: ShieldAlert,
      desc: 'Cyber Attack Simulator',
    },
    {
      id: 'federated',
      label: 'Federated Learning',
      icon: BrainCircuit,
      desc: 'FedAvg Privacy AI',
    },
    {
      id: 'admin',
      label: 'System & Hospitals',
      icon: Building2,
      desc: 'Admin Management',
    },
    {
      id: 'docs',
      label: 'Architecture & Docs',
      icon: FileText,
      desc: 'ER Diagram & Specs',
    },
  ];

  /*
   * Only show modules assigned to the authenticated user's role.
   */
  const allowedModules = roleModules[role] ?? ['dashboard'];

  const visibleNavItems = navItems.filter((item) =>
    allowedModules.includes(item.id)
  );

  return (
    <aside className="w-full md:w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 p-4 flex flex-col justify-between shrink-0 transition-colors">
      <div className="space-y-6">

        {/* User Card */}
        <div className="p-3.5 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-slate-800/80 dark:to-slate-800/40 border border-blue-100 dark:border-slate-700">
          <div className="flex items-center gap-3">

            <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm shadow-sm">
              {user?.fullName?.charAt(0) ?? '?'}
            </div>

            <div className="overflow-hidden">
              <h4 className="font-semibold text-sm text-slate-900 dark:text-white truncate">
                {user?.fullName ?? 'User'}
              </h4>

              <p className="text-xs text-blue-600 dark:text-blue-400 font-medium truncate">
                {user?.hospitalName ?? role}
              </p>
            </div>
          </div>

          {user?.isFrozen && (
            <div className="mt-2 text-[11px] font-semibold text-rose-600 dark:text-rose-400 bg-rose-100 dark:bg-rose-950/60 p-1.5 rounded-lg flex items-center gap-1">
              <Lock className="w-3.5 h-3.5" />
              Account Frozen (Trust Score &lt; 40)
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="space-y-1">

          <p className="px-3 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">
            Main Framework Modules
          </p>

          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left transition-all group ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20 font-semibold'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center gap-3 overflow-hidden">

                  <Icon
                    className={`w-5 h-5 shrink-0 ${
                      isActive
                        ? 'text-white'
                        : 'text-slate-500 dark:text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400'
                    }`}
                  />

                  <div className="truncate">

                    <div className="text-xs font-semibold">
                      {item.label}
                    </div>

                    {item.desc && (
                      <div
                        className={`text-[10px] truncate ${
                          isActive
                            ? 'text-blue-100'
                            : 'text-slate-400 dark:text-slate-500'
                        }`}
                      >
                        {item.desc}
                      </div>
                    )}

                  </div>
                </div>

                <ChevronRight
                  className={`w-4 h-4 shrink-0 transition-transform ${
                    isActive
                      ? 'text-white translate-x-0.5'
                      : 'text-slate-400 opacity-0 group-hover:opacity-100'
                  }`}
                />
              </button>
            );
          })}
        </nav>
      </div>

      {/* Network Health Footer */}
      <div className="mt-8 pt-4 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 space-y-1.5">

        <div className="flex items-center justify-between">
          <span>Hyperledger Fabric</span>
          <span className="font-semibold text-emerald-600 dark:text-emerald-400">
            HEALTHY
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span>AES-256 + ECC Vault</span>
          <span className="font-semibold text-blue-600 dark:text-blue-400">
            ACTIVE
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span>FedAvg AI Nodes</span>
          <span className="font-semibold text-indigo-600 dark:text-indigo-400">
            3 SYNCD
          </span>
        </div>

      </div>
    </aside>
  );
};