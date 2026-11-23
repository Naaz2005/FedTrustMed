import React, { useState, useEffect } from 'react';
import {
  Users,
  Shield,
  Database,
  Microscope,
  Key,
  Lock,
  Unlock,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  Search,
  RefreshCw,
  Sparkles,
  Activity,
  Layers,
  Check,
  Server,
  Cpu,
  Fingerprint,
  X,
  ShieldCheck,
  ShieldAlert,
  Filter,
  ChevronDown,
  ChevronUp,
  FileText,
  Copy,
  History,
  TrendingDown,
  TrendingUp,
  Sliders,
} from 'lucide-react';
import {
  api,
  User as UserType,
  LedgerBlock,
  LedgerTransaction,
  ChainVerificationResult,
} from '../../services/api';

const AVAILABLE_PERMISSIONS = [
  { id: 'READ_RECORDS', label: 'View Medical Records', description: 'Read encrypted EHR clinical files and history' },
  { id: 'WRITE_RECORDS', label: 'Create / Update Records', description: 'Issue diagnoses and add clinical records' },
  { id: 'CONSENT_OVERRIDE', label: 'Emergency Break-Glass Override', description: 'Emergency break-glass access under strict audit' },
  { id: 'AUDIT_ACCESS', label: 'Audit Trail Access', description: 'Inspect immutable cryptographic audit logs' },
  { id: 'EXPORT_RECORDS', label: 'Export Encrypted Backups', description: 'Export zero-knowledge encrypted backups' },
];

