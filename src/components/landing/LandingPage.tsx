import React, { useEffect, useState } from 'react';
import {
  Activity,
  BadgeCheck,
  Building2,
  CheckCircle2,
  Clock,
  CreditCard,
  Eye,
  EyeOff,
  FileCheck2,
  Key,
  Lock,
  Mail,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  UserCheck,
  UserPlus,
} from 'lucide-react';

import { useAuth } from '../../context/AuthContext';
import { UserRole, Hospital } from '../../types';
import { api } from '../../services/api';

export const LandingPage: React.FC<{
onAuthenticated?: () => void;
}> = () => {
const { login, register } = useAuth();

const [mode, setMode] = useState<'LOGIN' | 'REGISTER'>('LOGIN');

// Login
const [email, setEmail] = useState('');
const [password, setPassword] = useState('');
const [showLoginPassword, setShowLoginPassword] = useState(false);
const [loginOtp, setLoginOtp] = useState('');
const [mfaRequired, setMfaRequired] = useState(false);
const [loginError, setLoginError] = useState<string | null>(null);
const [loginLoading, setLoginLoading] = useState(false);

// Registration
const [regName, setRegName] = useState('');
const [regEmail, setRegEmail] = useState('');
const [regPassword, setRegPassword] = useState('');
const [regRole, setRegRole] = useState<UserRole>('PATIENT');
const [regHospitalId, setRegHospitalId] = useState('hosp-a');
const [regDepartment, setRegDepartment] = useState('Cardiology');

// Identity verification
const [regAadhaar, setRegAadhaar] = useState('');

// Doctor verification
const [regMedicalLicenseNumber, setRegMedicalLicenseNumber] = useState('');
const [regMedicalLicenseDocumentName, setRegMedicalLicenseDocumentName] = useState('');

// Hospital Admin verification
const [regAdminAuthCode, setRegAdminAuthCode] = useState('');

const [regSuccess, setRegSuccess] = useState<string | null>(null);
const [regError, setRegError] = useState<string | null>(null);
const [regLoading, setRegLoading] = useState(false);

const [hospitals, setHospitals] = useState<Hospital[]>([]);

useEffect(() => {
  let mounted = true;

  api
    .getHospitals()
    .then((res) => {
      if (mounted && res?.hospitals) {
        setHospitals(res.hospitals);
      }
    })
    .catch((error) => {
      console.error('Unable to load hospitals:', error);
    });

  return () => {
    mounted = false;
  };
}, []);

const switchMode = (nextMode: 'LOGIN' | 'REGISTER') => {
  setMode(nextMode);
  setLoginError(null);
  setRegError(null);
  setRegSuccess(null);
  setMfaRequired(false);
  setLoginOtp('');
};

const quickFillLogin = (role: 'HOSPITAL_ADMIN' | 'DOCTOR' | 'PATIENT' | 'SYSTEM_ADMIN') => {
  setMfaRequired(false);
  setLoginOtp('');
  setLoginError(null);
  setMode('LOGIN');

  if (role === 'HOSPITAL_ADMIN') {
    setEmail('hospitaladmin.demo@fedtrustmed.local');
    setPassword('hosp123');
  } else if (role === 'DOCTOR') {
    setEmail('doctor.demo@fedtrustmed.local');
    setPassword('doc123');
  } else if (role === 'PATIENT') {
    setEmail('patient.demo@fedtrustmed.local');
    setPassword('patient123');
  } else if (role === 'SYSTEM_ADMIN') {
    setEmail('sysadmin@fedtrustmed.org');
    setPassword('admin123');
  }
};

const quickFillRegister = (role: 'HOSPITAL_ADMIN' | 'DOCTOR' | 'PATIENT') => {
  setRegError(null);
  setRegSuccess(null);
  setMode('REGISTER');

  if (role === 'HOSPITAL_ADMIN') {
    setRegName('Elena Vance (Demo)');
    setRegEmail('elena.vance.demo@fedtrustmed.org');
    setRegPassword('DemoAdmin123!');
    setRegRole('HOSPITAL_ADMIN');
    setRegHospitalId('hosp-a');
    setRegAadhaar('TEST-AADHAAR-0006');
    setRegAdminAuthCode('HOSP-ADMIN-AUTH-002');
  } else if (role === 'DOCTOR') {
    setRegName('Dr. Marcus Vance (Demo)');
    setRegEmail('marcus.vance.demo@fedtrustmed.org');
    setRegPassword('DemoDoctor123!');
    setRegRole('DOCTOR');
    setRegHospitalId('hosp-b');
    setRegDepartment('Oncology');
    setRegAadhaar('TEST-AADHAAR-0004');
    setRegMedicalLicenseNumber('TEST-MED-LIC-0002');
    setRegMedicalLicenseDocumentName('MD_Licence_MarcusVance_Demo.pdf');
  } else if (role === 'PATIENT') {
    setRegName('Michael Scott (Demo)');
    setRegEmail('michael.scott.demo@fedtrustmed.org');
    setRegPassword('DemoPatient123!');
    setRegRole('PATIENT');
    setRegHospitalId('hosp-b');
    setRegAadhaar('TEST-AADHAAR-0005');
  }
};

const handleLoginSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
  e.preventDefault();

  setLoginError(null);
  setLoginLoading(true);

  try {
    const result = await login(email.trim(), password, loginOtp.trim());

    if (!result.success) {
      if (result.mfaRequired) {
        setMfaRequired(true);
        setLoginError(result.error || 'Multi-factor authentication (MFA) code is required.');
      } else {
        setLoginError(result.error || 'Authentication failed.');
      }
    }
  } catch (error) {
    console.error('Login error:', error);
    setLoginError(
      'Unable to connect to the authentication server. Please try again.'
    );
  } finally {
    setLoginLoading(false);
  }
};

