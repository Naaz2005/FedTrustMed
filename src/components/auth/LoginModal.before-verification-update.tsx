import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import { UserRole, Hospital, DataAccessScope } from '../../types';
import {
  ShieldCheck,
  Lock,
  Mail,
  Key,
  CheckCircle2,
  AlertTriangle,
  X,
  UserPlus,
  Sparkles,
  Clock,
  ShieldAlert,
} from 'lucide-react';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { login, register, isAuthenticated } = useAuth();

  const [tab, setTab] = useState<'LOGIN' | 'REGISTER'>('LOGIN');

  // Login form state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginPendingInfo, setLoginPendingInfo] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);

  // Registration form state
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regRole, setRegRole] = useState<UserRole>('DOCTOR');
  const [regHospitalId, setRegHospitalId] = useState('hosp-a');
  const [regDepartment, setRegDepartment] = useState('Cardiology');

  const [regScopes, setRegScopes] = useState<DataAccessScope[]>([
    'READ_RECORDS',
    'WRITE_RECORDS',
  ]);

  const [regSuccessMsg, setRegSuccessMsg] = useState<string | null>(null);
  const [regError, setRegError] = useState<string | null>(null);
  const [regLoading, setRegLoading] = useState(false);

  const [hospitals, setHospitals] = useState<Hospital[]>([]);

  useEffect(() => {
    if (!isOpen) return;

    api
      .getHospitals()
      .then((res) => {
        if (res && res.hospitals) {
          setHospitals(res.hospitals);
        }
      })
      .catch((error) => {
        console.error('Failed to load hospitals:', error);
      });
  }, [isOpen]);

  if (!isOpen && isAuthenticated) {
    return null;
  }

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setLoginError(null);
    setLoginPendingInfo(false);
    setLoginLoading(true);

    const res = await login(loginEmail.trim(), loginPassword);

    setLoginLoading(false);

    if (!res.success) {
      setLoginError(res.error || 'Login failed.');

      if (res.error?.toLowerCase().includes('pending admin approval')) {
        setLoginPendingInfo(true);
      }

      return;
    }

    onClose();
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setRegError(null);
    setRegSuccessMsg(null);
    setRegLoading(true);

    const res = await register({
      fullName: regName.trim(),
      email: regEmail.trim(),
      password: regPassword,
      role: regRole,
      hospitalId: regHospitalId,
      departmentName: regDepartment.trim(),
      requestedPermissions: regScopes,
    });

    setRegLoading(false);

    if (!res.success) {
      setRegError(res.error || 'Registration failed.');
      return;
    }

    setRegSuccessMsg(
      'Registration submitted successfully! Your account is now PENDING ADMIN APPROVAL. A Root System Administrator must verify your identity and assign your final data-access permissions before you can log in.'
    );

    // Reset registration fields
    setRegName('');
    setRegEmail('');
    setRegPassword('');
    setRegScopes(['READ_RECORDS', 'WRITE_RECORDS']);
  };

  const toggleScope = (scope: DataAccessScope) => {
    setRegScopes((currentScopes) => {
      if (currentScopes.includes(scope)) {
        return currentScopes.filter((s) => s !== scope);
      }

      return [...currentScopes, scope];
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden my-8">

        {/* Header Banner */}
        <div className="bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-700 text-white p-6 sm:p-8 relative">

          {isAuthenticated && (
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          )}

          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur-md flex items-center justify-center text-white border border-white/20 shadow-inner">
              <ShieldCheck className="w-7 h-7" />
            </div>

            <div>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
                FedTrustMed Security Portal
              </h2>

              <p className="text-xs sm:text-sm text-blue-100 font-medium">
                Zero-Trust Access Control & Federated Identity Verification
              </p>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2 text-xs bg-white/10 backdrop-blur-sm px-3 py-2 rounded-xl border border-white/15 text-blue-50">
            <ShieldAlert className="w-4 h-4 text-amber-300 shrink-0" />

            <span>
              High-Security Directive: All user logins require prior
              Administrator Approval and explicit Data Access Permission
              assignment.
            </span>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">

          <button
            onClick={() => {
              setTab('LOGIN');
              setLoginError(null);
              setLoginPendingInfo(false);
            }}
            className={`flex-1 py-3.5 px-4 text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-all border-b-2 ${
              tab === 'LOGIN'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-white dark:bg-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Lock className="w-4 h-4" />
            Sign In to Secure Vault
          </button>

          <button
            onClick={() => {
              setTab('REGISTER');
              setRegError(null);
              setRegSuccessMsg(null);
            }}
            className={`flex-1 py-3.5 px-4 text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-all border-b-2 ${
              tab === 'REGISTER'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-white dark:bg-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <UserPlus className="w-4 h-4" />
            Request Access / Register
          </button>
        </div>

        {/* Content */}
        <div className="p-6 sm:p-8">

          {/* ================= LOGIN ================= */}
          {tab === 'LOGIN' ? (
            <div className="space-y-6">

              <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl p-4">
                <div className="flex items-start gap-3">
                  <Lock className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />

                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      Secure Authentication
                    </h3>

                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                      Enter your registered email address and password.
                      Your account must be approved by an administrator
                      before access is granted.
                    </p>
                  </div>
                </div>
              </div>

              {/* Login Error */}
              {loginError && (
                <div
                  className={`p-3.5 rounded-2xl border text-xs leading-relaxed flex items-start gap-2.5 ${
                    loginPendingInfo
                      ? 'bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200'
                      : 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
                  }`}
                >
                  {loginPendingInfo ? (
                    <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                  )}

                  <div>
                    <div className="font-bold mb-0.5">
                      {loginPendingInfo
                        ? 'Access Blocked: Pending Admin Authorization'
                        : 'Login Failed'}
                    </div>

                    <p>{loginError}</p>

                    {loginPendingInfo && (
                      <p className="mt-2 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                        Your account must be reviewed and approved by an
                        administrator before you can access the system.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Login Form */}
              <form onSubmit={handleLoginSubmit} className="space-y-4">

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Email Address
                  </label>

                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />

                    <input
                      type="email"
                      required
                      autoComplete="email"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      placeholder="Enter your registered email"
                      className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500 outline-none text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Password
                  </label>

                  <div className="relative">
                    <Key className="w-4 h-4 text-slate-400 absolute left-3 top-3" />

                    <input
                      type="password"
                      required
                      autoComplete="current-password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500 outline-none text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loginLoading}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold text-xs rounded-xl shadow-lg shadow-blue-500/25 transition-all flex items-center justify-center gap-2"
                >
                  {loginLoading ? (
                    <span className="animate-pulse">
                      Verifying Credentials...
                    </span>
                  ) : (
                    <>
                      <Lock className="w-4 h-4" />
                      Authenticate & Access System
                    </>
                  )}
                </button>
              </form>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => {
                    setTab('REGISTER');
                    setLoginError(null);
                    setLoginPendingInfo(false);
                  }}
                  className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Don't have an approved account? Request Access
                </button>
              </div>
            </div>
          ) : (

            /* ================= REGISTER ================= */
            <div className="space-y-5">

              <div className="bg-blue-50 dark:bg-blue-950/40 p-3.5 rounded-2xl border border-blue-200 dark:border-blue-900/60 text-xs text-blue-900 dark:text-blue-200 flex items-start gap-2.5">
                <Sparkles className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />

                <div>
                  <div className="font-bold">
                    Zero-Trust Registration Process
                  </div>

                  <p className="opacity-90 mt-1">
                    Submitting this form creates a pending request.
                    Administrators review your identity, assign specific
                    data-access rights, and approve your account.
                  </p>
                </div>
              </div>

              {/* Registration Error */}
              {regError && (
                <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-200 rounded-xl text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{regError}</span>
                </div>
              )}

              {/* Registration Success */}
              {regSuccessMsg && (
                <div className="p-4 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 rounded-2xl text-xs leading-relaxed space-y-3">

                  <div className="font-bold flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
                    <CheckCircle2 className="w-5 h-5" />
                    Access Request Submitted Successfully!
                  </div>

                  <p>{regSuccessMsg}</p>

                  <div className="pt-2 border-t border-emerald-200 dark:border-emerald-800/60">
                    <button
                      type="button"
                      onClick={() => {
                        setTab('LOGIN');
                        setRegSuccessMsg(null);
                      }}
                      className="px-3 py-1.5 bg-emerald-700 text-white rounded-lg text-xs font-bold hover:bg-emerald-800 transition-colors"
                    >
                      Return to Login
                    </button>
                  </div>
                </div>
              )}

              {/* Registration Form */}
              <form
                onSubmit={handleRegisterSubmit}
                className="space-y-4"
              >

                {/* Name + Email */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Full Name
                    </label>

                    <input
                      type="text"
                      required
                      value={regName}
                      onChange={(e) => setRegName(e.target.value)}
                      placeholder="Enter your full name"
                      className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500 outline-none text-slate-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Email Address
                    </label>

                    <input
                      type="email"
                      required
                      autoComplete="email"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      placeholder="your@email.com"
                      className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500 outline-none text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                {/* Password + Role */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Password
                    </label>

                    <input
                      type="password"
                      required
                      minLength={6}
                      autoComplete="new-password"
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      placeholder="Create a password"
                      className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500 outline-none text-slate-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Requested Role
                    </label>

                    <select
                      value={regRole}
                      onChange={(e) =>
                        setRegRole(e.target.value as UserRole)
                      }
                      className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500 outline-none text-slate-900 dark:text-white"
                    >
                      <option value="PATIENT">Patient</option>
                      <option value="DOCTOR">Doctor / Physician</option>
                      <option value="HOSPITAL_ADMIN">
                        Hospital Administrator
                      </option>
                    </select>
                  </div>
                </div>

                {/* Hospital + Department */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Primary Hospital Node
                    </label>

                    <select
                      value={regHospitalId}
                      onChange={(e) =>
                        setRegHospitalId(e.target.value)
                      }
                      className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500 outline-none text-slate-900 dark:text-white"
                    >
                      {hospitals.length === 0 ? (
                        <option value="hosp-a">
                          Loading hospital nodes...
                        </option>
                      ) : (
                        hospitals.map((hospital) => (
                          <option
                            key={hospital.id}
                            value={hospital.id}
                          >
                            {hospital.name} ({hospital.code})
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Department / Specialty
                    </label>

                    <input
                      type="text"
                      value={regDepartment}
                      onChange={(e) =>
                        setRegDepartment(e.target.value)
                      }
                      placeholder="e.g. Cardiology / Neurology"
                      className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500 outline-none text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                {/* Requested Permissions */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
                    Requested Data Access Scopes
                    <span className="font-normal text-slate-400 ml-1">
                      (Subject to Admin Approval)
                    </span>
                  </label>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {[
                      {
                        id: 'READ_RECORDS',
                        label: 'Read Medical Records',
                      },
                      {
                        id: 'WRITE_RECORDS',
                        label: 'Create / Write Records',
                      },
                      {
                        id: 'CROSS_HOSPITAL_CONSENT',
                        label: 'Request Consent',
                      },
                      {
                        id: 'FEDERATED_AI',
                        label: 'Federated AI Node',
                      },
                      {
                        id: 'AUDIT_LOGS',
                        label: 'View Audit Logs',
                      },
                    ].map((scope) => {
                      const checked = regScopes.includes(
                        scope.id as DataAccessScope
                      );

                      return (
                        <button
                          type="button"
                          key={scope.id}
                          onClick={() =>
                            toggleScope(
                              scope.id as DataAccessScope
                            )
                          }
                          className={`p-2 rounded-xl text-[11px] font-semibold border text-left flex items-center justify-between transition-all ${
                            checked
                              ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-300 dark:border-blue-700 text-blue-800 dark:text-blue-200'
                              : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-500'
                          }`}
                        >
                          <span>{scope.label}</span>

                          <CheckCircle2
                            className={`w-3.5 h-3.5 ${
                              checked
                                ? 'text-blue-600 dark:text-blue-400'
                                : 'opacity-0'
                            }`}
                          />
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  disabled={regLoading}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold text-xs rounded-xl shadow-lg shadow-indigo-500/25 transition-all flex items-center justify-center gap-2"
                >
                  {regLoading ? (
                    <span className="animate-pulse">
                      Submitting Access Request...
                    </span>
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4" />
                      Submit Access Request to Admin
                    </>
                  )}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};