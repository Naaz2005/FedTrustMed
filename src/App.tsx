import React, { useState, useEffect, useMemo } from 'react';
import {
  ShieldAlert,
  ArrowRight,
  Sparkles,
  Lock,
  Activity,
  Layers,
  FileText,
  Users,
  CheckCircle,
  Database,
  Key,
  ShieldCheck,
  Search,
  ExternalLink,
  ChevronRight,
  UserCheck,
  Building,
  HeartPulse,
  Microscope,
} from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginModal } from './components/auth/LoginModal';
import { Sidebar, ROLE_SIDEBAR_ITEMS, UserRole } from './components/Sidebar';
import { Navbar } from './components/Navbar';
import { UserApprovalManager } from './components/admin/UserApprovalManager';

// Role-specific view components
import { PatientHome, PatientRecords, PatientSharing } from './components/views/PatientViews';
import { DoctorHome, DoctorPatientsAndRecords, DoctorAccessRequests } from './components/views/DoctorViews';
import { HospitalAdminHome, HospitalStaffAndPatients, HospitalActivity } from './components/views/HospitalAdminViews';
import { AdminUsers, AdminSecurity, AdminLedger, AdminResearch } from './components/views/SystemAdminViews';
import { AccountView } from './components/views/AccountView';

// Subtitles and metadata for screens
const SCREEN_DESCRIPTIONS: Record<string, { subtitle: string; icon: React.ComponentType<{ className?: string }> }> = {
  Home: {
    subtitle: 'System Overview & Federated Node Status',
    icon: Activity,
  },
  'My Records': {
    subtitle: 'AES-256-GCM Encrypted Personal Medical History',
    icon: FileText,
  },
  Sharing: {
    subtitle: 'Granular Dynamic Consent Management',
    icon: Layers,
  },
  'Patients and Records': {
    subtitle: 'Assigned Patient Directory & Medical Encounters',
    icon: Users,
  },
  'Access Requests': {
    subtitle: 'Cross-Hospital Medical Record Requests & Break-Glass',
    icon: Key,
  },
  'Staff and Patients': {
    subtitle: 'Hospital Personnel & Patient Registry',
    icon: Users,
  },
  'Hospital Activity': {
    subtitle: 'Node Audit Trail & Compliance Telemetry',
    icon: Activity,
  },
  Approvals: {
    subtitle: 'System Administrator Credential Approvals (Module M10)',
    icon: CheckCircle,
  },
  Users: {
    subtitle: 'Global FedTrustMed Identity Registry & Governance',
    icon: Users,
  },
  Security: {
    subtitle: 'Cryptographic Key Vault & Access Policies',
    icon: Lock,
  },
  Ledger: {
    subtitle: 'Immutable Cryptographic Audit Trail & Blockchain Ledger',
    icon: Database,
  },
  Research: {
    subtitle: 'Federated Model Training & Differential Privacy',
    icon: Sparkles,
  },
  'My Account': {
    subtitle: 'Account Credentials, Trust Score & ECC Keys',
    icon: Key,
  },
};