const handleRegisterSubmit = async (
  e: React.FormEvent<HTMLFormElement>
) => {
  e.preventDefault();

  setRegError(null);
  setRegSuccess(null);

  const normalizedAadhaar = regAadhaar.trim().toUpperCase();

  if (!regName.trim()) {
    setRegError('Please enter your full name.');
    return;
  }

  if (!regEmail.trim()) {
    setRegError('Please enter your email address.');
    return;
  }

  if (!regPassword) {
    setRegError('Please create a password.');
    return;
  }

  if (!normalizedAadhaar.startsWith('TEST-AADHAAR-') && !/^\d{12}$/.test(normalizedAadhaar.replace(/\D/g, ''))) {
    setRegError('Please enter a valid simulated test identity (e.g. TEST-AADHAAR-0001) or 12-digit Aadhaar number.');
    return;
  }

  if (!regHospitalId) {
    setRegError('Please select your primary hospital.');
    return;
  }

  if (regRole === 'DOCTOR') {
    if (!regDepartment.trim()) {
      setRegError('Department / specialty is required for doctors.');
      return;
    }

    if (!regMedicalLicenseNumber.trim()) {
      setRegError(
        'Medical licence / registration number is required for doctors.'
      );
      return;
    }

    if (!regMedicalLicenseDocumentName.trim()) {
      setRegError(
        'Medical licence document reference is required for doctors.'
      );
      return;
    }
  }

  if (regRole === 'HOSPITAL_ADMIN') {
    if (!regAdminAuthCode.trim()) {
      setRegError(
        'Hospital Administrator Authorization Code is required (e.g. HOSP-ADMIN-AUTH-001).'
      );
      return;
    }
  }

  setRegLoading(true);

  try {
    const result = await register({
      fullName: regName.trim(),
      email: regEmail.trim(),
      password: regPassword,
      role: regRole,
      hospitalId: regHospitalId,
      departmentName:
        regRole === 'DOCTOR' ? regDepartment.trim() : undefined,
      requestedPermissions: ['READ_RECORDS'],
      aadhaarNumber: normalizedAadhaar,
      medicalLicenseNumber:
        regRole === 'DOCTOR'
          ? regMedicalLicenseNumber.trim().toUpperCase()
          : undefined,
      medicalLicenseDocumentName:
        regRole === 'DOCTOR'
          ? regMedicalLicenseDocumentName.trim()
          : undefined,
      adminAuthorizationCode:
        regRole === 'HOSPITAL_ADMIN'
          ? regAdminAuthCode.trim().toUpperCase()
          : undefined,
    });

    if (!result.success) {
      setRegError(result.error || 'Registration failed.');
      return;
    }

    setRegSuccess(
      result.message ||
      'Registration submitted successfully! Your simulated identity and hospital affiliation have been verified. The account is now pending System Administrator approval before you can sign in.'
    );

    setRegName('');
    setRegEmail('');
    setRegPassword('');
    setRegAadhaar('');
    setRegMedicalLicenseNumber('');
    setRegMedicalLicenseDocumentName('');
    setRegAdminAuthCode('');
    setRegDepartment('Cardiology');
  } catch (error) {
    console.error('Registration error:', error);
    setRegError(
      'Unable to submit registration. Please make sure the server is running.'
    );
  } finally {
    setRegLoading(false);
  }
};

