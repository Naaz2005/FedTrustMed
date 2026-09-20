import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { UserRole, Hospital } from '../../types';
import { api } from '../../services/api';

import {
  ShieldCheck,
  Lock,
  UserCheck,
  Building2,
  Stethoscope,
  ShieldAlert,
  FileCheck2,
  Sparkles,
  CheckCircle2,
  Mail,
  Key,
  UserPlus,
  Clock,
  Activity,
} from 'lucide-react';

export const LandingPage: React.FC<{
  onAuthenticated?: () => void;
}> = () => {
  const { login, register } = useAuth();

  const [mode, setMode] = useState<'LOGIN' | 'REGISTER'>('LOGIN');

  // Login
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);

  // Registration
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regRole, setRegRole] = useState<UserRole>('DOCTOR');
  const [regHospitalId, setRegHospitalId] = useState('hosp-a');
  const [regDepartment, setRegDepartment] = useState('Cardiology');

  const [regSuccess, setRegSuccess] = useState<string | null>(null);
  const [regError, setRegError] = useState<string | null>(null);
  const [regLoading, setRegLoading] = useState(false);

  const [hospitals, setHospitals] = useState<Hospital[]>([]);

  /*
   * Load hospitals for registration.
   */
  useEffect(() => {
    api.getHospitals().then((res) => {
      if (res && res.hospitals) {
        setHospitals(res.hospitals);
      }
    });
  }, []);

  /*
   * LOGIN
   */
  const handleLoginSubmit = async (
    e: React.FormEvent
  ) => {
    e.preventDefault();

    setLoginError(null);
    setLoginLoading(true);

    const result = await login(email, password);

    setLoginLoading(false);

    if (!result.success) {
      setLoginError(
        result.error || 'Authentication failed.'
      );
    }
  };

  /*
   * REGISTRATION
   *
   * The account will NOT be logged in automatically.
   */
  const handleRegisterSubmit = async (
    e: React.FormEvent
  ) => {
    e.preventDefault();

    setRegError(null);
    setRegSuccess(null);
    setRegLoading(true);

    const result = await register({
      fullName: regName,
      email: regEmail,
      password: regPassword,
      role: regRole,
      hospitalId: regHospitalId,
      departmentName: regDepartment,

      /*
       * These are REQUESTED permissions only.
       *
       * The administrator decides what permissions
       * are actually granted.
       */
      requestedPermissions: ['READ_RECORDS'],
    });

    setRegLoading(false);

    if (!result.success) {
      setRegError(
        result.error || 'Registration failed.'
      );
      return;
    }

    setRegSuccess(
      'Registration request submitted successfully. Your account is now PENDING ADMIN APPROVAL. You cannot sign in until an administrator approves your account.'
    );

    setRegName('');
    setRegEmail('');
    setRegPassword('');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col">
      {/* =======================================================
          HEADER
      ======================================================== */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <ShieldCheck className="w-6 h-6" />
            </div>

            <div>
              <div className="font-extrabold text-xl text-white">
                FedTrustMed
              </div>

              <div className="text-xs text-blue-400 font-semibold">
                Federated Blockchain & Dynamic Trust Framework
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setMode('LOGIN');
                setLoginError(null);
                setRegError(null);
                setRegSuccess(null);
              }}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition ${
                mode === 'LOGIN'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Lock className="inline w-4 h-4 mr-1" />
              Sign In
            </button>

            <button
              onClick={() => {
                setMode('REGISTER');
                setLoginError(null);
                setRegError(null);
                setRegSuccess(null);
              }}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition ${
                mode === 'REGISTER'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <UserPlus className="inline w-4 h-4 mr-1" />
              Register
            </button>
          </div>
        </div>
      </header>

      {/* =======================================================
          HERO
      ======================================================== */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-8 w-full">
        <div className="text-center max-w-4xl mx-auto">
          
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-950/70 border border-blue-800 text-blue-300 text-xs font-semibold">
            <Sparkles className="w-4 h-4" />
            Zero-Trust Healthcare Security Platform
          </div>

          <h1 className="mt-5 text-4xl sm:text-6xl font-black text-white tracking-tight">
            Secure Healthcare Data.
            <span className="text-blue-500">
              {' '}Patient Controlled.
            </span>
          </h1>

          <p className="mt-5 text-slate-400 text-sm sm:text-base leading-relaxed max-w-3xl mx-auto">
            FedTrustMed protects medical information using
            encrypted records, patient-controlled consent,
            federated learning, dynamic trust management and
            Hyperledger Fabric-based access control.
          </p>
        </div>
      </section>

      {/* =======================================================
          MAIN CONTENT
      ======================================================== */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12 w-full flex-1">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

          {/* ===================================================
              LEFT INFORMATION PANEL
          ==================================================== */}
          <div className="lg:col-span-7 space-y-5">

            {/* Security Workflow */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl">
              
              <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
                <div className="p-3 rounded-xl bg-teal-500/10 text-teal-400">
                  <FileCheck2 className="w-6 h-6" />
                </div>

                <div>
                  <h2 className="font-bold text-lg text-white">
                    Secure Access Workflow
                  </h2>

                  <p className="text-xs text-teal-400">
                    Zero-Trust Identity & Authorization
                  </p>
                </div>
              </div>

              <div className="mt-5 space-y-3">

                <div className="flex gap-3 p-4 bg-slate-950 rounded-2xl border border-slate-800">
                  <div className="w-7 h-7 rounded-full bg-blue-900 text-blue-300 flex items-center justify-center font-bold shrink-0">
                    1
                  </div>

                  <div>
                    <div className="font-bold text-white">
                      Create an Account
                    </div>

                    <p className="text-xs text-slate-400 mt-1">
                      New patients, doctors and authorized
                      hospital staff can submit an access request.
                    </p>
                  </div>
                </div>

                <div className="flex gap-3 p-4 bg-slate-950 rounded-2xl border border-slate-800">
                  <div className="w-7 h-7 rounded-full bg-amber-900 text-amber-300 flex items-center justify-center font-bold shrink-0">
                    2
                  </div>

                  <div>
                    <div className="font-bold text-white">
                      Administrator Review
                    </div>

                    <p className="text-xs text-slate-400 mt-1">
                      Every new account remains pending until an
                      authorized System Administrator reviews and
                      approves it.
                    </p>
                  </div>
                </div>

                <div className="flex gap-3 p-4 bg-slate-950 rounded-2xl border border-slate-800">
                  <div className="w-7 h-7 rounded-full bg-emerald-900 text-emerald-300 flex items-center justify-center font-bold shrink-0">
                    3
                  </div>

                  <div>
                    <div className="font-bold text-white">
                      Role & Permissions Granted
                    </div>

                    <p className="text-xs text-slate-400 mt-1">
                      The administrator assigns appropriate data
                      access permissions before the user can access
                      protected resources.
                    </p>
                  </div>
                </div>

                <div className="flex gap-3 p-4 bg-slate-950 rounded-2xl border border-slate-800">
                  <div className="w-7 h-7 rounded-full bg-purple-900 text-purple-300 flex items-center justify-center font-bold shrink-0">
                    4
                  </div>

                  <div>
                    <div className="font-bold text-white">
                      Protected Role Dashboard
                    </div>

                    <p className="text-xs text-slate-400 mt-1">
                      After authentication, each user sees only
                      the dashboard and data authorized for their
                      role and permissions.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Roles */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                <UserCheck className="w-6 h-6 text-blue-400 mb-3" />

                <h3 className="font-bold text-white">
                  Patient
                </h3>

                <p className="text-xs text-slate-400 mt-2">
                  Controls personal medical records and grants
                  or revokes authorized healthcare access.
                </p>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                <Stethoscope className="w-6 h-6 text-teal-400 mb-3" />

                <h3 className="font-bold text-white">
                  Doctor
                </h3>

                <p className="text-xs text-slate-400 mt-2">
                  Creates clinical records and requests access
                  to patient information through consent.
                </p>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                <Building2 className="w-6 h-6 text-indigo-400 mb-3" />

                <h3 className="font-bold text-white">
                  Hospital Admin
                </h3>

                <p className="text-xs text-slate-400 mt-2">
                  Manages hospital-level users, permissions and
                  organizational access.
                </p>
              </div>

              <div className="bg-slate-900 border border-purple-900/50 rounded-2xl p-5">
                <ShieldCheck className="w-6 h-6 text-purple-400 mb-3" />

                <h3 className="font-bold text-white">
                  System Administrator
                </h3>

                <p className="text-xs text-slate-400 mt-2">
                  Protected administrative account responsible
                  for system-wide approvals, security and governance.
                </p>
              </div>

            </div>

            {/* Security Notice */}
            <div className="bg-blue-950/30 border border-blue-900/60 rounded-2xl p-5">
              <div className="flex gap-3">
                <Activity className="w-5 h-5 text-blue-400 shrink-0" />

                <div>
                  <h3 className="font-bold text-blue-300">
                    Zero-Trust Access
                  </h3>

                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Authentication alone does not grant access.
                    The system validates account approval, role,
                    permissions, consent and trust status before
                    protected healthcare information is accessed.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* ===================================================
              RIGHT AUTH PANEL
          ==================================================== */}
          <div className="lg:col-span-5">

            <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden">

              {/* Auth Header */}
              <div className="bg-gradient-to-r from-blue-700 to-indigo-700 p-6 text-white">

                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center">
                    <ShieldCheck className="w-7 h-7" />
                  </div>

                  <div>
                    <h2 className="text-xl font-bold">
                      FedTrustMed Security Portal
                    </h2>

                    <p className="text-xs text-blue-100 mt-1">
                      Secure Identity Authentication
                    </p>
                  </div>
                </div>

                <div className="mt-5 flex items-start gap-2 bg-black/20 rounded-xl p-3 text-xs">
                  <ShieldAlert className="w-4 h-4 text-amber-300 shrink-0" />

                  <span>
                    Only approved accounts can access the
                    protected healthcare system.
                  </span>
                </div>
              </div>

              {/* Tabs */}
              <div className="grid grid-cols-2 border-b border-slate-800">

                <button
                  onClick={() => {
                    setMode('LOGIN');
                    setLoginError(null);
                    setRegError(null);
                    setRegSuccess(null);
                  }}
                  className={`py-4 text-sm font-bold ${
                    mode === 'LOGIN'
                      ? 'text-blue-400 border-b-2 border-blue-500 bg-slate-800/50'
                      : 'text-slate-500'
                  }`}
                >
                  <Lock className="inline w-4 h-4 mr-2" />
                  Sign In
                </button>

                <button
                  onClick={() => {
                    setMode('REGISTER');
                    setLoginError(null);
                    setRegError(null);
                    setRegSuccess(null);
                  }}
                  className={`py-4 text-sm font-bold ${
                    mode === 'REGISTER'
                      ? 'text-indigo-400 border-b-2 border-indigo-500 bg-slate-800/50'
                      : 'text-slate-500'
                  }`}
                >
                  <UserPlus className="inline w-4 h-4 mr-2" />
                  Register
                </button>

              </div>

              <div className="p-6">

                {/* =================================================
                    LOGIN
                ================================================== */}
                {mode === 'LOGIN' && (
                  <form
                    onSubmit={handleLoginSubmit}
                    className="space-y-5"
                  >

                    <div>
                      <h3 className="text-lg font-bold text-white">
                        Sign In to FedTrustMed
                      </h3>

                      <p className="text-xs text-slate-400 mt-1">
                        Authenticate using your approved account.
                      </p>
                    </div>

                    {loginError && (
                      <div className="p-4 rounded-2xl bg-rose-950/50 border border-rose-800 text-rose-200 text-xs">
                        <div className="flex gap-2">
                          <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0" />

                          <div>
                            <div className="font-bold">
                              Access Denied
                            </div>

                            <p className="mt-1">
                              {loginError}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-2">
                        Email Address
                      </label>

                      <div className="relative">
                        <Mail className="absolute left-3 top-3 w-4 h-4 text-slate-500" />

                        <input
                          type="email"
                          required
                          value={email}
                          onChange={(e) =>
                            setEmail(e.target.value)
                          }
                          placeholder="your@email.com"
                          className="w-full pl-10 pr-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-2">
                        Password
                      </label>

                      <div className="relative">
                        <Key className="absolute left-3 top-3 w-4 h-4 text-slate-500" />

                        <input
                          type="password"
                          required
                          value={password}
                          onChange={(e) =>
                            setPassword(e.target.value)
                          }
                          placeholder="Enter your password"
                          className="w-full pl-10 pr-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={loginLoading}
                      className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold rounded-xl shadow-lg shadow-blue-600/20"
                    >
                      {loginLoading
                        ? 'Authenticating...'
                        : 'Authenticate & Sign In'}
                    </button>

                    <div className="pt-4 border-t border-slate-800 text-center">
                      <p className="text-xs text-slate-500">
                        Don't have an approved account?
                      </p>

                      <button
                        type="button"
                        onClick={() => {
                          setMode('REGISTER');
                          setLoginError(null);
                        }}
                        className="mt-2 text-xs font-bold text-blue-400 hover:text-blue-300"
                      >
                        Request Access / Register
                      </button>
                    </div>
                  </form>
                )}

                {/* =================================================
                    REGISTER
                ================================================== */}
                {mode === 'REGISTER' && (
                  <form
                    onSubmit={handleRegisterSubmit}
                    className="space-y-4"
                  >

                    <div>
                      <h3 className="text-lg font-bold text-white">
                        Request System Access
                      </h3>

                      <p className="text-xs text-slate-400 mt-1">
                        Your registration will be reviewed by an
                        authorized administrator.
                      </p>
                    </div>

                    {/* Registration Success */}
                    {regSuccess && (
                      <div className="p-4 rounded-2xl bg-emerald-950/50 border border-emerald-800 text-emerald-200 text-xs">
                        <div className="flex gap-2">
                          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />

                          <div>
                            <div className="font-bold">
                              Request Submitted
                            </div>

                            <p className="mt-1">
                              {regSuccess}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Registration Error */}
                    {regError && (
                      <div className="p-4 rounded-2xl bg-rose-950/50 border border-rose-800 text-rose-200 text-xs">
                        <div className="flex gap-2">
                          <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0" />

                          <div>
                            <div className="font-bold">
                              Registration Failed
                            </div>

                            <p className="mt-1">
                              {regError}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Name */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-2">
                        Full Name
                      </label>

                      <input
                        type="text"
                        required
                        value={regName}
                        onChange={(e) =>
                          setRegName(e.target.value)
                        }
                        placeholder="Full name"
                        className="w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white outline-none focus:border-indigo-500"
                      />
                    </div>

                    {/* Email */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-2">
                        Email Address
                      </label>

                      <input
                        type="email"
                        required
                        value={regEmail}
                        onChange={(e) =>
                          setRegEmail(e.target.value)
                        }
                        placeholder="your@email.com"
                        className="w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white outline-none focus:border-indigo-500"
                      />
                    </div>

                    {/* Password */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-2">
                        Password
                      </label>

                      <input
                        type="password"
                        required
                        value={regPassword}
                        onChange={(e) =>
                          setRegPassword(e.target.value)
                        }
                        placeholder="Create password"
                        className="w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white outline-none focus:border-indigo-500"
                      />
                    </div>

                    {/* Role */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-2">
                        Requested Role
                      </label>

                      <select
                        value={regRole}
                        onChange={(e) =>
                          setRegRole(
                            e.target.value as UserRole
                          )
                        }
                        className="w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white outline-none focus:border-indigo-500"
                      >
                        <option value="PATIENT">
                          Patient
                        </option>

                        <option value="DOCTOR">
                          Doctor / Physician
                        </option>

                        <option value="HOSPITAL_ADMIN">
                          Hospital Administrator
                        </option>
                      </select>
                    </div>

                    {/* Hospital */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-2">
                        Primary Hospital
                      </label>

                      <select
                        value={regHospitalId}
                        onChange={(e) =>
                          setRegHospitalId(e.target.value)
                        }
                        className="w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white outline-none focus:border-indigo-500"
                      >
                        {hospitals.map((hospital) => (
                          <option
                            key={hospital.id}
                            value={hospital.id}
                          >
                            {hospital.name} ({hospital.code})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Department */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-2">
                        Department / Specialty
                      </label>

                      <input
                        type="text"
                        value={regDepartment}
                        onChange={(e) =>
                          setRegDepartment(e.target.value)
                        }
                        placeholder="e.g. Cardiology"
                        className="w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white outline-none focus:border-indigo-500"
                      />
                    </div>

                    {/* Approval Notice */}
                    <div className="p-4 rounded-2xl bg-amber-950/30 border border-amber-900/60">
                      <div className="flex gap-2">
                        <Clock className="w-5 h-5 text-amber-400 shrink-0" />

                        <div>
                          <div className="font-bold text-amber-300 text-xs">
                            Administrator Approval Required
                          </div>

                          <p className="text-[11px] text-amber-200/70 mt-1">
                            Registration does not provide immediate
                            access. Your account will remain pending
                            until an authorized administrator reviews
                            and approves it.
                          </p>
                        </div>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={regLoading}
                      className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/20"
                    >
                      {regLoading
                        ? 'Submitting Request...'
                        : 'Submit Access Request'}
                    </button>

                    <div className="pt-3 text-center">
                      <button
                        type="button"
                        onClick={() => {
                          setMode('LOGIN');
                          setRegError(null);
                          setRegSuccess(null);
                        }}
                        className="text-xs font-bold text-blue-400 hover:text-blue-300"
                      >
                        ← Back to Sign In
                      </button>
                    </div>
                  </form>
                )}

              </div>
            </div>
          </div>
        </div>
      </main>

      {/* =======================================================
          FOOTER
      ======================================================== */}
      <footer className="border-t border-slate-800 bg-slate-950 py-5 text-center">
        <div className="flex items-center justify-center gap-2 text-xs text-slate-500">
          <ShieldCheck className="w-4 h-4 text-blue-500" />
          FedTrustMed © 2026
        </div>

        <p className="text-[11px] text-slate-600 mt-1">
          AES-256 Encryption • ECC P-256 • Hyperledger Fabric •
          Dynamic Trust • Federated Learning
        </p>
      </footer>
    </div>
  );
};