import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { User, DataAccessScope, UserRole } from '../../types';
import {
  ShieldCheck,
  UserCheck,
  UserX,
  Clock,
  Building2,
  CheckCircle2,
  XCircle,
  Lock,
  Unlock,
  Shield,
  Key,
  Sliders,
  AlertTriangle,
  RefreshCw,
  Search,
  Check,
  Fingerprint,
  Stethoscope,
  BadgeCheck,
  FlaskConical,
} from 'lucide-react';

// Helper: renders a simulation verification badge
const SimBadge: React.FC<{ label: string; value?: string; icon?: React.ReactNode; verified?: boolean }> = ({
  label, value, icon, verified = true,
}) => (
  <div className={`flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
    verified
      ? 'bg-violet-50 dark:bg-violet-950/60 border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-300'
      : 'bg-amber-50 dark:bg-amber-950/60 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300'
  }`}>
    {icon}
    <span className="truncate max-w-[120px]" title={value}>{value || label}</span>
    {verified && <BadgeCheck className="w-3 h-3 shrink-0 text-violet-500 dark:text-violet-400" />}
  </div>
);

export const UserApprovalManager: React.FC = () => {
  const [pendingUsers, setPendingUsers] = useState<User[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Selected User for Editing Permissions
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [editPermissions, setEditPermissions] = useState<DataAccessScope[]>([]);
  const [editRole, setEditRole] = useState<UserRole>('DOCTOR');
  const [rejectReason, setRejectReason] = useState<string>('');
  const [isRejectModalOpen, setIsRejectModalOpen] = useState<boolean>(false);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const pRes = await api.getPendingUsers();
      if (pRes && pRes.pendingUsers) setPendingUsers(pRes.pendingUsers);

      const aRes = await api.getAllUsers();
      if (aRes && aRes.users) setAllUsers(aRes.users);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const openApproveModal = (u: User) => {
    setSelectedUser(u);
    setEditRole(u.role);
    setEditPermissions(u.requestedPermissions || u.dataAccessPermissions || ['READ_RECORDS', 'WRITE_RECORDS']);
  };

  const handleApproveSubmit = async () => {
    if (!selectedUser) return;
    await api.approveUser({
      userId: selectedUser.id,
      permissions: editPermissions,
      role: editRole,
    });
    setSelectedUser(null);
    fetchUsers();
  };

  const handleRejectSubmit = async () => {
    if (!selectedUser) return;
    await api.rejectUser({
      userId: selectedUser.id,
      reason: rejectReason || 'Security credentials or identity verification failed.',
    });
    setSelectedUser(null);
    setIsRejectModalOpen(false);
    fetchUsers();
  };

  const togglePermission = (scope: DataAccessScope) => {
    if (editPermissions.includes(scope)) {
      setEditPermissions(editPermissions.filter((s) => s !== scope));
    } else {
      setEditPermissions([...editPermissions, scope]);
    }
  };

  const ALL_SCOPES: { id: DataAccessScope; name: string; desc: string }[] = [
    { id: 'READ_RECORDS', name: 'Read Medical Records', desc: 'Decrypt and inspect patient EHR data' },
    { id: 'WRITE_RECORDS', name: 'Create/Write Records', desc: 'Encrypt and broadcast new medical diagnostic records' },
    { id: 'CROSS_HOSPITAL_CONSENT', name: 'Cross-Hospital Consent', desc: 'Initiate or grant inter-hospital access requests' },
    { id: 'FEDERATED_AI', name: 'Federated AI Node', desc: 'Participate in FedAvg privacy model weight updates' },
    { id: 'AUDIT_LOGS', name: 'View Audit Logs', desc: 'Inspect system-wide zero-trust security audit trails' },
    { id: 'ADMIN_ACCESS', name: 'Admin Operations', desc: 'Authorize accounts, manage nodes, adjust trust scores' },
  ];

  const filteredUsers = allUsers.filter(
    (u) =>
      u.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.role.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.hospitalName && u.hospitalName.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      <div className="p-6 rounded-3xl bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white shadow-xl border border-blue-800/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/30 text-blue-300 border border-blue-400/30 uppercase tracking-wider">
              Zero-Trust Identity Protocol
            </span>
            <span className="text-xs text-slate-300">RBAC & ABAC Enforcement</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight">Admin User Approvals & Data Permission Control</h2>
          <p className="text-xs text-slate-300 mt-1 max-w-2xl">
            Authorize new user registrations, assign granular medical data access permissions, and enforce data boundaries across hospital nodes.
          </p>
        </div>

        <button
          onClick={fetchUsers}
          className="px-4 py-2.5 rounded-2xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold flex items-center gap-2 transition-colors border border-white/20 shrink-0"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh Requests
        </button>
      </div>

      {/* 1. Pending Approvals Priority Queue */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
              <Clock className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900 dark:text-white">
                Pending User Approvals Queue
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {pendingUsers.length} user registration{pendingUsers.length === 1 ? '' : 's'} waiting for login clearance & scope assignment
              </p>
            </div>
          </div>
          <span className="px-3 py-1 bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 text-xs font-bold rounded-full border border-amber-300 dark:border-amber-800">
            {pendingUsers.length} PENDING
          </span>
        </div>

        {pendingUsers.length === 0 ? (
          <div className="p-8 text-center text-slate-400 dark:text-slate-500 text-xs rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-dashed border-slate-200 dark:border-slate-700">
            <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2 opacity-80" />
            <p className="font-semibold text-slate-700 dark:text-slate-300">All Registration Requests Approved!</p>
            <p className="text-[11px] mt-0.5">There are no pending accounts waiting for authorization at this moment.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {pendingUsers.map((u) => (
              <div
                key={u.id}
                className="p-5 rounded-2xl bg-amber-50/40 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 flex flex-col justify-between space-y-4 hover:shadow-md transition-shadow"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                        {u.fullName}
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{u.email}</p>
                    </div>
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/80 dark:text-amber-200 border border-amber-300 dark:border-amber-700">
                      {u.role}
                    </span>
                  </div>

                  <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1 pt-2 border-t border-amber-200/60 dark:border-amber-900/40">
                    <div className="flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-slate-400" />
                      <span>{u.hospitalName || 'St. Jude General Hospital'}</span>
                    </div>
                    {u.departmentName && (
                      <div className="text-[11px] text-slate-500 pl-5">Dept: {u.departmentName}</div>
                    )}
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-400 pt-1">
                      <Clock className="w-3.5 h-3.5" />
                      <span>Registered: {new Date(u.createdAt).toLocaleTimeString()}</span>
                    </div>
                  </div>

                  {/* Simulated Verification Badges */}
                  {(u.aadhaarLast4 || u.medicalLicenseNumber || u.adminAuthorizationCode) && (
                    <div className="pt-2 space-y-1.5">
                      <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                        Identity Verification:
                      </label>
                      <div className="flex flex-wrap gap-1">
                        {u.aadhaarLast4 && (
                          <SimBadge
                            label="Aadhaar"
                            value={u.aadhaarLast4}
                            icon={<Fingerprint className="w-3 h-3" />}
                            verified={u.aadhaarVerificationStatus === 'VERIFIED' || (u.aadhaarVerificationStatus || '').includes('SIMULATION')}
                          />
                        )}
                        {u.medicalLicenseNumber && (
                          <SimBadge
                            label="Med Licence"
                            value={u.medicalLicenseNumber}
                            icon={<Stethoscope className="w-3 h-3" />}
                            verified={u.medicalLicenseVerificationStatus === 'VERIFIED' || (u.medicalLicenseVerificationStatus || '').includes('SIMULATION')}
                          />
                        )}
                        {u.adminAuthorizationCode && (
                          <SimBadge
                            label="Auth Code"
                            value={u.adminAuthorizationCode}
                            icon={<Key className="w-3 h-3" />}
                            verified={u.affiliationVerificationStatus === 'VERIFIED' || (u.affiliationVerificationStatus || '').includes('SIMULATION')}
                          />
                        )}
                      </div>
                      {/* Affiliation status */}
                      {u.affiliationVerificationStatus && (
                        <div className="text-[10px] text-violet-600 dark:text-violet-400 font-semibold pl-0.5">
                          🏥 Affiliation: {u.affiliationVerificationStatus}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Requested Scopes */}
                  <div className="pt-2">
                    <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">
                      Requested Scopes:
                    </label>
                    <div className="flex flex-wrap gap-1">
                      {(u.requestedPermissions && u.requestedPermissions.length > 0
                        ? u.requestedPermissions
                        : ['READ_RECORDS']
                      ).map((scope) => (
                        <span
                          key={scope}
                          className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                        >
                          {scope.replace('_', ' ')}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="pt-3 border-t border-amber-200/80 dark:border-amber-900/60 flex items-center gap-2">
                  <button
                    onClick={() => openApproveModal(u)}
                    className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-1 shadow-sm transition-colors"
                  >
                    <UserCheck className="w-3.5 h-3.5" /> Approve & Set Scopes
                  </button>
                  <button
                    onClick={() => {
                      setSelectedUser(u);
                      setIsRejectModalOpen(true);
                    }}
                    className="py-2 px-3 rounded-xl bg-rose-100 hover:bg-rose-200 text-rose-700 dark:bg-rose-950/60 dark:hover:bg-rose-900 dark:text-rose-300 text-xs font-bold flex items-center justify-center transition-colors"
                    title="Reject Request"
                  >
                    <UserX className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 2. Registered Users & Data Access Permission Matrix */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
              <Shield className="w-5 h-5 text-blue-600" /> Active Users & Access Control Matrix
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Manage data permissions, update roles, and audit account trust statuses
            </p>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter users by name/email..."
              className="w-full pl-9 pr-4 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase tracking-wider font-semibold">
                <th className="py-3 px-3">User / Identity</th>
                <th className="py-3 px-3">Role & Hospital</th>
                <th className="py-3 px-3">Verification</th>
                <th className="py-3 px-3">Approval Status</th>
                <th className="py-3 px-3">Trust Score</th>
                <th className="py-3 px-3">Granted Data Scopes</th>
                <th className="py-3 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
              {filteredUsers.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                  <td className="py-3.5 px-3">
                    <div className="font-bold text-slate-900 dark:text-white">{u.fullName}</div>
                    <div className="text-[11px] text-slate-400">{u.email}</div>
                    {u.mfaEnabled && (
                      <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 mt-0.5">
                        <ShieldCheck className="w-2.5 h-2.5" /> MFA
                      </span>
                    )}
                  </td>
                  <td className="py-3.5 px-3">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{u.role}</span>
                    <div className="text-[11px] text-slate-400">{u.hospitalName || 'St. Jude General'}</div>
                  </td>
                  {/* Verification column */}
                  <td className="py-3.5 px-3">
                    <div className="flex flex-col gap-1">
                      {u.aadhaarLast4 ? (
                        <span className={`inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${
                          (u.aadhaarVerificationStatus || '').includes('SIMULATION') || u.aadhaarVerificationStatus === 'VERIFIED'
                            ? 'bg-violet-50 dark:bg-violet-950/60 border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-300'
                            : 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-500'
                        }`}>
                          <Fingerprint className="w-2.5 h-2.5" />
                          {u.aadhaarLast4}
                        </span>
                      ) : (
                        <span className="text-[9px] text-slate-400 italic">No Aadhaar</span>
                      )}
                      {u.medicalLicenseNumber && (
                        <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full border bg-teal-50 dark:bg-teal-950/60 border-teal-300 dark:border-teal-700 text-teal-700 dark:text-teal-300">
                          <Stethoscope className="w-2.5 h-2.5" />
                          {u.medicalLicenseNumber}
                        </span>
                      )}
                      {u.adminAuthorizationCode && (
                        <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full border bg-indigo-50 dark:bg-indigo-950/60 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300">
                          <Key className="w-2.5 h-2.5" />
                          {u.adminAuthorizationCode}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-3.5 px-3">
                    {u.approvalStatus === 'APPROVED' ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" /> APPROVED
                      </span>
                    ) : u.approvalStatus === 'PENDING' ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                        <Clock className="w-3 h-3 text-amber-600" /> PENDING
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
                        <XCircle className="w-3 h-3 text-rose-600" /> REJECTED
                      </span>
                    )}
                  </td>
                  <td className="py-3.5 px-3">
                    <span
                      className={`font-bold px-2 py-0.5 rounded-md text-[11px] ${
                        u.trustScore >= 80
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                          : u.trustScore >= 40
                          ? 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                          : 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                      }`}
                    >
                      {u.trustScore} / 100
                    </span>
                  </td>
                  <td className="py-3.5 px-3">
                    <div className="flex flex-wrap gap-1 max-w-xs">
                      {(u.dataAccessPermissions || []).map((sc) => (
                        <span
                          key={sc}
                          className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
                        >
                          {sc.replace('_', ' ')}
                        </span>
                      ))}
                      {(!u.dataAccessPermissions || u.dataAccessPermissions.length === 0) && (
                        <span className="text-[10px] text-slate-400 italic">No Scopes Granted</span>
                      )}
                    </div>
                  </td>
                  <td className="py-3.5 px-3 text-right">
                    <button
                      onClick={() => openApproveModal(u)}
                      className="px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-xs font-semibold hover:bg-blue-100 transition-colors"
                    >
                      Edit Scopes
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Simulation Registry Info Panel */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="w-8 h-8 rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400 flex items-center justify-center">
            <FlaskConical className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-base text-slate-900 dark:text-white">Controlled Simulation Identity Registry</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Academic prototype — demo credentials used in place of real government/hospital APIs</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-2xl bg-violet-50/60 dark:bg-violet-950/20 border border-violet-200 dark:border-violet-900/50 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-violet-700 dark:text-violet-300"><Fingerprint className="w-4 h-4" /> Aadhaar Registry</div>
            {[{id:'TEST-AADHAAR-0001',name:'Sarah Connor',role:'PATIENT'},{id:'TEST-AADHAAR-0002',name:'Dr. Robert Chen',role:'DOCTOR'},{id:'TEST-AADHAAR-0003',name:'Aisha Khan',role:'HOSPITAL_ADMIN'}].map(e=>(
              <div key={e.id} className="text-[10px] font-mono bg-white dark:bg-slate-800 rounded-lg px-2 py-1 border border-violet-100 dark:border-violet-900">
                <div className="font-bold text-violet-700 dark:text-violet-300">{e.id}</div>
                <div className="text-slate-500">{e.name} · {e.role}</div>
              </div>
            ))}
          </div>
          <div className="p-4 rounded-2xl bg-teal-50/60 dark:bg-teal-950/20 border border-teal-200 dark:border-teal-900/50 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-teal-700 dark:text-teal-300"><Stethoscope className="w-4 h-4" /> Medical Licence Registry</div>
            <div className="text-[10px] font-mono bg-white dark:bg-slate-800 rounded-lg px-2 py-1 border border-teal-100 dark:border-teal-900">
              <div className="font-bold text-teal-700 dark:text-teal-300">TEST-MED-LIC-0001</div>
              <div className="text-slate-500">Dr. Robert Chen · Cardiology</div>
            </div>
          </div>
          <div className="p-4 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-900/50 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-700 dark:text-indigo-300"><Key className="w-4 h-4" /> Hospital Auth Registry</div>
            <div className="text-[10px] font-mono bg-white dark:bg-slate-800 rounded-lg px-2 py-1 border border-indigo-100 dark:border-indigo-900">
              <div className="font-bold text-indigo-700 dark:text-indigo-300">HOSP-ADMIN-AUTH-001</div>
              <div className="text-slate-500">Aisha Khan · hosp-a · HOSPITAL_ADMIN</div>
            </div>
          </div>
        </div>
        <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-[11px] text-amber-800 dark:text-amber-300">
          <strong>Viva note:</strong> FedTrustMed uses a controlled simulated identity-verification registry. Real Aadhaar numbers and professional credentials are not stored. Production deployment would integrate authorized UIDAI and medical council verification APIs.
        </div>
      </div>

      {/* Approve / Edit Scopes Modal */}
      {selectedUser && !isRejectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-6 h-6 text-emerald-600" />
                <div>
                  <h3 className="font-bold text-base text-slate-900 dark:text-white">
                    Authorize User & Assign Permissions
                  </h3>
                  <p className="text-xs text-slate-500">{selectedUser.fullName} ({selectedUser.email})</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedUser(null)}
                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Assign System Role
                </label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as UserRole)}
                  className="w-full p-2.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-medium"
                >
                  <option value="PATIENT">Patient</option>
                  <option value="DOCTOR">Doctor</option>
                  <option value="HOSPITAL_ADMIN">Hospital Admin</option>
                  <option value="SYSTEM_ADMIN">System Admin</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
                  Select Data Access Scopes to Grant:
                </label>
                <div className="space-y-2">
                  {ALL_SCOPES.map((sc) => {
                    const active = editPermissions.includes(sc.id);
                    return (
                      <div
                        key={sc.id}
                        onClick={() => togglePermission(sc.id)}
                        className={`p-3 rounded-2xl border cursor-pointer flex items-center justify-between transition-all ${
                          active
                            ? 'bg-blue-50/80 dark:bg-blue-950/60 border-blue-300 dark:border-blue-700 text-blue-900 dark:text-blue-100'
                            : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        <div>
                          <div className="text-xs font-bold flex items-center gap-1.5">
                            {sc.name}
                          </div>
                          <p className="text-[11px] opacity-80">{sc.desc}</p>
                        </div>
                        <div
                          className={`w-5 h-5 rounded-full flex items-center justify-center border ${
                            active
                              ? 'bg-blue-600 border-blue-600 text-white'
                              : 'border-slate-300 dark:border-slate-600'
                          }`}
                        >
                          {active && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2">
              <button
                onClick={() => setSelectedUser(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                onClick={handleApproveSubmit}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-500/20"
              >
                Grant Access & Approve
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {selectedUser && isRejectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center gap-2 text-rose-600">
              <UserX className="w-6 h-6" />
              <h3 className="font-bold text-base text-slate-900 dark:text-white">
                Reject Account Request
              </h3>
            </div>
            <p className="text-xs text-slate-500">
              Are you sure you want to reject registration for <strong className="text-slate-800 dark:text-slate-200">{selectedUser.fullName}</strong> ({selectedUser.email})?
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Reason for Rejection
              </label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="e.g. Unverified clinical license number or invalid hospital node."
                rows={3}
                className="w-full p-2.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none"
              />
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => {
                  setSelectedUser(null);
                  setIsRejectModalOpen(false);
                }}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                onClick={handleRejectSubmit}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-md shadow-rose-500/20"
              >
                Reject Request
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