const handleRoleChange = (role: UserRole) => {
  setRegRole(role);
  setRegError(null);

  if (role !== 'DOCTOR') {
    setRegMedicalLicenseNumber('');
    setRegMedicalLicenseDocumentName('');
  }

  if (role !== 'HOSPITAL_ADMIN') {
    setRegAdminAuthCode('');
  }

  if (role === 'DOCTOR' && !regDepartment) {
    setRegDepartment('Cardiology');
  }
};

return ( <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
{/* Header */} <header className="border-b border-slate-800 bg-slate-900/90"> <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between"> <div className="flex items-center gap-3"> <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg"> <ShieldCheck className="w-6 h-6 text-white" /> </div>

        <div>
          <div className="font-extrabold text-xl text-white">
            FedTrustMed
          </div>
          <div className="text-xs text-blue-400 font-semibold">
            Federated Blockchain &amp; Dynamic Trust Framework
          </div>
        </div>
      </div>

      <div className="hidden sm:flex items-center gap-2">
        <button
          type="button"
          onClick={() => switchMode('LOGIN')}
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
          type="button"
          onClick={() => switchMode('REGISTER')}
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

  {/* Hero */}
  <section className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 pt-12 pb-8">
    <div className="text-center max-w-4xl mx-auto">
      <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-950/70 border border-blue-800 text-blue-300 text-xs font-semibold">
        <Sparkles className="w-4 h-4" />
        Zero-Trust Healthcare Security Platform
      </div>

      <h1 className="mt-5 text-4xl sm:text-6xl font-black text-white tracking-tight">
        Secure Healthcare Data.
        <span className="text-blue-500"> Patient Controlled.</span>
      </h1>

      <p className="mt-5 text-slate-400 text-sm sm:text-base leading-relaxed max-w-3xl mx-auto">
        FedTrustMed protects medical information using encrypted records,
        patient-controlled consent, federated learning, dynamic trust
        management and blockchain-based access control.
      </p>
    </div>
  </section>

  {/* Main */}
  <main className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 pb-12 flex-1">
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
      {/* Information Panel */}
      <div className="lg:col-span-7 space-y-5">
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
                Zero-Trust Identity &amp; Authorization
              </p>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            <WorkflowStep
              number="1"
              color="blue"
              title="Create an Account"
              text="Patients, doctors and authorized hospital staff submit an access request with identity information."
            />

            <WorkflowStep
              number="2"
              color="amber"
              title="Identity & Document Verification"
              text="Aadhaar verification is required for public users. Doctor accounts additionally require medical licence verification."
            />

            <WorkflowStep
              number="3"
              color="emerald"
              title="Administrator Approval"
              text="The System Administrator verifies the submitted information and assigns the appropriate role and data-access permissions."
            />

            <WorkflowStep
              number="4"
              color="purple"
              title="Protected Dashboard"
              text="After authentication, users see only the dashboard and healthcare data authorized by their role, permissions, consent and trust status."
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <RoleCard
            icon={<UserCheck className="w-6 h-6 text-blue-400" />}
            title="Patient"
            text="Controls personal medical records and grants or revokes authorized healthcare access."
          />

          <RoleCard
            icon={<Stethoscope className="w-6 h-6 text-teal-400" />}
            title="Doctor"
            text="Creates clinical records and requests access to patient information through consent."
          />

          <RoleCard
            icon={<Building2 className="w-6 h-6 text-indigo-400" />}
            title="Hospital Admin"
            text="Manages hospital-level users, permissions and organizational access."
          />

          <RoleCard
            icon={<ShieldCheck className="w-6 h-6 text-purple-400" />}
            title="System Administrator"
            text="Responsible for system-wide approvals, security and governance."
          />
        </div>

        <div className="bg-blue-950/30 border border-blue-900/60 rounded-2xl p-5">
          <div className="flex gap-3">
            <Activity className="w-5 h-5 text-blue-400 shrink-0" />

            <div>
              <h3 className="font-bold text-blue-300">
                Zero-Trust Access
              </h3>

              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Authentication alone does not grant access. The system
                validates account approval, identity verification, role,
                permissions, consent and trust status before protected
                healthcare information is accessed.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Authentication Panel */}
      <div className="lg:col-span-5">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden">
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
                Only verified and approved accounts can access the
                protected healthcare system.
              </span>
            </div>
          </div>

          {/* Tabs */}
          <div className="grid grid-cols-2 border-b border-slate-800">
            <button
              type="button"
              onClick={() => switchMode('LOGIN')}
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
              type="button"
              onClick={() => switchMode('REGISTER')}
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
            {/* Login */}
            {mode === 'LOGIN' && (
              <form onSubmit={handleLoginSubmit} className="space-y-5">
                <div>
                  <h3 className="text-lg font-bold text-white">
                    Sign In to FedTrustMed
                  </h3>

                  <p className="text-xs text-slate-400 mt-1">
                    Authenticate using your approved account. MFA may be
                    required if enabled.
                  </p>
                </div>

                {loginError && (
                  <AlertBox
                    type="error"
                    title="Access Denied"
                    message={loginError}
                  />
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
                      onChange={(e) => setEmail(e.target.value)}
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
                      type={showLoginPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="w-full pl-10 pr-11 py-3 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white outline-none focus:border-blue-500"
                    />

                    <button
                      type="button"
                      onClick={() => setShowLoginPassword(!showLoginPassword)}
                      className="absolute right-3 top-3 text-slate-400 hover:text-slate-200 transition"
                      title={showLoginPassword ? 'Hide password' : 'Show password'}
                    >
                      {showLoginPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* MFA OTP Challenge */}
                {mfaRequired && (
                  <div className="p-4 rounded-2xl bg-indigo-950/40 border border-indigo-500/60 space-y-3 animate-fadeIn">
                    <div className="flex items-center gap-2 text-indigo-300 font-bold text-xs">
                      <ShieldCheck className="w-4 h-4 text-indigo-400" />
                      Multi-Factor Authentication (MFA) Required
                    </div>
                    <p className="text-[11px] text-indigo-200/80 leading-relaxed">
                      This privileged account has MFA enabled. Enter the 6-digit TOTP code from your authenticator app, or use the academic prototype demo code: <strong className="text-white bg-indigo-900/80 px-1.5 py-0.5 rounded font-mono">123456</strong>.
                    </p>
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        6-Digit TOTP Verification Code
                      </label>
                      <input
                        type="text"
                        required
                        maxLength={6}
                        autoFocus
                        value={loginOtp}
                        onChange={(e) => setLoginOtp(e.target.value.replace(/\D/g, ''))}
                        placeholder="123456"
                        className="w-full px-4 py-2.5 bg-slate-950 border border-indigo-400 rounded-xl text-center text-lg tracking-widest text-white outline-none font-mono"
                      />
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loginLoading}
                  className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold rounded-xl shadow-lg shadow-blue-600/20"
                >
                  {loginLoading
                    ? 'Authenticating...'
                    : mfaRequired
                    ? 'Verify MFA & Complete Sign In'
                    : 'Authenticate & Sign In'}
                </button>

                {/* 1-Click Demo Credentials Quick Fill */}
                <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-2.5">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-300">
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                      Academic Prototype Demo Accounts
                    </span>
                    <span className="text-[9px] text-emerald-400 font-bold uppercase tracking-wider bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-800">
                      1-Click Auto-Fill
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => quickFillLogin('HOSPITAL_ADMIN')}
                      className="p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800/80 border border-indigo-900/50 text-left transition"
                    >
                      <div className="font-bold text-indigo-300 flex items-center gap-1 text-[11px]">
                        <Building2 className="w-3 h-3 text-indigo-400" /> Hospital Admin
                      </div>
                      <div className="text-[10px] text-slate-300 font-medium truncate mt-0.5">Aisha Khan (Demo)</div>
                      <div className="text-[9px] text-amber-400 mt-0.5">MFA Active (Code: 123456)</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => quickFillLogin('DOCTOR')}
                      className="p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800/80 border border-teal-900/50 text-left transition"
                    >
                      <div className="font-bold text-teal-300 flex items-center gap-1 text-[11px]">
                        <Stethoscope className="w-3 h-3 text-teal-400" /> Doctor (Cardio)
                      </div>
                      <div className="text-[10px] text-slate-300 font-medium truncate mt-0.5">Dr. Robert Chen (Demo)</div>
                      <div className="text-[9px] text-teal-400 mt-0.5">Licence: TEST-MED-LIC-0001</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => quickFillLogin('PATIENT')}
                      className="p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800/80 border border-blue-900/50 text-left transition"
                    >
                      <div className="font-bold text-blue-300 flex items-center gap-1 text-[11px]">
                        <UserCheck className="w-3 h-3 text-blue-400" /> Patient
                      </div>
                      <div className="text-[10px] text-slate-300 font-medium truncate mt-0.5">Sarah Connor (Demo)</div>
                      <div className="text-[9px] text-blue-400 mt-0.5">Aadhaar: TEST-AADHAAR-0001</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => quickFillLogin('SYSTEM_ADMIN')}
                      className="p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800/80 border border-purple-900/50 text-left transition"
                    >
                      <div className="font-bold text-purple-300 flex items-center gap-1 text-[11px]">
                        <ShieldCheck className="w-3 h-3 text-purple-400" /> System Admin
                      </div>
                      <div className="text-[10px] text-slate-300 font-medium truncate mt-0.5">Root Operations</div>
                      <div className="text-[9px] text-purple-400 mt-0.5">User Approvals & Matrix</div>
                    </button>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-800 text-center">
                  <p className="text-xs text-slate-500">
                    Do not have an approved account?
                  </p>

                  <button
                    type="button"
                    onClick={() => switchMode('REGISTER')}
                    className="mt-2 text-xs font-bold text-blue-400 hover:text-blue-300"
                  >
                    Request Access / Register
                  </button>
                </div>
              </form>
            )}

            {/* Registration */}
            {mode === 'REGISTER' && (
              <form onSubmit={handleRegisterSubmit} className="space-y-4">
                <div>
                  <h3 className="text-lg font-bold text-white">
                    Request System Access
                  </h3>

                  <p className="text-xs text-slate-400 mt-1">
                    Submit your identity information for simulated registry verification and administrator approval.
                  </p>
                </div>

                {/* 1-Click Controlled Simulation Auto-Fill */}
                <div className="p-3.5 rounded-2xl bg-indigo-950/30 border border-indigo-900/60 space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-indigo-300">
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                      Controlled Simulation Auto-Fill (Viva Defense)
                    </span>
                    <span className="text-[9px] text-indigo-400 font-bold uppercase tracking-wider bg-indigo-900/40 px-2 py-0.5 rounded-full border border-indigo-800">
                      Demo Ready
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Auto-fills verified test credentials to demonstrate backend zero-trust checks against the controlled UIDAI, medical licence, and hospital authorization registries.
                  </p>
                  <div className="flex flex-wrap gap-2 text-xs pt-1">
                    <button
                      type="button"
                      onClick={() => quickFillRegister('HOSPITAL_ADMIN')}
                      className="px-2.5 py-1.5 rounded-xl bg-indigo-900/70 hover:bg-indigo-800 border border-indigo-700 text-indigo-200 font-bold text-[11px] flex items-center gap-1 transition"
                    >
                      <Building2 className="w-3 h-3 text-indigo-300" />
                      Hospital Admin (Elena Vance)
                    </button>
                    <button
                      type="button"
                      onClick={() => quickFillRegister('DOCTOR')}
                      className="px-2.5 py-1.5 rounded-xl bg-teal-900/70 hover:bg-teal-800 border border-teal-700 text-teal-200 font-bold text-[11px] flex items-center gap-1 transition"
                    >
                      <Stethoscope className="w-3 h-3 text-teal-300" />
                      Doctor (Dr. Marcus Vance)
                    </button>
                    <button
                      type="button"
                      onClick={() => quickFillRegister('PATIENT')}
                      className="px-2.5 py-1.5 rounded-xl bg-blue-900/70 hover:bg-blue-800 border border-blue-700 text-blue-200 font-bold text-[11px] flex items-center gap-1 transition"
                    >
                      <UserCheck className="w-3 h-3 text-blue-300" />
                      Patient (Michael Scott)
                    </button>
                  </div>
                </div>

                {regSuccess && (
                  <AlertBox
                    type="success"
                    title="Request Submitted & Identity Verified"
                    message={regSuccess}
                  />
                )}

                {regError && (
                  <AlertBox
                    type="error"
                    title="Verification / Registration Failed"
                    message={regError}
                  />
                )}

                <InputField
                  label="Full Name"
                  value={regName}
                  onChange={setRegName}
                  placeholder="Full name"
                  required
                />

                <InputField
                  label="Email Address"
                  type="email"
                  value={regEmail}
                  onChange={setRegEmail}
                  placeholder="your@email.com"
                  required
                />

                <InputField
                  label="Password"
                  type="password"
                  value={regPassword}
                  onChange={setRegPassword}
                  placeholder="Create password"
                  required
                />

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-2">
                    Requested Role
                  </label>

                  <select
                    value={regRole}
                    onChange={(e) =>
                      handleRoleChange(e.target.value as UserRole)
                    }
                    className="w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white outline-none focus:border-indigo-500"
                  >
                    <option value="PATIENT">Patient</option>
                    <option value="DOCTOR">Doctor / Physician</option>
                    <option value="HOSPITAL_ADMIN">
                      Hospital Administrator
                    </option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-2">
                    Primary Hospital
                  </label>

                  <select
                    value={regHospitalId}
                    onChange={(e) => setRegHospitalId(e.target.value)}
                    required
                    className="w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white outline-none focus:border-indigo-500"
                  >
                    {hospitals.length === 0 ? (
                      <option value="">Loading hospitals...</option>
                    ) : (
                      hospitals.map((hospital) => (
                        <option key={hospital.id} value={hospital.id}>
                          {hospital.name} ({hospital.code})
                        </option>
                      ))
                    )}
                  </select>
                </div>

                {/* Aadhaar Input supporting Controlled Simulation */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-2">
                    Aadhaar / Simulated National ID
                    <span className="text-rose-400 ml-1">*</span>
                  </label>

                  <div className="relative">
                    <CreditCard className="absolute left-3 top-3 w-4 h-4 text-slate-500" />

                    <input
                      type="text"
                      required
                      autoComplete="off"
                      value={regAadhaar}
                      onChange={(e) => setRegAadhaar(e.target.value.toUpperCase())}
                      placeholder="e.g. TEST-AADHAAR-0001 (or 12-digit number)"
                      className="w-full pl-10 pr-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white outline-none focus:border-indigo-500 font-mono"
                    />
                  </div>

                  <p className="mt-2 text-[11px] text-slate-500">
                    For academic prototype safety, real government identity numbers are never used. Enter a simulated identity (e.g. <strong className="text-slate-300">TEST-AADHAAR-0001</strong> for Patient, <strong className="text-slate-300">TEST-AADHAAR-0002</strong> for Doctor, <strong className="text-slate-300">TEST-AADHAAR-0003</strong> for Hospital Admin).
                  </p>
                </div>

                {/* Hospital Administrator Authorization Code */}
                {regRole === 'HOSPITAL_ADMIN' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-2">
                      Hospital Admin Authorization Code
                      <span className="text-rose-400 ml-1">*</span>
                    </label>

                    <div className="relative">
                      <Building2 className="absolute left-3 top-3 w-4 h-4 text-slate-500" />

                      <input
                        type="text"
                        required
                        value={regAdminAuthCode}
                        onChange={(e) => setRegAdminAuthCode(e.target.value.toUpperCase())}
                        placeholder="e.g. HOSP-ADMIN-AUTH-001"
                        className="w-full pl-10 pr-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white outline-none focus:border-indigo-500 font-mono"
                      />
                    </div>

                    <p className="mt-2 text-[11px] text-slate-500">
                      Simulated institutional credential issued by the hospital governing body (Demo credential: <strong className="text-slate-300">HOSP-ADMIN-AUTH-001</strong> for St. Jude General Hospital).
                    </p>
                  </div>
                )}

                {/* Doctor fields */}
                {regRole === 'DOCTOR' && (
                  <>
                    <InputField
                      label="Department / Specialty"
                      value={regDepartment}
                      onChange={setRegDepartment}
                      placeholder="e.g. Cardiology"
                      required
                    />

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-2">
                        Medical Licence / Registration Number
                        <span className="text-rose-400 ml-1">*</span>
                      </label>

                      <div className="relative">
                        <BadgeCheck className="absolute left-3 top-3 w-4 h-4 text-slate-500" />

                        <input
                          type="text"
                          required
                          value={regMedicalLicenseNumber}
                          onChange={(e) =>
                            setRegMedicalLicenseNumber(e.target.value.toUpperCase())
                          }
                          placeholder="e.g. TEST-MED-LIC-0001"
                          className="w-full pl-10 pr-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white outline-none focus:border-indigo-500 font-mono"
                        />
                      </div>
                    </div>

                    <InputField
                      label="Medical Licence Document Reference"
                      value={regMedicalLicenseDocumentName}
                      onChange={setRegMedicalLicenseDocumentName}
                      placeholder="e.g. NMC_License_RobertChen_Demo.pdf"
                      required
                    />

                    <p className="-mt-2 text-[11px] text-slate-500">
                      Demo license <strong className="text-slate-300">TEST-MED-LIC-0001</strong> is registered with the simulated National Medical Commission for Dr. Robert Chen.
                    </p>
                  </>
                )}

                {/* Verification notice */}
                <div className="p-4 rounded-2xl bg-blue-950/30 border border-blue-900/60">
                  <div className="flex gap-3">
                    <ShieldCheck className="w-5 h-5 text-blue-400 shrink-0" />

                    <div>
                      <div className="font-bold text-blue-300 text-xs">
                        Controlled Verification Simulation Active
                      </div>

                      <p className="text-[11px] text-blue-200/70 mt-1 leading-relaxed">
                        Demonstrates automated UIDAI Aadhaar verification, medical council licensure check, and hospital affiliation authentication without storing real sensitive citizen data.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Approval notice */}
                <div className="p-4 rounded-2xl bg-amber-950/30 border border-amber-900/60">
                  <div className="flex gap-3">
                    <Clock className="w-5 h-5 text-amber-400 shrink-0" />

                    <div>
                      <div className="font-bold text-amber-300 text-xs">
                        Zero-Trust Administrator Clearance Required
                      </div>

                      <p className="text-[11px] text-amber-200/70 mt-1 leading-relaxed">
                        Registration creates a PENDING account. The Root System Administrator reviews the verified credentials and grants specific RBAC/ABAC data-access scopes.
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
                    ? 'Verifying & Submitting Request...'
                    : 'Submit Access Request'}
                </button>

                <div className="pt-3 text-center">
                  <button
                    type="button"
                    onClick={() => switchMode('LOGIN')}
                    className="text-xs font-bold text-blue-400 hover:text-blue-300"
                  >
                    Already have an account? Sign In
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  </main>

  {/* Footer */}
  <footer className="border-t border-slate-800 bg-slate-950 py-5 text-center">
    <div className="flex items-center justify-center gap-2 text-xs text-slate-500">
      <ShieldCheck className="w-4 h-4 text-blue-500" />
      FedTrustMed &copy; 2026
    </div>

    <p className="text-[11px] text-slate-600 mt-1">
      AES-256 Encryption &bull; ECC P-256 &bull; Blockchain Access Control
      &bull; Dynamic Trust &bull; Federated Learning
    </p>
  </footer>