const AppShell: React.FC = () => {
  const { user, isAuthenticated, simulationMode, simulationIdentities, openLoginModal, login } = useAuth();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [quickLaunchLoading, setQuickLaunchLoading] = useState<string | null>(null);

  // Compute allowed items for current user's role
  const userRole = (user?.role || 'PATIENT') as UserRole;
  const allowedPages = useMemo(() => ROLE_SIDEBAR_ITEMS[userRole] || [], [userRole]);
  const defaultPage = allowedPages[0] || 'Home';

  // Read active page from URL hash
  const [requestedPage, setRequestedPage] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash.replace(/^#\/?/, '').trim();
      const decoded = decodeURIComponent(hash);
      if (decoded) return decoded;
    }
    return defaultPage;
  });

  // Listen to browser hash changes
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace(/^#\/?/, '').trim();
      const decoded = decodeURIComponent(hash);
      if (decoded) {
        setRequestedPage(decoded);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Update hash when requested page changes
  const handleNavigate = (page: string) => {
    setRequestedPage(page);
    window.location.hash = encodeURIComponent(page);
  };

  // Quick 1-click login helper for presenting live demo to guide
  const handleQuickLaunch = async (email: string, roleName: string) => {
    setQuickLaunchLoading(roleName);
    try {
      await login({ email, password: 'Password123!' });
    } catch (err) {
      console.error('Quick launch failed:', err);
      openLoginModal('login');
    } finally {
      setQuickLaunchLoading(null);
    }
  };

  // ROLE AND URL GUARD:
  // A user must be unable to open another role's page by changing state or the URL
  const isPageAuthorized = allowedPages.includes(requestedPage);
  const activePage = isPageAuthorized ? requestedPage : defaultPage;

  // Unauthenticated Landing Page
  if (!isAuthenticated || !user) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-teal-500 selection:text-white">
        <Navbar onToggleSidebar={undefined} />

        <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-8">
          {/* Hero Section */}
          <div className="relative rounded-3xl bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 border border-slate-800 p-8 sm:p-12 overflow-hidden shadow-2xl">
            <div className="absolute top-0 right-0 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-0 left-1/3 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
            
            <div className="relative z-10 max-w-3xl space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-500/10 border border-teal-500/30 text-teal-300 text-xs font-semibold">
                <ShieldCheck className="w-4 h-4 text-teal-400" />
                FedTrustMed Federated Research Network • Production Ready
              </div>
              <h1 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight leading-tight">
                Privacy-Preserving Federated Healthcare Platform
              </h1>
              <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-2xl">
                Collaborative machine learning for clinical research across distributed hospital nodes without pooling sensitive patient datasets. Enforced by AES-256-GCM zero-knowledge vaults and ECC P-256 cryptographic identity.
              </p>

              <div className="pt-2 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => openLoginModal('register')}
                  className="px-5 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-sm transition-all shadow-lg shadow-teal-500/20 flex items-center gap-2 cursor-pointer"
                >
                  <span>Register Stakeholder Account</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => openLoginModal('login')}
                  className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-semibold text-sm transition-all cursor-pointer"
                >
                  Sign In with Credentials
                </button>
              </div>
            </div>
          </div>

          {/* Guide Presentation & Live Stakeholder Portals (1-Click Launch) */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-teal-400" />
                  Guide Presentation: Instant 1-Click Role Exploration
                </h2>
                <p className="text-xs text-slate-400">
                  Select any stakeholder below to immediately launch their complete authenticated workspace.
                </p>
              </div>
              <span className="text-xs font-mono px-3 py-1 rounded-lg bg-teal-500/10 text-teal-300 border border-teal-500/30 shrink-0">
                4 Stakeholders Seeded & Verified
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              
              {/* Doctor Card */}
              <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-teal-500/50 transition-all flex flex-col justify-between space-y-4 group">
                <div className="space-y-2">
                  <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/30 text-teal-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                    <HeartPulse className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[10px] font-mono font-bold text-teal-400 uppercase tracking-wider">
                      DOCTOR PORTAL
                    </span>
                    <h3 className="font-bold text-white text-base">Dr. Priya Patel</h3>
                    <p className="text-xs text-slate-400">Cardiology Specialist • St. Jude General</p>
                  </div>
                  <ul className="text-[11px] text-slate-400 space-y-1 pt-1">
                    <li className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-teal-400" />
                      Assigned patient directory & ECG vitals
                    </li>
                    <li className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-teal-400" />
                      Emergency break-glass protocol
                    </li>
                  </ul>
                </div>

                <button
                  type="button"
                  disabled={Boolean(quickLaunchLoading)}
                  onClick={() => handleQuickLaunch('doctor@fedtrustmed.demo', 'Doctor')}
                  className="w-full py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-md shadow-teal-500/10 cursor-pointer disabled:opacity-50"
                >
                  <span>{quickLaunchLoading === 'Doctor' ? 'Launching...' : 'Launch Doctor Portal'}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Patient Card */}
              <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-indigo-500/50 transition-all flex flex-col justify-between space-y-4 group">
                <div className="space-y-2">
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                    <UserCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[10px] font-mono font-bold text-indigo-400 uppercase tracking-wider">
                      PATIENT PORTAL
                    </span>
                    <h3 className="font-bold text-white text-base">Aarav Sharma</h3>
                    <p className="text-xs text-slate-400">Inpatient • Trust Score 100/100</p>
                  </div>
                  <ul className="text-[11px] text-slate-400 space-y-1 pt-1">
                    <li className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                      Encrypted diagnostic records & lab tests
                    </li>
                    <li className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                      Granular dynamic consent directives
                    </li>
                  </ul>
                </div>

                <button
                  type="button"
                  disabled={Boolean(quickLaunchLoading)}
                  onClick={() => handleQuickLaunch('patient@fedtrustmed.demo', 'Patient')}
                  className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-md shadow-indigo-600/10 cursor-pointer disabled:opacity-50"
                >
                  <span>{quickLaunchLoading === 'Patient' ? 'Launching...' : 'Launch Patient Portal'}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Hospital Admin Card */}
              <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-emerald-500/50 transition-all flex flex-col justify-between space-y-4 group">
                <div className="space-y-2">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                    <Building className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[10px] font-mono font-bold text-emerald-400 uppercase tracking-wider">
                      HOSPITAL ADMIN
                    </span>
                    <h3 className="font-bold text-white text-base">Rajesh Verma</h3>
                    <p className="text-xs text-slate-400">Node Operator • St. Jude General</p>
                  </div>
                  <ul className="text-[11px] text-slate-400 space-y-1 pt-1">
                    <li className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      Node peer telemetry & health checks
                    </li>
                    <li className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      Hospital practitioners & department staff
                    </li>
                  </ul>
                </div>

                <button
                  type="button"
                  disabled={Boolean(quickLaunchLoading)}
                  onClick={() => handleQuickLaunch('hospital_admin@fedtrustmed.demo', 'Hospital Admin')}
                  className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-md shadow-emerald-600/10 cursor-pointer disabled:opacity-50"
                >
                  <span>{quickLaunchLoading === 'Hospital Admin' ? 'Launching...' : 'Launch Hospital Admin'}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* System Admin Card */}
              <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-amber-500/50 transition-all flex flex-col justify-between space-y-4 group">
                <div className="space-y-2">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[10px] font-mono font-bold text-amber-400 uppercase tracking-wider">
                      SYSTEM ADMIN
                    </span>
                    <h3 className="font-bold text-white text-base">Vikram Malhotra</h3>
                    <p className="text-xs text-slate-400">Root Governance & Cryptographic Vault</p>
                  </div>
                  <ul className="text-[11px] text-slate-400 space-y-1 pt-1">
                    <li className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                      M10 Credential approvals & licence audits
                    </li>
                    <li className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                      Key vault, ledger & federated research
                    </li>
                  </ul>
                </div>

                <button
                  type="button"
                  disabled={Boolean(quickLaunchLoading)}
                  onClick={() => handleQuickLaunch('system_admin@fedtrustmed.demo', 'System Admin')}
                  className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-md shadow-amber-500/10 cursor-pointer disabled:opacity-50"
                >
                  <span>{quickLaunchLoading === 'System Admin' ? 'Launching...' : 'Launch System Admin'}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

            </div>
          </div>
        </main>

        <LoginModal />
      </div>
    );
  }

  // Authenticated App Shell with Sidebar, Navbar, and Screen Routing
  const screenInfo = SCREEN_DESCRIPTIONS[activePage] || {
    subtitle: 'Federated Healthcare Module',
    icon: Activity,
  };
  const ScreenIcon = screenInfo.icon;

  // Render role-specific and screen-specific views
  const renderWorkspaceContent = () => {
    // 1. My Account (common to all roles)
    if (activePage === 'My Account') {
      return <AccountView />;
    }

    // 2. PATIENT Pages
    if (userRole === 'PATIENT') {
      if (activePage === 'Home') return <PatientHome onNavigate={handleNavigate} />;
      if (activePage === 'My Records') return <PatientRecords />;
      if (activePage === 'Sharing') return <PatientSharing />;
    }

    // 3. DOCTOR Pages
    if (userRole === 'DOCTOR') {
      if (activePage === 'Home') return <DoctorHome onNavigate={handleNavigate} />;
      if (activePage === 'Patients and Records') return <DoctorPatientsAndRecords />;
      if (activePage === 'Access Requests') return <DoctorAccessRequests />;
    }

    // 4. HOSPITAL_ADMIN Pages
    if (userRole === 'HOSPITAL_ADMIN') {
      if (activePage === 'Home') return <HospitalAdminHome onNavigate={handleNavigate} />;
      if (activePage === 'Staff and Patients') return <HospitalStaffAndPatients />;
      if (activePage === 'Hospital Activity') return <HospitalActivity />;
    }

    // 5. SYSTEM_ADMIN Pages
    if (userRole === 'SYSTEM_ADMIN') {
      if (activePage === 'Approvals') return <UserApprovalManager />;
      if (activePage === 'Users') return <AdminUsers />;
      if (activePage === 'Security') return <AdminSecurity />;
      if (activePage === 'Ledger') return <AdminLedger />;
      if (activePage === 'Research') return <AdminResearch />;
    }

    // Default Fallback
    return <PatientHome onNavigate={handleNavigate} />;
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-teal-500 selection:text-white">
      {/* Top Navigation Bar with Notifications, Theme Toggle, Profile & Frozen Banner */}
      <Navbar
        onToggleSidebar={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        onNavigate={handleNavigate}
      />

      <div className="flex-1 flex overflow-hidden">
        {/* Role-Based Sidebar */}
        <Sidebar
          currentRole={userRole}
          activeItem={activePage}
          onNavigate={handleNavigate}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        />

        {/* Main Content Viewport */}
        <main className="flex-1 p-6 sm:p-8 overflow-y-auto bg-slate-900/40">
          <div className="max-w-6xl mx-auto space-y-6">
            
            {/* ROLE MISMATCH / UNAUTHORIZED URL ALERT */}
            {!isPageAuthorized && (
              <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 flex items-start gap-3">
                <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <span className="font-bold block">Access Restricted</span>
                  You attempted to access a page (<code className="font-mono">{requestedPage}</code>) not permitted for role <code className="font-mono">{userRole}</code>. Redirected to authorized view.
                </div>
              </div>
            )}

            {/* SCREEN HEADER */}
            <div className="border-b border-slate-800 pb-5 flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-xs font-mono text-teal-400 mb-1">
                  <span>{userRole}</span>
                  <span>/</span>
                  <span className="text-slate-400">{activePage}</span>
                </div>
                {/* EXACT TITLE HEADING REQUIRED BY SPEC */}
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2.5">
                  <ScreenIcon className="w-7 h-7 text-teal-400" />
                  {activePage}
                </h1>
                <p className="text-xs sm:text-sm text-slate-400 mt-1">
                  {screenInfo.subtitle}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-mono px-3 py-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-300">
                  Status: {user.approvalStatus}
                </span>
              </div>
            </div>

            {/* WORKSPACE CONTENT ROUTER */}
            {renderWorkspaceContent()}

          </div>
        </main>
      </div>

      <LoginModal />
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}
