import React, { useState, useEffect, useId } from 'react';
import {
  X,
  CheckCircle,
  AlertCircle,
  ShieldCheck,
  FileText,
  Upload,
  Lock,
  Mail,
  User as UserIcon,
  Building2,
  Key,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Loader2,
  Check,
  Info,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { api, Hospital, Department, SimulationIdentity } from '../../services/api';

const AVAILABLE_PERMISSIONS = [
  { id: 'READ_RECORDS', label: 'View Medical Records', role: 'ALL' },
  { id: 'WRITE_RECORDS', label: 'Create / Update Records', role: 'DOCTOR' },
  { id: 'CONSENT_OVERRIDE', label: 'Emergency Break-Glass Override', role: 'DOCTOR' },
  { id: 'AUDIT_ACCESS', label: 'Access Audit Logs', role: 'HOSPITAL_ADMIN' },
  { id: 'STAFF_MANAGEMENT', label: 'Manage Hospital Staff', role: 'HOSPITAL_ADMIN' },
];

export const LoginModal: React.FC = () => {
  const {
    isLoginModalOpen,
    loginModalTab,
    closeLoginModal,
    openLoginModal,
    login,
    register,
    simulationMode,
    simulationIdentities,
  } = useAuth();

  const [activeTab, setActiveTab] = useState<'login' | 'register'>('login');
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [showSimDrawer, setShowSimDrawer] = useState<boolean>(true);

  // Login form state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginOtp, setLoginOtp] = useState('');
  const [mfaRequired, setMfaRequired] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Registration form state
  const [regFullName, setRegFullName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regRole, setRegRole] = useState<'PATIENT' | 'DOCTOR' | 'HOSPITAL_ADMIN' | 'SYSTEM_ADMIN'>('PATIENT');
  const [regHospitalId, setRegHospitalId] = useState('');
  const [regDepartmentId, setRegDepartmentId] = useState('');
  const [regAadhaar, setRegAadhaar] = useState('');
  const [regLicenseNumber, setRegLicenseNumber] = useState('');
  const [regAuthCode, setRegAuthCode] = useState('');
  const [regFile, setRegFile] = useState<File | null>(null);
  const [regPermissions, setRegPermissions] = useState<string[]>(['READ_RECORDS']);

  // Registration validation & submission state
  const [regErrors, setRegErrors] = useState<Record<string, string>>({});
  const [regLoading, setRegLoading] = useState(false);
  const [regServerError, setRegServerError] = useState<string | null>(null);
  const [regSuccess, setRegSuccess] = useState<boolean>(false);

  const fileInputId = useId();

  // Sync tab with context trigger
  useEffect(() => {
    setActiveTab(loginModalTab);
    setLoginError(null);
    setRegServerError(null);
    setMfaRequired(false);
    setRegSuccess(false);
  }, [loginModalTab, isLoginModalOpen]);

  // Load hospitals on mount
  useEffect(() => {
    if (isLoginModalOpen) {
      api.getHospitals().then((list) => {
        setHospitals(list);
        if (list.length > 0 && !regHospitalId) {
          setRegHospitalId(list[0].id);
        }
      }).catch(console.error);
    }
  }, [isLoginModalOpen]);

  // Load departments when hospital changes or on open
  useEffect(() => {
    if (regHospitalId) {
      api.getDepartments(regHospitalId).then((depts) => {
        setDepartments(depts);
        if (depts.length > 0) {
          setRegDepartmentId(depts[0].name || depts[0].id);
        }
      }).catch(console.error);
    }
  }, [regHospitalId]);

  // Password live rule validation: "10+ characters with a letter and a number"
  const isPasswordLengthOk = regPassword.length >= 10;
  const hasPasswordLetter = /[a-zA-Z]/.test(regPassword);
  const hasPasswordNumber = /\d/.test(regPassword);
  const isPasswordValid = isPasswordLengthOk && hasPasswordLetter && hasPasswordNumber;

  // Handle autofill from Simulation test identities
  const handleApplySimIdentity = (id: SimulationIdentity) => {
    setActiveTab('register');
    setRegFullName(id.fullName);
    setRegRole(id.role);
    setRegAadhaar(id.aadhaar);
    setRegEmail(`${id.aadhaar.toLowerCase().replace(/[^a-z0-9]/g, '')}@sim.test`);
    setRegPassword('Password123!');

    if (id.hospitalId) {
      setRegHospitalId(id.hospitalId);
    }
    if (id.departmentName || id.departmentId) {
      setRegDepartmentId(id.departmentName || id.departmentId || 'Cardiology');
    }
    if (id.medicalLicenseNumber) {
      setRegLicenseNumber(id.medicalLicenseNumber);
    }
    if (id.adminAuthorizationCode) {
      setRegAuthCode(id.adminAuthorizationCode);
    }

    setRegErrors({});
    setRegServerError(null);
  };

  // Field validation mirroring server rules
  const validateRegistrationForm = (): boolean => {
    const errors: Record<string, string> = {};

    // 1. Full name: 2-100 characters
    if (!regFullName.trim()) {
      errors.fullName = 'Full name is required';
    } else if (regFullName.trim().length < 2 || regFullName.trim().length > 100) {
      errors.fullName = 'Full name must be between 2 and 100 characters';
    }

    // 2. Email validation
    if (!regEmail.trim()) {
      errors.email = 'Email address is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(regEmail.trim())) {
      errors.email = 'Please enter a valid email address';
    }

    // 3. Password validation: 10+ chars, letter and number
    if (!regPassword) {
      errors.password = 'Password is required';
    } else if (!isPasswordValid) {
      errors.password = 'Password must be 10+ characters with a letter and a number';
    }

    // 4. Aadhaar validation
    if (!regAadhaar.trim()) {
      errors.aadhaar = 'Aadhaar identity number is required';
    } else if (simulationMode && regAadhaar.trim().startsWith('TEST-AADHAAR-')) {
      if (!/^TEST-AADHAAR-\d{4}$/.test(regAadhaar.trim())) {
        errors.aadhaar = 'Simulation Aadhaar must follow TEST-AADHAAR-NNNN';
      }
    } else {
      const cleanAadhaar = regAadhaar.replace(/[\s-]/g, '');
      if (!/^\d{12}$/.test(cleanAadhaar)) {
        errors.aadhaar = 'Aadhaar must be a 12-digit number (or TEST-AADHAAR-NNNN in simulation mode)';
      }
    }

    // 5. Doctor-specific validation
    if (regRole === 'DOCTOR') {
      if (!regLicenseNumber.trim()) {
        errors.licenseNumber = 'Medical licence number is required for doctors';
      }
      if (!regFile) {
        errors.file = 'Doctor registration requires uploading a medical licence document (PDF, JPG, PNG)';
      } else {
        const ext = regFile.name.toLowerCase().split('.').pop() || '';
        if (!['pdf', 'jpg', 'jpeg', 'png'].includes(ext)) {
          errors.file = 'Invalid licence file format: medical licence must be a valid PDF, JPG, or PNG document';
        }
      }
    }

    // 6. Hospital Admin-specific validation
    if (regRole === 'HOSPITAL_ADMIN') {
      if (!regAuthCode.trim()) {
        errors.authCode = 'Authorization code is required for hospital administrators';
      }
      if (!regFile) {
        errors.file = 'Hospital admin registration requires uploading an authorization letter (PDF)';
      } else {
        const ext = regFile.name.toLowerCase().split('.').pop() || '';
        if (ext !== 'pdf') {
          errors.file = 'Invalid authorization letter: hospital admins must upload an authorization letter in PDF format';
        }
      }
    }

    setRegErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Submit Registration
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegServerError(null);

    if (!validateRegistrationForm()) {
      return;
    }

    setRegLoading(true);

    try {
      const formData = new FormData();
      formData.append('fullName', regFullName.trim());
      formData.append('email', regEmail.trim());
      formData.append('password', regPassword);
      formData.append('role', regRole);
      formData.append('aadhaar', regAadhaar.trim());

      if (regHospitalId) {
        formData.append('hospitalId', regHospitalId);
      }
      if (regRole === 'DOCTOR' && regDepartmentId) {
        formData.append('departmentId', regDepartmentId);
      }
      if (regRole === 'DOCTOR' && regLicenseNumber) {
        formData.append('medicalLicenseNumber', regLicenseNumber.trim());
      }
      if (regRole === 'HOSPITAL_ADMIN' && regAuthCode) {
        formData.append('adminAuthorizationCode', regAuthCode.trim());
      }
      if (regFile) {
        formData.append('file', regFile);
      }
      if (regPermissions.length > 0) {
        formData.append('requestedPermissions', JSON.stringify(regPermissions));
      }

      const res = await register(formData);

      if (res.error) {
        setRegServerError(res.error);
      } else {
        setRegSuccess(true);
      }
    } catch (err: any) {
      setRegServerError(err?.error || err?.message || 'Registration failed. Please check your information and try again.');
    } finally {
      setRegLoading(false);
    }
  };

  // Submit Login
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);

    if (!loginEmail.trim()) {
      setLoginError('Email address is required');
      return;
    }
    if (!loginPassword) {
      setLoginError('Password is required');
      return;
    }

    setLoginLoading(true);

    try {
      const res = await login({
        email: loginEmail.trim(),
        password: loginPassword,
        otp: loginOtp.trim() || undefined,
      });

      if (res.mfaRequired) {
        setMfaRequired(true);
        setLoginError(null);
      } else if (res.error) {
        setLoginError(res.error);
      } else if (res.token) {
        closeLoginModal();
      }
    } catch (err: any) {
      setLoginError(err?.error || err?.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setRegFile(file);
    if (file) {
      const ext = file.name.toLowerCase().split('.').pop() || '';
      if (regRole === 'DOCTOR' && !['pdf', 'jpg', 'jpeg', 'png'].includes(ext)) {
        setRegErrors((prev) => ({
          ...prev,
          file: 'Invalid licence file format: medical licence must be a valid PDF, JPG, or PNG document',
        }));
      } else if (regRole === 'HOSPITAL_ADMIN' && ext !== 'pdf') {
        setRegErrors((prev) => ({
          ...prev,
          file: 'Invalid authorization letter: hospital admins must upload an authorization letter in PDF format',
        }));
      } else {
        setRegErrors((prev) => {
          const next = { ...prev };
          delete next.file;
          return next;
        });
      }
    }
  };

  if (!isLoginModalOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header Bar */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-500/20 border border-teal-400/40 flex items-center justify-center text-teal-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
                FedTrustMed
                <span className="text-xs px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/30 font-medium">
                  v0.1.0 Prototype
                </span>
              </h2>
            </div>
          </div>
          <button
            onClick={closeLoginModal}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 bg-slate-50/50">
          <button
            type="button"
            onClick={() => {
              setActiveTab('login');
              setLoginError(null);
            }}
            className={`flex-1 py-3 text-sm font-semibold text-center border-b-2 transition-all cursor-pointer ${
              activeTab === 'login'
                ? 'border-teal-600 text-teal-700 bg-white'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Sign In to Portal
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('register');
              setRegServerError(null);
            }}
            className={`flex-1 py-3 text-sm font-semibold text-center border-b-2 transition-all cursor-pointer ${
              activeTab === 'register'
                ? 'border-teal-600 text-teal-700 bg-white'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Create New Account
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 max-h-[75vh] overflow-y-auto">
          
          {/* ================================================================ */}
          {/* LOGIN TAB */}
          {/* ================================================================ */}
          {activeTab === 'login' && (
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              {/* Quick Demo Persona Fill Bar */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center justify-between">
                  <span>Quick Demo Personas (1-Click Fill)</span>
                  <span className="text-[10px] text-teal-600 font-mono font-semibold">Password: Password123!</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setLoginEmail('doctor@fedtrustmed.demo');
                      setLoginPassword('Password123!');
                    }}
                    className="p-2 rounded-lg bg-white border border-slate-200 hover:border-teal-500 hover:bg-teal-50/50 transition-all text-left text-xs cursor-pointer shadow-xs"
                  >
                    <div className="font-bold text-slate-900 truncate">🩺 Doctor</div>
                    <div className="text-[10px] text-slate-500 truncate">Dr. Priya Patel</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLoginEmail('patient@fedtrustmed.demo');
                      setLoginPassword('Password123!');
                    }}
                    className="p-2 rounded-lg bg-white border border-slate-200 hover:border-teal-500 hover:bg-teal-50/50 transition-all text-left text-xs cursor-pointer shadow-xs"
                  >
                    <div className="font-bold text-slate-900 truncate">👤 Patient</div>
                    <div className="text-[10px] text-slate-500 truncate">Aarav Sharma</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLoginEmail('hospital_admin@fedtrustmed.demo');
                      setLoginPassword('Password123!');
                    }}
                    className="p-2 rounded-lg bg-white border border-slate-200 hover:border-teal-500 hover:bg-teal-50/50 transition-all text-left text-xs cursor-pointer shadow-xs"
                  >
                    <div className="font-bold text-slate-900 truncate">🏥 Hosp Admin</div>
                    <div className="text-[10px] text-slate-500 truncate">Rajesh Verma</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLoginEmail('system_admin@fedtrustmed.demo');
                      setLoginPassword('Password123!');
                    }}
                    className="p-2 rounded-lg bg-white border border-slate-200 hover:border-teal-500 hover:bg-teal-50/50 transition-all text-left text-xs cursor-pointer shadow-xs"
                  >
                    <div className="font-bold text-slate-900 truncate">🛡️ Sys Admin</div>
                    <div className="text-[10px] text-slate-500 truncate">Vikram Malhotra</div>
                  </button>
                </div>
              </div>

              {loginError && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-start gap-2.5">
                  <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                  <div className="font-medium">{loginError}</div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                  <input
                    type="email"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="name@hospital.org"
                    required
                    className="w-full pl-9 pr-3.5 py-2.5 rounded-lg border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-shadow"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                  <input
                    type="password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="Enter your password"
                    required
                    className="w-full pl-9 pr-3.5 py-2.5 rounded-lg border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-shadow"
                  />
                </div>
              </div>

              {/* OTP BOX (Shown when server returns mfaRequired: true) */}
              {mfaRequired && (
                <div className="p-4 rounded-xl bg-teal-50 border border-teal-200 space-y-2 animate-in fade-in duration-200">
                  <label className="block text-xs font-bold text-teal-900 uppercase tracking-wider">
                    Multi-Factor Authentication (OTP Code)
                  </label>
                  <p className="text-xs text-teal-700">
                    A 6-digit verification code is required for your account. Please enter it below:
                  </p>
                  <div className="relative">
                    <Key className="w-4 h-4 text-teal-500 absolute left-3 top-3 pointer-events-none" />
                    <input
                      type="text"
                      maxLength={6}
                      value={loginOtp}
                      onChange={(e) => setLoginOtp(e.target.value.replace(/\D/g, ''))}
                      placeholder="000000"
                      autoFocus
                      required
                      className="w-full pl-9 pr-3.5 py-2.5 font-mono text-center tracking-widest text-lg font-bold rounded-lg border border-teal-300 text-teal-900 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={loginLoading}
                className="w-full py-2.5 px-4 rounded-lg bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 text-white font-semibold text-sm shadow-sm transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                {loginLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Authenticating...
                  </>
                ) : (
                  'Sign In'
                )}
              </button>

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => openLoginModal('register')}
                  className="text-xs font-semibold text-teal-600 hover:text-teal-800"
                >
                  Don't have an account? Register here
                </button>
              </div>
            </form>
          )}

          {/* ================================================================ */}
          {/* REGISTER TAB */}
          {/* ================================================================ */}
          {activeTab === 'register' && (
            <div>
              {/* SUCCESS MESSAGE STATE */}
              {regSuccess ? (
                <div className="p-6 text-center space-y-4">
                  <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto border-4 border-emerald-50">
                    <CheckCircle className="w-10 h-10" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-slate-900">Registration Submitted Successfully!</h3>
                    <p className="text-sm font-semibold text-amber-600 mt-1">
                      Account Status: PENDING ADMINISTRATOR APPROVAL
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-left text-xs text-slate-600 space-y-2">
                    <p className="font-semibold text-slate-800">What happens next?</p>
                    <ul className="list-disc pl-4 space-y-1">
                      <li>Your Aadhaar and medical identity documents have been securely stored with AES-256-GCM encryption.</li>
                      <li>A hospital administrator or system administrator must verify your credentials before your account is approved.</li>
                      <li>Once approved, your ECC cryptographic key pair will be sealed and you will be permitted to sign in.</li>
                    </ul>
                  </div>

                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setRegSuccess(false);
                        setActiveTab('login');
                      }}
                      className="w-full py-2.5 px-4 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-semibold text-sm transition-colors cursor-pointer"
                    >
                      Return to Sign In
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleRegisterSubmit} className="space-y-4">
                  {/* Server error message display */}
                  {regServerError && (
                    <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-start gap-2.5">
                      <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-bold">Registration Failed</div>
                        <div className="font-medium text-xs mt-0.5">{regServerError}</div>
                      </div>
                    </div>
                  )}

                  {/* Simulation Helper Drawer (only on registration when enabled) */}
                  {simulationMode && simulationIdentities.length > 0 && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900">
                          <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                          <span>Synthetic Research Test Personas</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowSimDrawer(!showSimDrawer)}
                          className="text-[11px] font-semibold text-amber-800 hover:text-amber-950 cursor-pointer"
                        >
                          {showSimDrawer ? 'Hide Personas' : 'Show Personas'}
                        </button>
                      </div>
                      {showSimDrawer && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
                          {simulationIdentities.slice(0, 4).map((id) => (
                            <button
                              key={id.aadhaar}
                              type="button"
                              onClick={() => handleApplySimIdentity(id)}
                              className="p-2 rounded-lg bg-white border border-amber-200 text-left hover:border-amber-400 hover:bg-amber-100/50 transition-colors cursor-pointer text-xs"
                            >
                              <div className="font-bold text-slate-900">{id.fullName} <span className="font-normal text-slate-500 text-[10px]">({id.role})</span></div>
                              <div className="text-[10px] text-slate-600 font-mono">{id.aadhaar}</div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 1. Full Name */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                      Full Name *
                    </label>
                    <div className="relative">
                      <UserIcon className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                      <input
                        type="text"
                        value={regFullName}
                        onChange={(e) => setRegFullName(e.target.value)}
                        placeholder="e.g. Dr. Priya Patel or Aarav Sharma"
                        className={`w-full pl-9 pr-3.5 py-2 rounded-lg border text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500 ${
                          regErrors.fullName ? 'border-rose-400 bg-rose-50/20' : 'border-slate-300'
                        }`}
                      />
                    </div>
                    {regErrors.fullName && (
                      <p className="text-xs text-rose-600 mt-1 font-medium">{regErrors.fullName}</p>
                    )}
                  </div>

                  {/* 2. Email */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                      Email Address *
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                      <input
                        type="email"
                        value={regEmail}
                        onChange={(e) => setRegEmail(e.target.value)}
                        placeholder="doctor@hospital.org"
                        className={`w-full pl-9 pr-3.5 py-2 rounded-lg border text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500 ${
                          regErrors.email ? 'border-rose-400 bg-rose-50/20' : 'border-slate-300'
                        }`}
                      />
                    </div>
                    {regErrors.email && (
                      <p className="text-xs text-rose-600 mt-1 font-medium">{regErrors.email}</p>
                    )}
                  </div>

                  {/* 3. Password with LIVE RULE HINT */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                      Password *
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                      <input
                        type="password"
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                        placeholder="Create a strong password"
                        className={`w-full pl-9 pr-3.5 py-2 rounded-lg border text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500 ${
                          regErrors.password ? 'border-rose-400 bg-rose-50/20' : 'border-slate-300'
                        }`}
                      />
                    </div>
                    {/* Live Rule Hint */}
                    <div className="mt-1.5 flex items-center gap-1.5 text-xs">
                      <div
                        className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
                          isPasswordValid
                            ? 'bg-emerald-100 text-emerald-600'
                            : 'bg-slate-100 text-slate-400'
                        }`}
                      >
                        {isPasswordValid ? <Check className="w-3 h-3" /> : <Info className="w-3 h-3" />}
                      </div>
                      <span
                        className={`font-medium ${
                          isPasswordValid ? 'text-emerald-700 font-semibold' : 'text-slate-500'
                        }`}
                      >
                        10+ characters with a letter and a number
                      </span>
                    </div>
                    {regErrors.password && (
                      <p className="text-xs text-rose-600 mt-1 font-medium">{regErrors.password}</p>
                    )}
                  </div>

                  {/* 4. Role & Hospital Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                        Account Role *
                      </label>
                      <select
                        value={regRole}
                        onChange={(e) => setRegRole(e.target.value as any)}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                      >
                        <option value="PATIENT">Patient</option>
                        <option value="DOCTOR">Doctor</option>
                        <option value="HOSPITAL_ADMIN">Hospital Administrator</option>
                        <option value="SYSTEM_ADMIN">System Administrator</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                        Hospital Affiliation
                      </label>
                      <div className="relative">
                        <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                        <select
                          value={regHospitalId}
                          onChange={(e) => setRegHospitalId(e.target.value)}
                          className="w-full pl-9 pr-3.5 py-2 rounded-lg border border-slate-300 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                        >
                          {hospitals.map((h) => (
                            <option key={h.id} value={h.id}>
                              {h.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* 5. Department (Doctors only) */}
                  {regRole === 'DOCTOR' && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                        Medical Department *
                      </label>
                      <select
                        value={regDepartmentId}
                        onChange={(e) => setRegDepartmentId(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                      >
                        {departments.length > 0 ? (
                          departments.map((d) => (
                            <option key={d.id} value={d.name}>
                              {d.name}
                            </option>
                          ))
                        ) : (
                          <>
                            <option value="Cardiology">Cardiology</option>
                            <option value="General Medicine">General Medicine</option>
                            <option value="Oncology">Oncology</option>
                          </>
                        )}
                      </select>
                    </div>
                  )}

                  {/* 6. Aadhaar Number */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                      Aadhaar Identity Number *
                    </label>
                    <input
                      type="text"
                      value={regAadhaar}
                      onChange={(e) => setRegAadhaar(e.target.value)}
                      placeholder={simulationMode ? 'TEST-AADHAAR-0002 or 12-digit number' : '12-digit Aadhaar number'}
                      className={`w-full px-3.5 py-2 rounded-lg border text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500 ${
                        regErrors.aadhaar ? 'border-rose-400 bg-rose-50/20' : 'border-slate-300'
                      }`}
                    />
                    {regErrors.aadhaar && (
                      <p className="text-xs text-rose-600 mt-1 font-medium">{regErrors.aadhaar}</p>
                    )}
                  </div>

                  {/* 7. Doctor Medical Licence & File Picker */}
                  {regRole === 'DOCTOR' && (
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                      <div className="font-semibold text-xs text-slate-900 flex items-center gap-1.5">
                        <FileText className="w-4 h-4 text-teal-600" />
                        Doctor Medical Licence Verification
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Medical Licence Number *
                        </label>
                        <input
                          type="text"
                          value={regLicenseNumber}
                          onChange={(e) => setRegLicenseNumber(e.target.value)}
                          placeholder="e.g. TEST-MED-LIC-0001 or MCI-12345"
                          className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                        />
                        {regErrors.licenseNumber && (
                          <p className="text-xs text-rose-600 mt-1 font-medium">{regErrors.licenseNumber}</p>
                        )}
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Licence Document (PDF, JPG, PNG) *
                        </label>
                        <div className="flex items-center gap-2">
                          <label
                            htmlFor={fileInputId}
                            className="px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 flex items-center gap-1.5 cursor-pointer"
                          >
                            <Upload className="w-3.5 h-3.5 text-slate-500" />
                            {regFile ? 'Change File' : 'Choose Document'}
                          </label>
                          <input
                            id={fileInputId}
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                            onChange={handleFileChange}
                            className="sr-only"
                          />
                          <span className="text-xs text-slate-600 truncate max-w-[240px]">
                            {regFile ? regFile.name : 'No document selected'}
                          </span>
                        </div>
                        {regErrors.file && (
                          <p className="text-xs text-rose-600 mt-1 font-medium">{regErrors.file}</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 8. Hospital Admin Authorization Letter & File Picker */}
                  {regRole === 'HOSPITAL_ADMIN' && (
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                      <div className="font-semibold text-xs text-slate-900 flex items-center gap-1.5">
                        <FileText className="w-4 h-4 text-teal-600" />
                        Hospital Administrator Authorization
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Authorization Code *
                        </label>
                        <input
                          type="text"
                          value={regAuthCode}
                          onChange={(e) => setRegAuthCode(e.target.value)}
                          placeholder="e.g. HOSP-ADMIN-AUTH-001"
                          className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                        />
                        {regErrors.authCode && (
                          <p className="text-xs text-rose-600 mt-1 font-medium">{regErrors.authCode}</p>
                        )}
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Authorization Letter (PDF only) *
                        </label>
                        <div className="flex items-center gap-2">
                          <label
                            htmlFor={fileInputId}
                            className="px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 flex items-center gap-1.5 cursor-pointer"
                          >
                            <Upload className="w-3.5 h-3.5 text-slate-500" />
                            {regFile ? 'Change PDF' : 'Choose PDF Document'}
                          </label>
                          <input
                            id={fileInputId}
                            type="file"
                            accept=".pdf,application/pdf"
                            onChange={handleFileChange}
                            className="sr-only"
                          />
                          <span className="text-xs text-slate-600 truncate max-w-[240px]">
                            {regFile ? regFile.name : 'No PDF selected'}
                          </span>
                        </div>
                        {regErrors.file && (
                          <p className="text-xs text-rose-600 mt-1 font-medium">{regErrors.file}</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 9. Requested Permissions */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                      Requested Data Access Permissions
                    </label>
                    <div className="space-y-1.5">
                      {AVAILABLE_PERMISSIONS.map((perm) => (
                        <label
                          key={perm.id}
                          className="flex items-center space-x-2 text-xs text-slate-700 hover:text-slate-900 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={regPermissions.includes(perm.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setRegPermissions([...regPermissions, perm.id]);
                              } else {
                                setRegPermissions(regPermissions.filter((p) => p !== perm.id));
                              }
                            }}
                            className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                          />
                          <span>{perm.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Submit Button */}
                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={regLoading}
                      className="w-full py-2.5 px-4 rounded-lg bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 text-white font-semibold text-sm shadow-sm transition-colors flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {regLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Registering Account...
                        </>
                      ) : (
                        'Register Account'
                      )}
                    </button>
                  </div>

                  <div className="text-center pt-1">
                    <button
                      type="button"
                      onClick={() => setActiveTab('login')}
                      className="text-xs font-semibold text-teal-600 hover:text-teal-800"
                    >
                      Already have an account? Sign In
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