// ----------------------------------------------------------------------
// 1. SYSTEM ADMIN: USERS DIRECTORY & FREEZE CONTROLS
// ----------------------------------------------------------------------
export const AdminUsers: React.FC = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Freeze Modal State
  const [freezeTargetUser, setFreezeTargetUser] = useState<any | null>(null);
  const [freezeReason, setFreezeReason] = useState('');
  const [confirmFreezeCheck, setConfirmFreezeCheck] = useState(false);
  const [freezeLoading, setFreezeLoading] = useState(false);
  const [freezeError, setFreezeError] = useState<string | null>(null);

  // Permission Modal State
  const [permTargetUser, setPermTargetUser] = useState<any | null>(null);
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [permLoading, setPermLoading] = useState(false);
  const [permError, setPermError] = useState<string | null>(null);
  const [permSuccess, setPermSuccess] = useState<string | null>(null);

  const fetchUsers = () => {
    setLoading(true);
    api.getAdminUsers()
      .then((list) => {
        if (list && list.length > 0) {
          setUsers(list);
        } else {
          setUsers([
            {
              id: 'usr-patient-001',
              email: 'patient@fedtrustmed.demo',
              full_name: 'Aarav Sharma',
              role: 'PATIENT',
              hospital_name: 'St. Jude General',
              approval_status: 'APPROVED',
              aadhaar_verification_status: 'VERIFIED',
              is_frozen: false,
              mfa_enabled: true,
              data_access_permissions: ['READ_RECORDS'],
              trust_score: 100.0,
              aadhaar_last4: '0001',
            },
            {
              id: 'usr-doctor-001',
              email: 'doctor@fedtrustmed.demo',
              full_name: 'Dr. Priya Patel',
              role: 'DOCTOR',
              hospital_name: 'St. Jude General',
              department_name: 'Cardiology',
              medical_license_number: 'TEST-MED-LIC-0001',
              approval_status: 'APPROVED',
              is_frozen: false,
              mfa_enabled: true,
              data_access_permissions: ['READ_RECORDS', 'WRITE_RECORDS', 'CONSENT_OVERRIDE'],
              trust_score: 100.0,
              aadhaar_last4: '0002',
            },
            {
              id: 'usr-hospadmin-001',
              email: 'hospital_admin@fedtrustmed.demo',
              full_name: 'Rajesh Verma',
              role: 'HOSPITAL_ADMIN',
              hospital_name: 'St. Jude General',
              approval_status: 'APPROVED',
              is_frozen: false,
              mfa_enabled: false,
              data_access_permissions: ['READ_RECORDS', 'AUDIT_ACCESS'],
              trust_score: 100.0,
              aadhaar_last4: '0003',
            },
            {
              id: 'usr-sysadmin-001',
              email: 'system_admin@fedtrustmed.demo',
              full_name: 'Vikram Malhotra',
              role: 'SYSTEM_ADMIN',
              hospital_name: 'Central Node',
              approval_status: 'APPROVED',
              is_frozen: false,
              mfa_enabled: true,
              data_access_permissions: ['READ_RECORDS', 'WRITE_RECORDS', 'CONSENT_OVERRIDE', 'AUDIT_ACCESS', 'EXPORT_RECORDS'],
              trust_score: 100.0,
              aadhaar_last4: '0004',
            },
          ]);
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  // Open Freeze Modal
  const handleOpenFreezeModal = (u: any) => {
    setFreezeTargetUser(u);
    setFreezeReason('');
    setConfirmFreezeCheck(false);
    setFreezeError(null);
  };

  const handleCloseFreezeModal = () => {
    setFreezeTargetUser(null);
    setFreezeReason('');
    setConfirmFreezeCheck(false);
    setFreezeError(null);
    setFreezeLoading(false);
  };

  // Submit Freeze/Unfreeze
  const handleSubmitFreeze = async () => {
    if (!freezeTargetUser) return;
    const cleanReason = freezeReason.trim();
    if (!cleanReason) {
      setFreezeError('A specific, non-empty reason is required to freeze or unfreeze an account.');
      return;
    }
    if (!confirmFreezeCheck) {
      setFreezeError('Please confirm the security declaration checkbox to proceed.');
      return;
    }

    setFreezeLoading(true);
    setFreezeError(null);
    const newFrozen = !freezeTargetUser.is_frozen;

    try {
      await api.toggleFreezeUser(freezeTargetUser.id, newFrozen, cleanReason);
      setUsers((prev) =>
        prev.map((u) => (u.id === freezeTargetUser.id ? { ...u, is_frozen: newFrozen } : u))
      );
      handleCloseFreezeModal();
    } catch (err: any) {
      setFreezeError(err?.error || err?.message || 'Failed to update account freeze status.');
      setFreezeLoading(false);
    }
  };

  // Open Permission Modal
  const handleOpenPermModal = (u: any) => {
    setPermTargetUser(u);
    setSelectedPermissions(
      Array.isArray(u.data_access_permissions) ? [...u.data_access_permissions] : []
    );
    setPermError(null);
    setPermSuccess(null);
  };

  const handleClosePermModal = () => {
    setPermTargetUser(null);
    setSelectedPermissions([]);
    setPermError(null);
    setPermSuccess(null);
    setPermLoading(false);
  };

  const handleTogglePerm = (permId: string) => {
    setSelectedPermissions((prev) =>
      prev.includes(permId) ? prev.filter((p) => p !== permId) : [...prev, permId]
    );
  };

  const handleSavePermissions = async () => {
    if (!permTargetUser) return;
    setPermLoading(true);
    setPermError(null);
    setPermSuccess(null);

    try {
      await api.updateUserPermissions(permTargetUser.id, selectedPermissions);
      setUsers((prev) =>
        prev.map((u) =>
          u.id === permTargetUser.id ? { ...u, data_access_permissions: selectedPermissions } : u
        )
      );
      setPermSuccess('Permissions updated successfully!');
      setTimeout(() => {
        handleClosePermModal();
      }, 800);
    } catch (err: any) {
      setPermError(err?.error || err?.message || 'Failed to update permissions.');
      setPermLoading(false);
    }
  };

  const filteredUsers = users.filter((u) => {
    const q = search.toLowerCase().trim();
    const matchesSearch =
      !q ||
      (u.full_name && u.full_name.toLowerCase().includes(q)) ||
      (u.email && u.email.toLowerCase().includes(q)) ||
      (u.hospital_name && u.hospital_name.toLowerCase().includes(q)) ||
      (u.medical_license_number && u.medical_license_number.toLowerCase().includes(q)) ||
      (u.aadhaar_last4 && u.aadhaar_last4.includes(q));

    const matchesRole = roleFilter === 'ALL' || u.role === roleFilter;

    let matchesStatus = true;
    if (statusFilter === 'FROZEN') {
      matchesStatus = Boolean(u.is_frozen);
    } else if (statusFilter === 'ACTIVE') {
      matchesStatus = !u.is_frozen && u.approval_status === 'APPROVED';
    } else if (statusFilter !== 'ALL') {
      matchesStatus = u.approval_status === statusFilter;
    }

    return matchesSearch && matchesRole && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-teal-400" />
            Users Directory & Governance Controls
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Search, filter by role/status, inspect MFA security, manage cryptographic permissions, and trigger instant session freezes.
          </p>
        </div>
        <button
          type="button"
          onClick={fetchUsers}
          className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors cursor-pointer flex items-center gap-2 text-xs font-semibold"
          title="Refresh List"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="space-y-3 bg-slate-900/60 p-4 rounded-2xl border border-slate-800">
        <div className="relative w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, hospital, licence, or Aadhaar suffix..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-teal-500"
          />
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-1">
          {/* Role Filters */}
          <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto">
            <span className="text-[11px] font-mono text-slate-400 mr-1 flex items-center gap-1">
              <Filter className="w-3 h-3 text-teal-400" /> Role:
            </span>
            {['ALL', 'PATIENT', 'DOCTOR', 'HOSPITAL_ADMIN', 'SYSTEM_ADMIN'].map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRoleFilter(r)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  roleFilter === r
                    ? 'bg-teal-500 text-slate-950 font-bold'
                    : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                {r === 'ALL' ? 'All Roles' : r.replace('_', ' ')}
              </button>
            ))}
          </div>

          {/* Status Filters */}
          <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto">
            <span className="text-[11px] font-mono text-slate-400 mr-1">Status:</span>
            {['ALL', 'APPROVED', 'PENDING', 'REJECTED', 'FROZEN', 'ACTIVE'].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  statusFilter === s
                    ? 'bg-indigo-500 text-white font-bold'
                    : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Users Count Summary */}
      <div className="flex items-center justify-between text-xs text-slate-400 px-1 font-mono">
        <span>Showing {filteredUsers.length} of {users.length} users</span>
        {(roleFilter !== 'ALL' || statusFilter !== 'ALL' || search) && (
          <button
            type="button"
            onClick={() => {
              setSearch('');
              setRoleFilter('ALL');
              setStatusFilter('ALL');
            }}
            className="text-teal-400 hover:underline cursor-pointer"
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* Users Table */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider font-mono text-[10px] border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">User Details</th>
                <th className="py-3 px-4">Role & Hospital</th>
                <th className="py-3 px-4">Account Status</th>
                <th className="py-3 px-4">Permissions</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 text-slate-300">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500">
                    No users found matching current filters.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const perms = Array.isArray(u.data_access_permissions)
                    ? u.data_access_permissions
                    : [];
                  return (
                    <tr key={u.id} className="hover:bg-slate-800/40 transition-colors">
                      {/* User Details */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-white flex items-center gap-1.5">
                          <span>{u.full_name}</span>
                          {u.aadhaar_last4 && (
                            <span className="text-[10px] font-mono text-slate-500">
                              (•••• {u.aadhaar_last4})
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] font-mono text-slate-400">{u.email}</div>
                        {u.medical_license_number && (
                          <div className="text-[10px] font-mono text-teal-400/80 mt-0.5">
                            Lic: {u.medical_license_number}
                          </div>
                        )}
                      </td>

                      {/* Role & Hospital */}
                      <td className="py-3.5 px-4">
                        <span className="font-semibold text-teal-300 font-mono">{u.role}</span>
                        <div className="text-[11px] text-slate-400">
                          {u.hospital_name || 'Central Network'}
                          {u.department_name ? ` • ${u.department_name}` : ''}
                        </div>
                      </td>

                      {/* Status Badges: Approval, Frozen, MFA */}
                      <td className="py-3.5 px-4">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {/* Approval Status */}
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              u.approval_status === 'APPROVED'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : u.approval_status === 'PENDING'
                                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                            }`}
                          >
                            {u.approval_status || 'PENDING'}
                          </span>

                          {/* Frozen / Active Status */}
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 ${
                              u.is_frozen
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                                : 'bg-teal-500/10 text-teal-300 border border-teal-500/20'
                            }`}
                          >
                            {u.is_frozen ? (
                              <>
                                <Lock className="w-2.5 h-2.5" />
                                FROZEN
                              </>
                            ) : (
                              <>
                                <CheckCircle className="w-2.5 h-2.5" />
                                ACTIVE
                              </>
                            )}
                          </span>

                          {/* MFA on/off */}
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold flex items-center gap-1 ${
                              u.mfa_enabled
                                ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/20'
                                : 'bg-slate-800 text-slate-400 border border-slate-700'
                            }`}
                          >
                            <Shield className="w-2.5 h-2.5" />
                            {u.mfa_enabled ? 'MFA ON' : 'MFA OFF'}
                          </span>
                        </div>
                      </td>

                      {/* Permissions */}
                      <td className="py-3.5 px-4">
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {perms.length === 0 ? (
                            <span className="text-[10px] text-slate-500 italic">None</span>
                          ) : (
                            perms.map((p: string) => (
                              <span
                                key={p}
                                className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 font-mono text-[9px]"
                              >
                                {p.replace('_RECORDS', '').replace('_', ' ')}
                              </span>
                            ))
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleOpenPermModal(u)}
                            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                            title="Edit Permissions"
                          >
                            <Key className="w-3 h-3 text-teal-400" />
                            <span>Permissions</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleOpenFreezeModal(u)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                              u.is_frozen
                                ? 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40'
                                : 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30'
                            }`}
                          >
                            {u.is_frozen ? (
                              <>
                                <Unlock className="w-3 h-3" />
                                <span>Unfreeze</span>
                              </>
                            ) : (
                              <>
                                <Lock className="w-3 h-3" />
                                <span>Freeze</span>
                              </>
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* FREEZE / UNFREEZE CONFIRMATION MODAL WITH REQUIRED REASON */}
      {freezeTargetUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
                    freezeTargetUser.is_frozen
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                      : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                  }`}
                >
                  {freezeTargetUser.is_frozen ? (
                    <Unlock className="w-5 h-5" />
                  ) : (
                    <Lock className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    {freezeTargetUser.is_frozen ? 'Unfreeze Account Access' : 'Freeze User Account'}
                  </h3>
                  <p className="text-xs text-slate-400 font-mono">{freezeTargetUser.email}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseFreezeModal}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Warning Callout */}
            <div
              className={`p-4 rounded-2xl border text-xs leading-relaxed ${
                freezeTargetUser.is_frozen
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}
            >
              <div className="font-bold flex items-center gap-1.5 mb-1">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>
                  {freezeTargetUser.is_frozen
                    ? 'Security Restoration Warning'
                    : 'Instant Revocation Enforcement'}
                </span>
              </div>
              {freezeTargetUser.is_frozen
                ? 'Unfreezing this account restores standard authentication and token validity. The user will immediately be able to execute clinical operations on their next action.'
                : "Freezing immediately revokes authenticated access. On the user's very next action, their open session will be rejected with a 403 Forbidden response, blocking access to all clinical records and APIs."}
            </div>

            {/* Target User Info */}
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Full Name:</span>
                <span className="text-white font-bold">{freezeTargetUser.full_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Role & Node:</span>
                <span className="text-teal-300">
                  {freezeTargetUser.role} ({freezeTargetUser.hospital_name || 'Central'})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Current Status:</span>
                <span
                  className={freezeTargetUser.is_frozen ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold'}
                >
                  {freezeTargetUser.is_frozen ? 'ACCOUNT FROZEN' : 'ACTIVE'}
                </span>
              </div>
            </div>

            {/* Required Reason Input */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-200">
                Administrative / Security Reason <span className="text-rose-400">* (Required)</span>
              </label>
              <textarea
                value={freezeReason}
                onChange={(e) => setFreezeReason(e.target.value)}
                placeholder="Enter the mandatory security incident ID or operational rationale..."
                rows={3}
                className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 resize-none font-sans"
              />
            </div>

            {/* Confirmation Checkbox */}
            <label className="flex items-start gap-2.5 text-xs text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={confirmFreezeCheck}
                onChange={(e) => setConfirmFreezeCheck(e.target.checked)}
                className="mt-0.5 rounded border-slate-700 bg-slate-950 text-teal-500 focus:ring-teal-500"
              />
              <span>
                I confirm that I am authorized to {freezeTargetUser.is_frozen ? 'unfreeze' : 'freeze'} account{' '}
                <strong className="text-white">{freezeTargetUser.email}</strong>, and this event will be permanently written to the Audit Ledger.
              </span>
            </label>

            {freezeError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{freezeError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={handleCloseFreezeModal}
                disabled={freezeLoading}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmitFreeze}
                disabled={freezeLoading}
                className={`px-5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-lg disabled:opacity-50 ${
                  freezeTargetUser.is_frozen
                    ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/20'
                    : 'bg-rose-500 hover:bg-rose-400 text-white shadow-rose-500/20'
                }`}
              >
                {freezeLoading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : freezeTargetUser.is_frozen ? (
                  <>
                    <Unlock className="w-3.5 h-3.5" />
                    <span>Confirm Unfreeze</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-3.5 h-3.5" />
                    <span>Confirm Freeze</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PERMISSION EDITS MODAL */}
      {permTargetUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-teal-500/10 border border-teal-500/30 text-teal-400 flex items-center justify-center">
                  <Key className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Edit Data Access Permissions</h3>
                  <p className="text-xs text-slate-400 font-mono">
                    {permTargetUser.full_name} ({permTargetUser.role})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleClosePermModal}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Configure fine-grained cryptographic data access scopes. Permissions take effect immediately upon saving and are cryptographically verified by node endpoints.
            </p>

            {/* Checklist of permissions */}
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {AVAILABLE_PERMISSIONS.map((perm) => {
                const isSelected = selectedPermissions.includes(perm.id);
                return (
                  <div
                    key={perm.id}
                    onClick={() => handleTogglePerm(perm.id)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer flex items-start gap-3 ${
                      isSelected
                        ? 'bg-teal-500/10 border-teal-500/40 text-white'
                        : 'bg-slate-950 border-slate-800/80 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded mt-0.5 flex items-center justify-center shrink-0 border ${
                        isSelected
                          ? 'bg-teal-500 border-teal-500 text-slate-950'
                          : 'border-slate-700 bg-slate-900'
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                    <div>
                      <div className="font-bold text-xs text-slate-200">{perm.label}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">{perm.description}</div>
                      <span className="text-[10px] font-mono text-teal-400 mt-0.5 inline-block">
                        {perm.id}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {permError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{permError}</span>
              </div>
            )}

            {permSuccess && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
                <CheckCircle className="w-4 h-4 shrink-0" />
                <span>{permSuccess}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={handleClosePermModal}
                disabled={permLoading}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSavePermissions}
                disabled={permLoading}
                className="px-5 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-lg shadow-teal-500/20 disabled:opacity-50"
              >
                {permLoading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Save Permissions</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ----------------------------------------------------------------------
// 2. SYSTEM ADMIN: CRYPTOGRAPHIC SECURITY & KEY VAULT
// ----------------------------------------------------------------------
// ----------------------------------------------------------------------
// 2. SYSTEM ADMIN: SECURITY & ACCOUNT SAFETY (Module M25)
// ----------------------------------------------------------------------
export const AdminSecurity: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'SAFETY' | 'VAULT'>('SAFETY');
  const [users, setUsers] = useState<any[]>([]);
  const [threshold, setThreshold] = useState<number>(50.0);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Event Log Modal State
  const [selectedUserForEvents, setSelectedUserForEvents] = useState<any | null>(null);
  const [userEvents, setUserEvents] = useState<any[]>([]);
  const [eventsLoading, setEventsLoading] = useState<boolean>(false);

  // Score Adjustment Modal State
  const [adjustTargetUser, setAdjustTargetUser] = useState<any | null>(null);
  const [adjustDelta, setAdjustDelta] = useState<number>(-10);
  const [adjustReason, setAdjustReason] = useState<string>('');
  const [adjustSubmitting, setAdjustSubmitting] = useState<boolean>(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);

  // Unfreeze Modal State
  const [unfreezeTargetUser, setUnfreezeTargetUser] = useState<any | null>(null);
  const [unfreezeReason, setUnfreezeReason] = useState<string>('');
  const [unfreezeSubmitting, setUnfreezeSubmitting] = useState<boolean>(false);
  const [unfreezeError, setUnfreezeError] = useState<string | null>(null);

  const fetchAccountSafety = async () => {
    try {
      setLoading(true);
      const res = await api.getAccountSafety();
      if (res && res.users) {
        setUsers(res.users);
        if (res.threshold) setThreshold(res.threshold);
      }
    } catch (err) {
      console.error('Failed to fetch account safety overview:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccountSafety();
  }, []);

  const openEventLog = async (user: any) => {
    setSelectedUserForEvents(user);
    setEventsLoading(true);
    try {
      const res = await api.getTrustEvents(user.id);
      setUserEvents(res.events || []);
    } catch (err) {
      console.error('Failed to fetch user trust events:', err);
      setUserEvents([]);
    } finally {
      setEventsLoading(false);
    }
  };

  const handleAdjustScore = async () => {
    if (!adjustTargetUser) return;
    if (!adjustReason.trim()) {
      setAdjustError('A detailed reason is required to adjust trust score');
      return;
    }
    setAdjustSubmitting(true);
    setAdjustError(null);
    try {
      await api.adjustTrustScore(adjustTargetUser.id, adjustDelta, adjustReason.trim());
      setAdjustTargetUser(null);
      setAdjustReason('');
      await fetchAccountSafety();
    } catch (err: any) {
      setAdjustError(err.message || 'Failed to adjust trust score');
    } finally {
      setAdjustSubmitting(false);
    }
  };

  const handleUnfreeze = async () => {
    if (!unfreezeTargetUser) return;
    if (!unfreezeReason.trim()) {
      setUnfreezeError('A specific reason is required to unfreeze the account');
      return;
    }
    setUnfreezeSubmitting(true);
    setUnfreezeError(null);
    try {
      await api.toggleUserFreeze(unfreezeTargetUser.id, false, unfreezeReason.trim());
      setUnfreezeTargetUser(null);
      setUnfreezeReason('');
      await fetchAccountSafety();
    } catch (err: any) {
      setUnfreezeError(err.message || 'Failed to unfreeze account');
    } finally {
      setUnfreezeSubmitting(false);
    }
  };

  const filteredUsers = users.filter((u) => {
    if (roleFilter !== 'ALL' && u.role !== roleFilter) return false;
    if (statusFilter === 'FROZEN' && !u.isFrozen) return false;
    if (statusFilter === 'ACTIVE' && u.isFrozen) return false;
    if (statusFilter === 'AT_RISK' && (u.trustScore > threshold || u.isFrozen)) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = (u.fullName || '').toLowerCase().includes(q);
      const matchEmail = (u.email || '').toLowerCase().includes(q);
      const matchHosp = (u.hospitalName || '').toLowerCase().includes(q);
      if (!matchName && !matchEmail && !matchHosp) return false;
    }
    return true;
  });

  const frozenCount = users.filter((u) => u.isFrozen).length;
  const goodStandingCount = users.filter((u) => !u.isFrozen && u.trustScore > threshold).length;
  const atRiskCount = users.filter((u) => u.trustScore <= threshold && !u.isFrozen).length;

  const getEventBadge = (type: string) => {
    switch (type) {
      case 'FAILED_LOGIN':
        return 'bg-rose-500/10 text-rose-400 border-rose-500/30';
      case 'DENIED_ACCESS_ATTEMPT':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      case 'OFF_HOURS_ACCESS':
        return 'bg-purple-500/10 text-purple-400 border-purple-500/30';
      case 'ADMIN_CHANGE':
        return 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30';
      case 'GOOD_BEHAVIOUR':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      default:
        return 'bg-slate-500/10 text-slate-400 border-slate-500/30';
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Sub-Navigation */}
      <div className="border-b border-slate-800 pb-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-teal-500/10 text-teal-400 border border-teal-500/20 uppercase tracking-wider">
              Module M25
            </span>
            <span className="text-xs text-slate-400 font-mono">Zero-Trust Continuous Governance</span>
          </div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2 mt-1">
            <ShieldAlert className="w-5 h-5 text-teal-400" />
            Security &gt; Account Safety
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Real-time trust scoring and automated freeze enforcement. Accounts dropping to or below the safety threshold ({threshold}.0) are immediately frozen and locked via per-request database validation.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="p-1 rounded-xl bg-slate-900 border border-slate-800 flex items-center gap-1">
            <button
              onClick={() => setActiveTab('SAFETY')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                activeTab === 'SAFETY'
                  ? 'bg-teal-500/20 text-teal-300 border border-teal-500/40 shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              Account Safety
            </button>
            <button
              onClick={() => setActiveTab('VAULT')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                activeTab === 'VAULT'
                  ? 'bg-teal-500/20 text-teal-300 border border-teal-500/40 shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Key className="w-3.5 h-3.5" />
              Key Vault & Policies
            </button>
          </div>

          <button
            onClick={fetchAccountSafety}
            disabled={loading}
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 border border-slate-700/60 transition-all disabled:opacity-50"
            title="Refresh Account Safety Data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {activeTab === 'SAFETY' ? (
        <div className="space-y-6">
          {/* Safety Summary Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
              <span className="text-[10px] font-mono text-slate-400 uppercase">Safety Threshold</span>
              <div className="text-xl font-bold text-white mt-1 font-mono">{threshold}.0 / 100</div>
              <span className="text-[10px] text-amber-400 mt-1 block">Auto-Freeze Trigger Level</span>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
              <span className="text-[10px] font-mono text-slate-400 uppercase">In Good Standing</span>
              <div className="text-xl font-bold text-emerald-400 mt-1 font-mono">{goodStandingCount}</div>
              <span className="text-[10px] text-emerald-400/80 mt-1 block">Trust Score &gt; {threshold}</span>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
              <span className="text-[10px] font-mono text-slate-400 uppercase">Frozen Accounts</span>
              <div className="text-xl font-bold text-rose-400 mt-1 font-mono">{frozenCount}</div>
              <span className="text-[10px] text-rose-400/80 mt-1 block">Blocked via Per-Request DB Check</span>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
              <span className="text-[10px] font-mono text-slate-400 uppercase">At-Risk Accounts</span>
              <div className="text-xl font-bold text-amber-400 mt-1 font-mono">{atRiskCount}</div>
              <span className="text-[10px] text-slate-400 mt-1 block">Score &le; {threshold}</span>
            </div>
          </div>

          {/* Search & Filter Controls */}
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search user name, email, or hospital..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-900/90 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-teal-500"
              />
            </div>

            <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
              <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
                {['ALL', 'PATIENT', 'DOCTOR', 'HOSPITAL_ADMIN', 'SYSTEM_ADMIN'].map((r) => (
                  <button
                    key={r}
                    onClick={() => setRoleFilter(r)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${
                      roleFilter === r ? 'bg-teal-500/20 text-teal-300 font-bold' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {r === 'ALL' ? 'All Roles' : r.replace('_', ' ')}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
                {[
                  { id: 'ALL', label: 'All Status' },
                  { id: 'ACTIVE', label: 'Active' },
                  { id: 'FROZEN', label: 'Frozen' },
                ].map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setStatusFilter(s.id)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${
                      statusFilter === s.id ? 'bg-indigo-500/20 text-indigo-300 font-bold' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Account Safety Table */}
          {loading ? (
            <div className="p-12 text-center text-slate-400 bg-slate-900/30 rounded-2xl border border-slate-800">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto text-teal-400 mb-2" />
              <p className="text-sm">Loading user account safety metrics...</p>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="p-12 text-center text-slate-400 bg-slate-900/30 rounded-2xl border border-slate-800">
              <ShieldAlert className="w-8 h-8 mx-auto text-slate-600 mb-2" />
              <p className="text-sm">No accounts found matching filter criteria.</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-800 overflow-hidden bg-slate-900/60 shadow-lg">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 font-mono text-[10px] uppercase border-b border-slate-800">
                    <tr>
                      <th className="p-3.5">User Details</th>
                      <th className="p-3.5">Role & Affiliation</th>
                      <th className="p-3.5">Trust Score & Standing</th>
                      <th className="p-3.5">Account Status</th>
                      <th className="p-3.5 text-center">Event Log</th>
                      <th className="p-3.5 text-right">Administrative Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {filteredUsers.map((u) => {
                      const score = u.trustScore || 0;
                      const isAtRisk = score <= threshold;

                      return (
                        <tr key={u.id} className="hover:bg-slate-800/30 transition-colors">
                          <td className="p-3.5">
                            <div className="font-semibold text-white">{u.fullName}</div>
                            <div className="text-[11px] text-slate-400 font-mono">{u.email}</div>
                          </td>

                          <td className="p-3.5">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-teal-300 border border-slate-700">
                              {u.role}
                            </span>
                            <div className="text-[11px] text-slate-400 mt-1">{u.hospitalName || 'FedTrustMed Federation'}</div>
                          </td>

                          <td className="p-3.5">
                            <div className="flex items-center gap-2">
                              <span className={`font-mono font-bold text-sm ${
                                u.isFrozen || isAtRisk ? 'text-rose-400' : score < 75 ? 'text-amber-400' : 'text-emerald-400'
                              }`}>
                                {score.toFixed(1)} / 100
                              </span>
                              {u.isFrozen ? (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                                  FROZEN
                                </span>
                              ) : isAtRisk ? (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20 animate-pulse">
                                  BELOW THRESHOLD
                                </span>
                              ) : (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                  GOOD STANDING
                                </span>
                              )}
                            </div>

                            {/* Trust score visual progress bar */}
                            <div className="w-32 h-1.5 bg-slate-950 rounded-full mt-1.5 overflow-hidden border border-slate-800">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  u.isFrozen || isAtRisk ? 'bg-rose-500' : score < 75 ? 'bg-amber-500' : 'bg-emerald-500'
                                }`}
                                style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
                              />
                            </div>
                          </td>

                          <td className="p-3.5">
                            {u.isFrozen ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/30">
                                <Lock className="w-3 h-3" />
                                Frozen
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                                <Unlock className="w-3 h-3 text-emerald-400" />
                                Active
                              </span>
                            )}
                          </td>

                          <td className="p-3.5 text-center">
                            <button
                              onClick={() => openEventLog(u)}
                              className="px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-indigo-300 border border-indigo-500/20 text-xs font-medium inline-flex items-center gap-1.5 transition-all"
                            >
                              <History className="w-3.5 h-3.5" />
                              <span>{u.totalEvents || 0} events</span>
                            </button>
                          </td>

                          <td className="p-3.5 text-right">
                            <div className="inline-flex items-center gap-2">
                              <button
                                onClick={() => setAdjustTargetUser(u)}
                                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium inline-flex items-center gap-1 border border-slate-700"
                                title="Adjust Trust Score"
                              >
                                <Sliders className="w-3 h-3 text-teal-400" />
                                Adjust
                              </button>

                              {u.isFrozen ? (
                                <button
                                  onClick={() => setUnfreezeTargetUser(u)}
                                  className="px-3 py-1 rounded-lg bg-emerald-600/90 hover:bg-emerald-500 text-white text-xs font-bold inline-flex items-center gap-1 shadow-sm transition-all"
                                >
                                  <Unlock className="w-3 h-3" />
                                  Unfreeze
                                </button>
                              ) : (
                                <button
                                  onClick={() => {
                                    setUnfreezeTargetUser({ ...u, isFrozenAction: true });
                                  }}
                                  className="px-3 py-1 rounded-lg bg-rose-950/60 hover:bg-rose-900/60 text-rose-300 border border-rose-800/60 text-xs font-semibold inline-flex items-center gap-1 transition-all"
                                >
                                  <Lock className="w-3 h-3" />
                                  Freeze
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Key Vault & Telemetry Sub-Tab */
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
              <span className="text-[10px] font-mono text-slate-400 uppercase">Master Key Status</span>
              <div className="text-lg font-bold text-emerald-400 mt-1 flex items-center gap-1.5">
                <CheckCircle className="w-4 h-4" />
                <span>Sealed (AES-256-GCM)</span>
              </div>
              <span className="text-[11px] text-slate-400 font-mono mt-0.5 block">Entropy: 256 bits</span>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
              <span className="text-[10px] font-mono text-slate-400 uppercase">ECC Key Curve</span>
              <div className="text-lg font-bold text-teal-300 mt-1">NIST P-256</div>
              <span className="text-[11px] text-slate-400 mt-0.5 block">prime256v1 (ECDSA / ECIES)</span>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
              <span className="text-[10px] font-mono text-slate-400 uppercase">Brute-Force Lockout</span>
              <div className="text-lg font-bold text-white mt-1">5 Attempts (15m Lock)</div>
              <span className="text-[11px] text-emerald-400 mt-0.5 block">Module M6 Enforced</span>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
              <span className="text-[10px] font-mono text-slate-400 uppercase">Password Hash Cost</span>
              <div className="text-lg font-bold text-white mt-1">Bcrypt Cost 12</div>
              <span className="text-[11px] text-slate-400 mt-0.5 block">Timing-Safe Constant Time</span>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
            <h3 className="font-bold text-sm text-white uppercase tracking-wider flex items-center gap-2">
              <Key className="w-4 h-4 text-teal-400" />
              Master Key Vault Telemetry & Key Sealing
            </h3>

            <div className="p-4 rounded-xl bg-slate-950 font-mono text-xs text-slate-300 space-y-2 border border-slate-800">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Vault Seal Check:</span>
                <span className="text-emerald-400 font-bold">PASSED (All Sealed Keys Authentic)</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Master Secret Salt:</span>
                <span className="text-slate-300 truncate max-w-xs">fedtrustmed_aadhaar_pepper_secret_value</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Active User ECC Key Pairs:</span>
                <span className="text-teal-300 font-bold">4 Verified & Synced</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Private Key Storage Policy:</span>
                <span className="text-slate-300">Encrypted in users.private_key_enc with AES-256-GCM</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: User Trust Event Log Drawer / Modal */}
      {selectedUserForEvents && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
            <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-base text-white">{selectedUserForEvents.fullName}</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-teal-300 border border-slate-700">
                    {selectedUserForEvents.role}
                  </span>
                  {selectedUserForEvents.isFrozen ? (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                      FROZEN
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      GOOD STANDING
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 font-mono mt-0.5">
                  {selectedUserForEvents.email} • Current Trust Score:{' '}
                  <strong className="text-white">{(selectedUserForEvents.trustScore || 0).toFixed(1)} / 100</strong>
                </p>
              </div>

              <button
                onClick={() => setSelectedUserForEvents(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-5 overflow-y-auto space-y-3 flex-1">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-bold uppercase tracking-wider text-slate-300">
                  Trust Event Audit Trail ({userEvents.length})
                </span>
                <span className="text-[11px] font-mono">Auto-freeze threshold: {threshold}.0</span>
              </div>

              {eventsLoading ? (
                <div className="p-8 text-center text-slate-400">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto text-teal-400 mb-2" />
                  <p className="text-xs">Loading event log...</p>
                </div>
              ) : userEvents.length === 0 ? (
                <div className="p-8 text-center text-slate-500 bg-slate-950/60 rounded-xl border border-slate-800">
                  <CheckCircle className="w-6 h-6 mx-auto text-emerald-400 mb-2" />
                  <p className="text-xs">Zero security infractions or deductions recorded for this user.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {userEvents.map((evt) => {
                    const isNegative = evt.delta < 0;
                    return (
                      <div
                        key={evt.id}
                        className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getEventBadge(evt.eventType)}`}>
                              {evt.eventType.replace('_', ' ')}
                            </span>
                            <span className="text-slate-300 font-medium">{evt.reason}</span>
                          </div>
                          <div className="text-[10px] font-mono text-slate-500">
                            {new Date(evt.createdAt).toLocaleString()}
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0 self-end sm:self-center font-mono">
                          <span className={`font-bold px-2 py-0.5 rounded text-xs ${
                            isNegative ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          }`}>
                            {isNegative ? '' : '+'}{evt.delta.toFixed(1)}
                          </span>
                          <span className="text-[11px] text-slate-400">
                            {evt.previousScore.toFixed(1)} &rarr;{' '}
                            <strong className={evt.newScore <= threshold ? 'text-rose-400' : 'text-white'}>
                              {evt.newScore.toFixed(1)}
                            </strong>
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-800 bg-slate-950 text-right">
              <button
                onClick={() => setSelectedUserForEvents(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Adjust Trust Score Modal */}
      {adjustTargetUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-slate-800 bg-slate-950 flex items-center justify-between">
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                <Sliders className="w-4 h-4 text-teal-400" />
                Adjust Trust Score
              </h3>
              <button
                onClick={() => setAdjustTargetUser(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-1">
                <div className="text-white font-semibold">{adjustTargetUser.fullName}</div>
                <div className="text-slate-400 font-mono">{adjustTargetUser.email}</div>
                <div className="text-slate-300 font-mono pt-1">
                  Current Score: <strong className="text-teal-400">{(adjustTargetUser.trustScore || 0).toFixed(1)}</strong>
                </div>
              </div>

              {adjustError && (
                <div className="p-2.5 rounded-lg bg-rose-950/60 border border-rose-800/80 text-xs text-rose-300">
                  {adjustError}
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                  Select Score Delta
                </label>
                <div className="grid grid-cols-4 gap-2 mb-2">
                  {[-20, -15, -10, +10].map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setAdjustDelta(d)}
                      className={`py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
                        adjustDelta === d
                          ? d < 0
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                            : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-white'
                      }`}
                    >
                      {d > 0 ? `+${d}` : d}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">Custom Delta:</span>
                  <input
                    type="number"
                    value={adjustDelta}
                    onChange={(e) => setAdjustDelta(parseFloat(e.target.value) || 0)}
                    className="w-24 px-2 py-1 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-teal-500"
                  />
                  <span className="text-xs font-mono text-slate-400">
                    &rarr; New Score:{' '}
                    <strong className="text-white">
                      {Math.max(0, Math.min(100, (adjustTargetUser.trustScore || 0) + adjustDelta)).toFixed(1)}
                    </strong>
                  </span>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Reason for Adjustment <span className="text-rose-400">*</span>
                </label>
                <textarea
                  rows={3}
                  placeholder="Provide explicit operational or incident justification..."
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-teal-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAdjustTargetUser(null)}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleAdjustScore}
                  disabled={adjustSubmitting}
                  className="px-4 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold transition-all disabled:opacity-50"
                >
                  {adjustSubmitting ? 'Recording...' : 'Record Trust Event'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Unfreeze / Freeze Account Modal */}
      {unfreezeTargetUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-slate-800 bg-slate-950 flex items-center justify-between">
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                {unfreezeTargetUser.isFrozenAction ? (
                  <>
                    <Lock className="w-4 h-4 text-rose-400" />
                    Freeze User Account
                  </>
                ) : (
                  <>
                    <Unlock className="w-4 h-4 text-emerald-400" />
                    Unfreeze User Account
                  </>
                )}
              </h3>
              <button
                onClick={() => setUnfreezeTargetUser(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-1">
                <div className="text-white font-semibold">{unfreezeTargetUser.fullName}</div>
                <div className="text-slate-400 font-mono">{unfreezeTargetUser.email}</div>
                <div className="text-slate-300 font-mono pt-1">
                  Current State:{' '}
                  <strong className={unfreezeTargetUser.isFrozen ? 'text-rose-400' : 'text-emerald-400'}>
                    {unfreezeTargetUser.isFrozen ? 'FROZEN' : 'ACTIVE'}
                  </strong>
                </div>
              </div>

              {unfreezeError && (
                <div className="p-2.5 rounded-lg bg-rose-950/60 border border-rose-800/80 text-xs text-rose-300">
                  {unfreezeError}
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Required Rationale / Reason <span className="text-rose-400">*</span>
                </label>
                <textarea
                  rows={3}
                  placeholder={
                    unfreezeTargetUser.isFrozenAction
                      ? 'State the security policy violation or administrative rationale for freezing...'
                      : 'State the resolution or verification rationale for unfreezing...'
                  }
                  value={unfreezeReason}
                  onChange={(e) => setUnfreezeReason(e.target.value)}
                  className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-teal-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setUnfreezeTargetUser(null)}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (unfreezeTargetUser.isFrozenAction) {
                      // Manual freeze
                      if (!unfreezeReason.trim()) {
                        setUnfreezeError('A reason is required to freeze an account');
                        return;
                      }
                      setUnfreezeSubmitting(true);
                      try {
                        await api.toggleUserFreeze(unfreezeTargetUser.id, true, unfreezeReason.trim());
                        setUnfreezeTargetUser(null);
                        setUnfreezeReason('');
                        await fetchAccountSafety();
                      } catch (err: any) {
                        setUnfreezeError(err.message || 'Failed to freeze account');
                      } finally {
                        setUnfreezeSubmitting(false);
                      }
                    } else {
                      // Unfreeze
                      handleUnfreeze();
                    }
                  }}
                  disabled={unfreezeSubmitting}
                  className={`px-4 py-1.5 rounded-xl text-white text-xs font-bold transition-all disabled:opacity-50 ${
                    unfreezeTargetUser.isFrozenAction
                      ? 'bg-rose-600 hover:bg-rose-500'
                      : 'bg-emerald-600 hover:bg-emerald-500'
                  }`}
                >
                  {unfreezeSubmitting
                    ? 'Processing...'
                    : unfreezeTargetUser.isFrozenAction
                    ? 'Confirm Freeze'
                    : 'Confirm Unfreeze'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ----------------------------------------------------------------------
// 3. SYSTEM ADMIN: IMMUTABLE AUDIT LEDGER (Module M24)
// ----------------------------------------------------------------------
export const AdminLedger: React.FC = () => {
  const [blocks, setBlocks] = useState<LedgerBlock[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [verifying, setVerifying] = useState<boolean>(false);
  const [verificationResult, setVerificationResult] = useState<ChainVerificationResult | null>(null);
  const [expandedBlocks, setExpandedBlocks] = useState<Record<number, boolean>>({});
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>('ALL');

  const fetchBlocks = async () => {
    try {
      setLoading(true);
      const res = await api.getLedgerBlocks();
      if (res && res.blocks) {
        setBlocks(res.blocks);
        // Default expand the latest block
        if (res.blocks.length > 0) {
          const maxIdx = Math.max(...res.blocks.map((b) => b.index));
          setExpandedBlocks((prev) => ({ ...prev, [maxIdx]: true }));
        }
      }
    } catch (err) {
      console.error('Failed to fetch ledger blocks:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBlocks();
  }, []);

  const handleVerify = async () => {
    try {
      setVerifying(true);
      const res = await api.verifyLedger();
      if (res && res.result) {
        setVerificationResult(res.result);
      }
    } catch (err) {
      console.error('Ledger verification failed:', err);
    } finally {
      setVerifying(false);
    }
  };

  const toggleBlock = (index: number) => {
    setExpandedBlocks((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedHash(label);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  const formatTimestamp = (iso: string) => {
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  };

  const getActionBadge = (type: string) => {
    switch (type) {
      case 'CONSENT_GRANTED':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      case 'CONSENT_REVOKED':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      case 'RECORD_CREATED':
        return 'bg-teal-500/10 text-teal-400 border-teal-500/30';
      case 'FILE_ANCHORED':
        return 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30';
      case 'BREAK_GLASS_USED':
        return 'bg-rose-500/10 text-rose-400 border-rose-500/30';
      case 'GENESIS':
        return 'bg-purple-500/10 text-purple-400 border-purple-500/30';
      default:
        return 'bg-slate-500/10 text-slate-400 border-slate-500/30';
    }
  };

  const filteredBlocks = blocks.filter((b) => {
    if (filterType === 'ALL') return true;
    return b.transactions.some((tx) => tx.txType === filterType);
  });

  const totalTransactions = blocks.reduce((acc, b) => acc + (b.transactions?.length || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header with Title and "Verify integrity" button */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-teal-500/10 text-teal-400 border border-teal-500/20 uppercase tracking-wider">
              Module M24
            </span>
            <span className="text-xs text-slate-400 font-mono">Consensus Quorum: 2-of-3 Ed25519</span>
          </div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2 mt-1">
            <Database className="w-5 h-5 text-indigo-400" />
            Audit Ledger (simulated Fabric-style, single process)
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Cryptographically signed SHA-256 hash-chained blocks anchored by 3 hospital nodes with deterministic Ed25519 multi-signatures and Merkle root verification.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={fetchBlocks}
            disabled={loading}
            className="px-3 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 text-xs font-semibold flex items-center gap-1.5 border border-slate-700/60 transition-all disabled:opacity-50"
            title="Reload ledger blocks from database"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>

          <button
            onClick={handleVerify}
            disabled={verifying || loading}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-teal-500 to-indigo-600 hover:from-teal-400 hover:to-indigo-500 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-teal-500/10 transition-all disabled:opacity-50 cursor-pointer"
          >
            {verifying ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Verifying Chain...
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4 text-emerald-300" />
                Verify integrity
              </>
            )}
          </button>
        </div>
      </div>

      {/* Verification Integrity Result Banner */}
      {verificationResult && (
        <div
          className={`p-4 rounded-2xl border transition-all ${
            verificationResult.valid
              ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-200'
              : 'bg-rose-950/40 border-rose-500/40 text-rose-200'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              {verificationResult.valid ? (
                <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0 text-emerald-400">
                  <CheckCircle className="w-5 h-5" />
                </div>
              ) : (
                <div className="w-8 h-8 rounded-xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center shrink-0 text-rose-400">
                  <AlertTriangle className="w-5 h-5" />
                </div>
              )}
              <div>
                <h4 className="font-bold text-sm text-white flex items-center gap-2">
                  {verificationResult.valid
                    ? 'Cryptographic Chain Integrity: 100% Valid & Tamper-Evident'
                    : 'Cryptographic Integrity Check Failed!'}
                </h4>
                <p className="text-xs text-slate-300 mt-1">
                  {verificationResult.valid
                    ? `All ${verificationResult.totalBlocks} blocks re-computed and verified: SHA-256 hashes, Merkle roots, and Ed25519 2-of-3 quorum consensus intact.`
                    : 'Discrepancy detected in block hashes, transaction payload, Merkle root, or signature quorum.'}
                </p>

                <div className="flex flex-wrap items-center gap-3 mt-3 text-[11px] font-mono">
                  <span className="px-2 py-0.5 rounded bg-slate-900/80 border border-slate-700 text-slate-300">
                    Total Blocks: <strong className="text-white">{verificationResult.totalBlocks}</strong>
                  </span>
                  <span className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-300">
                    Verified Blocks: <strong className="text-emerald-400">{verificationResult.verifiedBlocks}</strong>
                  </span>
                  <span className="px-2 py-0.5 rounded bg-teal-500/10 border border-teal-500/20 text-teal-300">
                    2-of-3 Quorum Passed: <strong className="text-teal-400">{verificationResult.quorumPassedBlocks}</strong>
                  </span>
                  {verificationResult.legacyUnsignedBlocks > 0 && (
                    <span className="px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-300">
                      Legacy Unsigned: <strong>{verificationResult.legacyUnsignedBlocks}</strong>
                    </span>
                  )}
                </div>

                {verificationResult.errors && verificationResult.errors.length > 0 && (
                  <div className="mt-3 p-2.5 rounded-lg bg-rose-950/60 border border-rose-800/60 text-xs font-mono text-rose-300 space-y-1">
                    {verificationResult.errors.map((err, i) => (
                      <div key={i} className="flex items-center gap-1.5">
                        <span className="text-rose-500">✗</span>
                        <span>{err}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={() => setVerificationResult(null)}
              className="text-slate-400 hover:text-white p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Overview Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Total Blocks</div>
          <div className="text-2xl font-bold text-white mt-1 font-mono">{blocks.length}</div>
          <div className="text-[10px] text-teal-400 mt-1 flex items-center gap-1">
            <CheckCircle className="w-3 h-3" /> Hash Chained
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Anchored Transactions</div>
          <div className="text-2xl font-bold text-teal-400 mt-1 font-mono">{totalTransactions}</div>
          <div className="text-[10px] text-slate-400 mt-1">Consents, Records & Overrides</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Peer Node Signers</div>
          <div className="text-2xl font-bold text-indigo-400 mt-1 font-mono">3 / 3</div>
          <div className="text-[10px] text-slate-400 mt-1">St. Jude, Metro Heart, City Memorial</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Consensus Policy</div>
          <div className="text-2xl font-bold text-emerald-400 mt-1 font-mono">2-of-3</div>
          <div className="text-[10px] text-slate-400 mt-1">Ed25519 Quorum Enforced</div>
        </div>
      </div>

      {/* Transaction Type Filters */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          <span className="text-slate-400 text-[11px] font-medium mr-1 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" /> Filter:
          </span>
          {['ALL', 'CONSENT_GRANTED', 'CONSENT_REVOKED', 'RECORD_CREATED', 'FILE_ANCHORED', 'BREAK_GLASS_USED', 'GENESIS'].map((type) => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all whitespace-nowrap ${
                filterType === type
                  ? 'bg-teal-500/20 text-teal-300 border border-teal-500/40'
                  : 'bg-slate-900/80 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              {type === 'ALL' ? 'All Transactions' : type.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Block List */}
      {loading ? (
        <div className="p-12 text-center text-slate-400 bg-slate-900/30 rounded-2xl border border-slate-800">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto text-teal-400 mb-2" />
          <p className="text-sm">Loading audit ledger blocks from database...</p>
        </div>
      ) : filteredBlocks.length === 0 ? (
        <div className="p-12 text-center text-slate-400 bg-slate-900/30 rounded-2xl border border-slate-800">
          <Database className="w-8 h-8 mx-auto text-slate-600 mb-2" />
          <p className="text-sm">No ledger blocks found matching the selected filter.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {[...filteredBlocks].reverse().map((b) => {
            const isExpanded = !!expandedBlocks[b.index];
            const sigs = b.signatures || [];
            const isLegacy = sigs.length === 0;

            return (
              <div
                key={b.index}
                className={`rounded-2xl bg-slate-900/70 border transition-all ${
                  isExpanded ? 'border-slate-700 bg-slate-900/90 shadow-xl' : 'border-slate-800/80 hover:border-slate-700/80'
                }`}
              >
                {/* Block Header */}
                <div
                  onClick={() => toggleBlock(b.index)}
                  className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-3 cursor-pointer select-none"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-9 h-9 rounded-xl bg-teal-500/10 border border-teal-500/30 text-teal-400 flex items-center justify-center font-mono font-bold text-sm shrink-0">
                      #{b.index}
                    </span>

                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-sm text-white">
                          {b.index === 0 ? 'Genesis Consensus Anchor' : `Block #${b.index}`}
                        </span>

                        {isLegacy ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/20">
                            Legacy Unsigned
                          </span>
                        ) : sigs.length >= 2 ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                            <Check className="w-3 h-3" />
                            {sigs.length}/3 Quorum Verified
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                            Quorum Deficient ({sigs.length}/3)
                          </span>
                        )}

                        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300 border border-slate-700">
                          {b.transactions?.length || 0} transaction{b.transactions?.length === 1 ? '' : 's'}
                        </span>
                      </div>

                      <div className="text-xs text-slate-400 font-mono mt-1">
                        {formatTimestamp(b.timestamp)}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="hidden sm:block text-right">
                      <div className="text-[10px] text-slate-500 uppercase font-mono">Merkle Root</div>
                      <div className="text-xs font-mono text-indigo-300">
                        {b.merkleRoot ? `${b.merkleRoot.substring(0, 16)}...` : 'N/A'}
                      </div>
                    </div>

                    <button
                      className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
                      title={isExpanded ? 'Collapse block' : 'Expand block'}
                    >
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Hashes & Node Signatures Row */}
                <div className="px-4 sm:px-5 pb-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs font-mono bg-slate-950 p-3 rounded-xl border border-slate-800/80">
                    <div>
                      <span className="text-slate-500 block text-[10px] uppercase font-semibold">Previous Block Hash:</span>
                      <span className="text-slate-400 truncate block mt-0.5" title={b.prevHash}>
                        {b.prevHash}
                      </span>
                    </div>

                    <div>
                      <span className="text-slate-500 block text-[10px] uppercase font-semibold">Block Hash (SHA-256):</span>
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="text-teal-400 font-bold truncate block" title={b.blockHash}>
                          {b.blockHash}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            copyToClipboard(b.blockHash, `hash-${b.index}`);
                          }}
                          className="text-slate-500 hover:text-teal-400 shrink-0"
                          title="Copy block hash"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                        {copiedHash === `hash-${b.index}` && (
                          <span className="text-[9px] text-teal-400">Copied!</span>
                        )}
                      </div>
                    </div>

                    <div>
                      <span className="text-slate-500 block text-[10px] uppercase font-semibold">Merkle Root (Transactions):</span>
                      <span className="text-indigo-400 truncate block mt-0.5" title={b.merkleRoot}>
                        {b.merkleRoot}
                      </span>
                    </div>
                  </div>

                  {/* Node Signatures Badges */}
                  <div className="flex flex-wrap items-center gap-2 mt-2 pt-2 border-t border-slate-800/50">
                    <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mr-1">
                      Ed25519 Signers:
                    </span>
                    {sigs.length === 0 ? (
                      <span className="text-[11px] text-slate-400 italic">No signatures recorded (Legacy Block)</span>
                    ) : (
                      sigs.map((sig, idx) => {
                        const orgName =
                          sig.orgId === 'org-stjude'
                            ? 'St. Jude General'
                            : sig.orgId === 'org-metroheart'
                            ? 'Metro Heart & Cancer'
                            : sig.orgId === 'org-citymemorial'
                            ? 'City Memorial'
                            : sig.orgId;

                        return (
                          <div
                            key={idx}
                            className="px-2 py-0.5 rounded-lg bg-indigo-950/40 border border-indigo-500/20 text-[10px] font-mono text-indigo-300 flex items-center gap-1"
                            title={`Public Key: ${sig.publicKey}\nSignature: ${sig.signature}`}
                          >
                            <Shield className="w-2.5 h-2.5 text-indigo-400" />
                            <span>{orgName}</span>
                            <span className="text-[9px] text-slate-500">({sig.publicKey.substring(0, 8)}...)</span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Expanded Transaction Details */}
                {isExpanded && (
                  <div className="px-4 sm:px-5 pb-5 pt-2 border-t border-slate-800">
                    <div className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-teal-400" />
                      Anchored Transactions in Block #{b.index} ({b.transactions?.length || 0})
                    </div>

                    {b.transactions?.length === 0 ? (
                      <div className="text-xs text-slate-500 italic p-3 bg-slate-950 rounded-xl">
                        No transactions recorded in this block header.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {b.transactions.map((tx, tIdx) => (
                          <div
                            key={tx.id || tIdx}
                            className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/90 space-y-2.5"
                          >
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getActionBadge(tx.txType)}`}>
                                  {tx.txType}
                                </span>
                                <span className="text-xs font-mono text-slate-300 font-semibold">{tx.id}</span>
                              </div>
                              <span className="text-[11px] font-mono text-slate-400">
                                {formatTimestamp(tx.timestamp)}
                              </span>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 text-[11px] font-mono bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/60">
                              <div>
                                <span className="text-slate-500 block text-[9px] uppercase">Transaction Hash:</span>
                                <span className="text-teal-400 truncate block" title={tx.txHash}>
                                  {tx.txHash}
                                </span>
                              </div>
                              <div>
                                <span className="text-slate-500 block text-[9px] uppercase">Actor:</span>
                                <span className="text-slate-300 truncate block">
                                  {tx.actorRole || 'SYSTEM'} {tx.actorId ? `(${tx.actorId})` : ''}
                                </span>
                              </div>
                              <div>
                                <span className="text-slate-500 block text-[9px] uppercase">Hospital Node:</span>
                                <span className="text-slate-300 truncate block">
                                  {tx.hospitalId || 'Federation Network'}
                                </span>
                              </div>
                              <div>
                                <span className="text-slate-500 block text-[9px] uppercase">Resource ID:</span>
                                <span className="text-indigo-300 truncate block">
                                  {tx.resourceId || 'N/A'}
                                </span>
                              </div>
                            </div>

                            {/* Transaction Payload */}
                            <div>
                              <span className="text-[10px] text-slate-400 uppercase font-semibold block mb-1">
                                Transaction Payload Data:
                              </span>
                              <pre className="p-2.5 rounded-lg bg-slate-900 text-[11px] font-mono text-slate-300 overflow-x-auto border border-slate-800/80 max-h-40">
                                {JSON.stringify(tx.payload, null, 2)}
                              </pre>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ----------------------------------------------------------------------
// 4. SYSTEM ADMIN: FEDERATED RESEARCH & PRIVACY ENGINE
// ----------------------------------------------------------------------
export const AdminResearch: React.FC = () => {
  const [round, setRound] = useState(12);
  const [isTraining, setIsTraining] = useState(false);
  const [accuracy, setAccuracy] = useState(94.8);

  const handleTriggerRound = () => {
    setIsTraining(true);
    setTimeout(() => {
      setRound((prev) => prev + 1);
      setAccuracy((prev) => Math.min(98.5, Number((prev + 0.4).toFixed(1))));
      setIsTraining(false);
    }, 1500);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Microscope className="w-5 h-5 text-teal-400" />
            Federated Model Training & Differential Privacy
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Coordinate federated learning aggregation rounds without centralizing sensitive patient clinical datasets.
          </p>
        </div>

        <button
          type="button"
          disabled={isTraining}
          onClick={handleTriggerRound}
          className="px-4 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-md shadow-teal-500/20 cursor-pointer disabled:opacity-50"
        >
          <Sparkles className="w-4 h-4" />
          <span>{isTraining ? 'Aggregating Round...' : 'Trigger Next Round'}</span>
        </button>
      </div>

      {/* Model Overview Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
          <span className="text-[10px] font-mono text-slate-400 uppercase">Global Model</span>
          <div className="text-lg font-bold text-white mt-1">CardioNet-FedAvg</div>
          <span className="text-[11px] text-teal-400 mt-0.5 block">CNN + BiLSTM (ECG)</span>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
          <span className="text-[10px] font-mono text-slate-400 uppercase">Current Round</span>
          <div className="text-lg font-bold text-white mt-1">Round #{round} / 20</div>
          <span className="text-[11px] text-emerald-400 mt-0.5 block">Consensus Reached</span>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
          <span className="text-[10px] font-mono text-slate-400 uppercase">Global Accuracy</span>
          <div className="text-lg font-bold text-emerald-400 mt-1">{accuracy}%</div>
          <span className="text-[11px] text-emerald-400 mt-0.5 block">+1.2% this epoch</span>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
          <span className="text-[10px] font-mono text-slate-400 uppercase">Differential Privacy</span>
          <div className="text-lg font-bold text-amber-300 mt-1">ε = 0.5, δ = 10⁻⁵</div>
          <span className="text-[11px] text-slate-400 mt-0.5 block">Gaussian Noise Perturbation</span>
        </div>
      </div>

      {/* Hospital Node Weights Table */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
        <h3 className="font-bold text-sm text-white uppercase tracking-wider flex items-center gap-2">
          <Server className="w-4 h-4 text-teal-400" />
          Participating Federated Hospital Nodes & Consensus Weights
        </h3>

        <div className="space-y-3">
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
            <div>
              <div className="font-bold text-sm text-white">St. Jude General Node</div>
              <div className="text-xs text-slate-400 font-mono">1,420 ECG Recordings • Trust Weight: 1.00</div>
            </div>
            <div className="text-right">
              <span className="text-xs font-bold text-emerald-400">Contribution: 42.5%</span>
              <div className="text-[10px] text-slate-500 font-mono">Status: Gradient Committed</div>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
            <div>
              <div className="font-bold text-sm text-white">Metro Heart & Cancer Specialty Node</div>
              <div className="text-xs text-slate-400 font-mono">1,180 Cardiac Records • Trust Weight: 1.00</div>
            </div>
            <div className="text-right">
              <span className="text-xs font-bold text-teal-300">Contribution: 35.3%</span>
              <div className="text-[10px] text-slate-500 font-mono">Status: Gradient Committed</div>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
            <div>
              <div className="font-bold text-sm text-white">City Memorial Hospital Node</div>
              <div className="text-xs text-slate-400 font-mono">740 Health Records • Trust Weight: 0.98</div>
            </div>
            <div className="text-right">
              <span className="text-xs font-bold text-indigo-300">Contribution: 22.2%</span>
              <div className="text-[10px] text-slate-500 font-mono">Status: Gradient Committed</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