</div>

);
};

/* ================================================================
Supporting Components
================================================================ */

const WorkflowStep: React.FC<{
number: string;
color: 'blue' | 'amber' | 'emerald' | 'purple';
title: string;
text: string;
}> = ({ number, color, title, text }) => {
const colors = {
blue: 'bg-blue-900 text-blue-300',
amber: 'bg-amber-900 text-amber-300',
emerald: 'bg-emerald-900 text-emerald-300',
purple: 'bg-purple-900 text-purple-300',
};

return ( <div className="flex gap-3 p-4 bg-slate-950 rounded-2xl border border-slate-800">
<div
className={`w-7 h-7 rounded-full flex items-center justify-center font-bold shrink-0 ${colors[color]}`}
>
{number} </div>

  <div>
    <div className="font-bold text-white">{title}</div>
    <p className="text-xs text-slate-400 mt-1">{text}</p>
  </div>
</div>

);
};

const RoleCard: React.FC<{
icon: React.ReactNode;
title: string;
text: string;
}> = ({ icon, title, text }) => {
return ( <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5"> <div className="mb-3">{icon}</div>

  <h3 className="font-bold text-white">{title}</h3>

  <p className="text-xs text-slate-400 mt-2">{text}</p>
</div>

);
};

const InputField: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
}> = ({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  required = false,
}) => {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === 'password';
  const inputType = isPassword ? (showPassword ? 'text' : 'password') : type;

  return (
    <div>
      <label className="block text-xs font-semibold text-slate-300 mb-2">
        {label}
        {required && <span className="text-rose-400 ml-1">*</span>}
      </label>

      <div className="relative">
        <input
          type={inputType}
          required={required}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white outline-none focus:border-indigo-500 ${
            isPassword ? 'pr-11' : ''
          }`}
        />

        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-3 text-slate-400 hover:text-slate-200 transition"
            title={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? (
              <EyeOff className="w-4 h-4" />
            ) : (
              <Eye className="w-4 h-4" />
            )}
          </button>
        )}
      </div>
    </div>
  );
};

const AlertBox: React.FC<{
type: 'error' | 'success';
title: string;
message: string;
}> = ({ type, title, message }) => {
const success = type === 'success';

return (
<div
className={`p-4 rounded-2xl text-xs border ${
        success
          ? 'bg-emerald-950/50 border-emerald-800 text-emerald-200'
          : 'bg-rose-950/50 border-rose-800 text-rose-200'
      }`}
> <div className="flex gap-2">
{success ? ( <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
) : ( <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0" />
)}

    <div>
      <div className="font-bold">{title}</div>
      <p className="mt-1">{message}</p>
    </div>
  </div>
</div>

);
};
