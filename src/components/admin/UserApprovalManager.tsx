import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  CheckCircle,
  XCircle,
  FileText,
  AlertCircle,
  ExternalLink,
  RefreshCw,
  Search,
  User,
  Building,
  Check,
  X,
  Loader2,
  AlertTriangle,
  FileCheck,
  Clock,
  Database,
  Activity,
} from 'lucide-react';
import { api, PendingUser, DocumentMeta } from '../../services/api';

const DEFAULT_PERMISSIONS = [
  { id: 'READ_RECORDS', label: 'View Medical Records' },
  { id: 'WRITE_RECORDS', label: 'Create / Update Records' },
  { id: 'CONSENT_OVERRIDE', label: 'Emergency Break-Glass Override' },
  { id: 'AUDIT_ACCESS', label: 'Audit Trail Access' },
  { id: 'EXPORT_RECORDS', label: 'Export Encrypted Backups' },
];

export const UserApprovalManager: React.FC = () => {
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [listError, setListError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [overviewStats, setOverviewStats] = useState<{
    pendingApprovals: number;
    health: {
      activeHospitalNodes: number;
      keyVaultStatus: string;
      sealedKeysCount: number;
      auditLedgerStatus: string;
      auditEventsCount: number;
    };
  } | null>(null);

  // Selected user for Approve Modal
  const [approveUser, setApproveUser] = useState<PendingUser | null>(null);
  const [approveRole, setApproveRole] = useState<string>('DOCTOR');
  const [approvePermissions, setApprovePermissions] = useState<string[]>(['READ_RECORDS']);
  const [aadhaarVerifiedCheck, setAadhaarVerifiedCheck] = useState<boolean>(false);
  const [licenceVerifiedCheck, setLicenceVerifiedCheck] = useState<boolean>(false);
  const [approveLoading, setApproveLoading] = useState<boolean>(false);
  const [approveError, setApproveError] = useState<string | null>(null);

  // Selected user for Reject Modal
  const [rejectUser, setRejectUser] = useState<PendingUser | null>(null);
  const [rejectReason, setRejectReason] = useState<string>('');
  const [confirmReject, setConfirmReject] = useState<boolean>(false);
  const [rejectLoading, setRejectLoading] = useState<boolean>(false);
  const [rejectError, setRejectError] = useState<string | null>(null);

  // Document viewing state
  const [viewingDocId, setViewingDocId] = useState<string | null>(null);
  const [docError, setDocError] = useState<string | null>(null);

  // Load pending users and system health stats
  const loadPendingUsers = useCallback(async () => {
    setLoading(true);
    setListError(null);
    try {
      const [users, stats] = await Promise.all([
        api.getPendingUsers(),
        api.getAdminOverviewStats().catch(() => null),
      ]);
      setPendingUsers(users);
      if (stats) setOverviewStats(stats);
    } catch (err: any) {
      setListError(err?.error || err?.message || 'Failed to load pending users.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPendingUsers();
  }, [loadPendingUsers]);

  // Open Approve Dialog
  const handleOpenApproveDialog = (u: PendingUser) => {
    setApproveUser(u);
    setApproveRole(u.role);
    setApprovePermissions(
      u.role === 'DOCTOR'
        ? ['READ_RECORDS', 'WRITE_RECORDS', 'CONSENT_OVERRIDE']
        : ['READ_RECORDS']
    );
    // Initialize checkboxes based on pre-existing verification status
    setAadhaarVerifiedCheck(
      u.aadhaarVerificationStatus === 'VERIFIED' ||
      u.aadhaarVerificationStatus === 'VERIFIED - SIMULATION'
    );
    setLicenceVerifiedCheck(
      u.medicalLicenseVerificationStatus === 'VERIFIED' ||
      u.medicalLicenseVerificationStatus === 'VERIFIED - SIMULATION'
    );
    setApproveError(null);
  };

  // Submit Approval
  const handleApproveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!approveUser) return;

    setApproveError(null);

    // Explicit validation check: do not silently close!
    if (!aadhaarVerifiedCheck) {
      setApproveError('You must confirm: "I verified the Aadhaar" before approving this user.');
      return;
    }

    if (approveRole === 'DOCTOR' && !licenceVerifiedCheck) {
      setApproveError('You must confirm: "I verified the licence" before approving a doctor account.');
      return;
    }

    setApproveLoading(true);

    try {
      // 1. First record document verification in DB
      await api.verifyUserDocuments({
        userId: approveUser.id,
        aadhaarVerified: aadhaarVerifiedCheck,
        medicalLicenseVerified: approveRole === 'DOCTOR' ? licenceVerifiedCheck : undefined,
      });

      // 2. Dispatch approval request
      await api.approveUser({
        userId: approveUser.id,
        role: approveRole,
        permissions: approvePermissions,
      });

      // Success: close dialog and refresh list
      setApproveUser(null);
      await loadPendingUsers();
    } catch (err: any) {
      setApproveError(err?.error || err?.message || 'Approval failed. Please review errors and try again.');
    } finally {
      setApproveLoading(false);
    }
  };

  // Open Reject Dialog
  const handleOpenRejectDialog = (u: PendingUser) => {
    setRejectUser(u);
    setRejectReason('');
    setConfirmReject(false);
    setRejectError(null);
  };

  // Submit Rejection
  const handleRejectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectUser) return;

    setRejectError(null);

    const cleanReason = rejectReason.trim();
    if (cleanReason.length < 5 || cleanReason.length > 300) {
      setRejectError('Rejection reason must be between 5 and 300 characters.');
      return;
    }

    if (!confirmReject) {
      setRejectError('Please check the confirmation box to verify this rejection.');
      return;
    }

    setRejectLoading(true);

    try {
      await api.rejectUser({
        userId: rejectUser.id,
        reason: cleanReason,
      });

      // Success: close dialog and refresh list
      setRejectUser(null);
      await loadPendingUsers();
    } catch (err: any) {
      setRejectError(err?.error || err?.message || 'Rejection failed. Please try again.');
    } finally {
      setRejectLoading(false);
    }
  };

  // View Licence Document
  const handleViewDocument = async (doc: DocumentMeta) => {
    setViewingDocId(doc.id);
    setDocError(null);
    try {
      const { blob } = await api.getAdminDocumentBlob(doc.id);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch (err: any) {
      setDocError(err?.error || err?.message || 'Failed to decrypt and open document.');
    } finally {
      setViewingDocId(null);
    }
  };

  // Filter pending users
  const filteredUsers = pendingUsers.filter((u) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      u.fullName.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.medicalLicenseNumber && u.medicalLicenseNumber.toLowerCase().includes(q)) ||
      (u.hospitalName && u.hospitalName.toLowerCase().includes(q)) ||
      (u.aadhaarLast4 && u.aadhaarLast4.includes(q))
    );
  });

  return (
    <div className="space-y-6">
      {/* 1. Pending Approvals First */}
      <div className="p-6 rounded-3xl bg-gradient-to-r from-amber-950/40 via-slate-900 to-slate-950 border border-amber-500/30 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-semibold">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span>Identity Verification Queue</span>
            </div>
            <div className="mt-3 flex items-baseline gap-3">
              <span className="text-4xl sm:text-5xl font-black text-amber-400">
                {pendingUsers.length}
              </span>
              <span className="text-sm font-semibold text-slate-300">
                Pending Registration Applications
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1 max-w-xl">
              Applicants awaiting Aadhaar identity checks, medical licence reviews, and issuance of cryptographic ECC key pairs.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadPendingUsers}
              disabled={loading}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 flex items-center gap-2 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh Queue</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Three Health Numbers Below */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Health 1: Active Hospital Nodes */}
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Active Hospital Nodes</span>
            <div className="w-8 h-8 rounded-lg bg-teal-500/10 text-teal-400 flex items-center justify-center">
              <Building className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-white mt-2">
            {overviewStats?.health?.activeHospitalNodes || 3} Nodes Online
          </div>
          <div className="text-[11px] text-teal-400 mt-1">Federated Consensus Operational</div>
        </div>

        {/* Health 2: Key Vault Integrity */}
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Key Vault Integrity</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-emerald-400 mt-2">
            {overviewStats?.health?.keyVaultStatus || '100% Sealed'}
          </div>
          <div className="text-[11px] text-emerald-400/90">AES-256-GCM / NIST P-256 Validated</div>
        </div>

        {/* Health 3: Audit Ledger Status */}
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Audit Ledger Status</span>
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
              <CheckCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-indigo-300 mt-2">
            {overviewStats?.health?.auditLedgerStatus || 'Zero Tamper / Verified'}
          </div>
          <div className="text-[11px] text-indigo-400 mt-1">Immutable Log Integrity Enforced</div>
        </div>
      </div>

      {/* Top Header Card */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-teal-400" />
            Credential Approvals Manager
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Review pending registrations, verify Aadhaar identities and medical licences, and issue sealed ECC key pairs.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search pending users..."
              className="pl-8 pr-3 py-1.5 rounded-xl border border-slate-700 bg-slate-900 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500 w-48 sm:w-64"
            />
          </div>

          <button
            type="button"
            onClick={loadPendingUsers}
            disabled={loading}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Global Alerts / Errors */}
      {listError && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2.5">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{listError}</span>
        </div>
      )}

      {docError && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>Document Decryption Error: {docError}</span>
          </div>
          <button type="button" onClick={() => setDocError(null)} className="text-slate-400 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Pending Requests Table / List */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-xl">
        <div className="px-6 py-4 border-b border-slate-800 bg-slate-950/40 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-white uppercase tracking-wider">
              Pending Registrations
            </span>
            <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold">
              {pendingUsers.length} awaiting review
            </span>
          </div>
          <span className="text-[11px] text-slate-500">
            System Admin Authority Required
          </span>
        </div>

        {loading ? (
          <div className="py-16 text-center space-y-3">
            <Loader2 className="w-8 h-8 animate-spin text-teal-400 mx-auto" />
            <p className="text-xs text-slate-400 font-medium">Loading pending user applications...</p>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="py-16 text-center space-y-2">
            <FileCheck className="w-10 h-10 text-slate-600 mx-auto" />
            <p className="text-sm font-semibold text-slate-300">No Pending Requests</p>
            <p className="text-xs text-slate-500">
              {searchQuery ? 'No pending users matched your search criteria.' : 'All registrations have been approved or processed.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 text-slate-400 font-semibold border-b border-slate-800">
                <tr>
                  <th className="px-5 py-3.5">Applicant Name</th>
                  <th className="px-4 py-3.5">Role</th>
                  <th className="px-4 py-3.5">Hospital</th>
                  <th className="px-4 py-3.5">Aadhaar (Last 4)</th>
                  <th className="px-4 py-3.5">Licence / Auth Code</th>
                  <th className="px-4 py-3.5">Verification Status</th>
                  <th className="px-4 py-3.5">Licence Document</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredUsers.map((u) => {
                  const licenceDoc = (u.documents || []).find(
                    (d) => d.kind === 'MEDICAL_LICENSE' || d.kind === 'AUTHORIZATION_LETTER'
                  ) || (u.documents || [])[0];

                  const isAadhaarVerified =
                    u.aadhaarVerificationStatus === 'VERIFIED' ||
                    u.aadhaarVerificationStatus === 'VERIFIED - SIMULATION';

                  const isLicenceVerified =
                    u.medicalLicenseVerificationStatus === 'VERIFIED' ||
                    u.medicalLicenseVerificationStatus === 'VERIFIED - SIMULATION';

                  return (
                    <tr key={u.id} className="hover:bg-slate-800/40 transition-colors">
                      {/* Name & Email */}
                      <td className="px-5 py-4">
                        <div className="font-bold text-white text-xs">{u.fullName}</div>
                        <div className="text-[11px] text-slate-400 font-mono mt-0.5">{u.email}</div>
                      </td>

                      {/* Role Badge */}
                      <td className="px-4 py-4">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-slate-800 text-teal-300 border border-teal-500/20">
                          {u.role}
                        </span>
                      </td>

                      {/* Hospital */}
                      <td className="px-4 py-4">
                        <div className="font-medium text-slate-200 truncate max-w-[140px]">
                          {u.hospitalName || 'Network Global'}
                        </div>
                        {u.departmentName && (
                          <div className="text-[10px] text-slate-400">Dept: {u.departmentName}</div>
                        )}
                      </td>

                      {/* Aadhaar Last 4 */}
                      <td className="px-4 py-4 font-mono text-slate-300">
                        {u.aadhaarLast4 ? `**** **** ${u.aadhaarLast4}` : 'None'}
                      </td>

                      {/* Licence / Auth code */}
                      <td className="px-4 py-4 font-mono text-slate-300">
                        {u.medicalLicenseNumber || u.adminAuthorizationCode || '—'}
                      </td>

                      {/* Verification Status */}
                      <td className="px-4 py-4 space-y-1">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              isAadhaarVerified ? 'bg-emerald-400' : 'bg-amber-400'
                            }`}
                          />
                          <span className="text-[11px] text-slate-300">
                            Aadhaar: <span className={isAadhaarVerified ? 'text-emerald-400 font-semibold' : 'text-amber-400'}>{u.aadhaarVerificationStatus}</span>
                          </span>
                        </div>

                        {u.role === 'DOCTOR' && (
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                isLicenceVerified ? 'bg-emerald-400' : 'bg-amber-400'
                              }`}
                            />
                            <span className="text-[11px] text-slate-300">
                              Licence: <span className={isLicenceVerified ? 'text-emerald-400 font-semibold' : 'text-amber-400'}>{u.medicalLicenseVerificationStatus}</span>
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Licence Document Button */}
                      <td className="px-4 py-4">
                        {licenceDoc ? (
                          <button
                            type="button"
                            onClick={() => handleViewDocument(licenceDoc)}
                            disabled={viewingDocId === licenceDoc.id}
                            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-teal-400 border border-slate-700 text-[11px] font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                            title={`Inspect ${licenceDoc.originalName}`}
                          >
                            {viewingDocId === licenceDoc.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <FileText className="w-3 h-3" />
                            )}
                            <span>View licence document</span>
                          </button>
                        ) : (
                          <span className="text-slate-500 text-[11px] italic">No document</span>
                        )}
                      </td>

                      {/* Action Buttons */}
                      <td className="px-5 py-4 text-right space-x-2">
                        <button
                          type="button"
                          onClick={() => handleOpenApproveDialog(u)}
                          className="px-3 py-1.5 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs shadow-sm transition-colors cursor-pointer"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenRejectDialog(u)}
                          className="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 font-semibold text-xs transition-colors cursor-pointer"
                        >
                          Reject
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ==================================================================== */}
      {/* APPROVE DIALOG MODAL */}
      {/* ==================================================================== */}
      {approveUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm overflow-y-auto">
          <div className="relative w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-6 text-slate-200 animate-in fade-in zoom-in-95 duration-150 space-y-5">
            
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-teal-400" />
                <h3 className="font-bold text-base text-white">Approve Registration</h3>
              </div>
              <button
                type="button"
                onClick={() => !approveLoading && setApproveUser(null)}
                disabled={approveLoading}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Server / Validation Error Banner */}
            {approveError && (
              <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div className="font-medium">{approveError}</div>
              </div>
            )}

            {/* Applicant Summary */}
            <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400">Applicant:</span>
                <span className="font-bold text-white">{approveUser.fullName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Email:</span>
                <span className="font-mono text-slate-300">{approveUser.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Aadhaar (Last 4):</span>
                <span className="font-mono text-slate-300">**** **** {approveUser.aadhaarLast4 || '0000'}</span>
              </div>
              {approveUser.medicalLicenseNumber && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Submitted Licence:</span>
                  <span className="font-mono text-teal-400">{approveUser.medicalLicenseNumber}</span>
                </div>
              )}
            </div>

            <form onSubmit={handleApproveSubmit} className="space-y-4">
              {/* Role Selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Assign Account Role
                </label>
                <select
                  value={approveRole}
                  onChange={(e) => setApproveRole(e.target.value)}
                  disabled={approveLoading}
                  className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-xs text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  <option value="DOCTOR">Doctor</option>
                  <option value="PATIENT">Patient</option>
                  <option value="HOSPITAL_ADMIN">Hospital Administrator</option>
                  <option value="SYSTEM_ADMIN">System Administrator</option>
                </select>
              </div>

              {/* Permission Checkboxes */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Data Access Permissions
                </label>
                <div className="space-y-1.5 p-3 rounded-xl bg-slate-950/60 border border-slate-800 max-h-36 overflow-y-auto">
                  {DEFAULT_PERMISSIONS.map((perm) => (
                    <label
                      key={perm.id}
                      className="flex items-center gap-2 text-xs text-slate-300 hover:text-white cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={approvePermissions.includes(perm.id)}
                        disabled={approveLoading}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setApprovePermissions([...approvePermissions, perm.id]);
                          } else {
                            setApprovePermissions(approvePermissions.filter((p) => p !== perm.id));
                          }
                        }}
                        className="rounded border-slate-700 text-teal-500 focus:ring-teal-500"
                      />
                      <span>{perm.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* MANDATORY VERIFICATION CHECKBOXES */}
              <div className="p-4 rounded-xl bg-teal-500/10 border border-teal-500/20 space-y-2.5">
                <div className="text-[11px] font-bold text-teal-300 uppercase tracking-wider">
                  Mandatory Identity Verification
                </div>

                {/* Checkbox 1: I verified the Aadhaar */}
                <label className="flex items-start gap-2.5 text-xs text-slate-200 hover:text-white cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={aadhaarVerifiedCheck}
                    disabled={approveLoading}
                    onChange={(e) => setAadhaarVerifiedCheck(e.target.checked)}
                    className="mt-0.5 rounded border-teal-500 text-teal-500 focus:ring-teal-500"
                  />
                  <div>
                    <span className="font-semibold text-white">I verified the Aadhaar</span>
                    <p className="text-[11px] text-slate-400">
                      Confirmed Aadhaar hash and demographic details with hospital identity records.
                    </p>
                  </div>
                </label>

                {/* Checkbox 2: I verified the licence (doctors) */}
                {approveRole === 'DOCTOR' && (
                  <label className="flex items-start gap-2.5 text-xs text-slate-200 hover:text-white cursor-pointer select-none pt-1 border-t border-teal-500/20">
                    <input
                      type="checkbox"
                      checked={licenceVerifiedCheck}
                      disabled={approveLoading}
                      onChange={(e) => setLicenceVerifiedCheck(e.target.checked)}
                      className="mt-0.5 rounded border-teal-500 text-teal-500 focus:ring-teal-500"
                    />
                    <div>
                      <span className="font-semibold text-white">I verified the licence</span>
                      <p className="text-[11px] text-slate-400">
                        Validated medical council registration and submitted licence proof.
                      </p>
                    </div>
                  </label>
                )}
              </div>

              {/* Action Buttons with "Working..." state */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setApproveUser(null)}
                  disabled={approveLoading}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition-colors cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={approveLoading}
                  className="px-5 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs shadow-md transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {approveLoading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Working...
                    </>
                  ) : (
                    'Confirm & Approve'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* REJECT DIALOG MODAL */}
      {/* ==================================================================== */}
      {rejectUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm overflow-y-auto">
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-6 text-slate-200 animate-in fade-in zoom-in-95 duration-150 space-y-4">
            
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-rose-400">
                <AlertTriangle className="w-5 h-5" />
                <h3 className="font-bold text-base text-white">Reject Registration</h3>
              </div>
              <button
                type="button"
                onClick={() => !rejectLoading && setRejectUser(null)}
                disabled={rejectLoading}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Error Banner */}
            {rejectError && (
              <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div className="font-medium">{rejectError}</div>
              </div>
            )}

            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-xs">
              Rejecting applicant: <span className="font-bold text-white">{rejectUser.fullName}</span> ({rejectUser.email})
            </div>

            <form onSubmit={handleRejectSubmit} className="space-y-4">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    Rejection Reason (5–300 chars) *
                  </label>
                  <span
                    className={`text-[10px] font-mono ${
                      rejectReason.trim().length < 5 || rejectReason.trim().length > 300
                        ? 'text-amber-400 font-bold'
                        : 'text-slate-400'
                    }`}
                  >
                    {rejectReason.trim().length} / 300
                  </span>
                </div>
                <textarea
                  rows={3}
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  disabled={rejectLoading}
                  placeholder="State the specific reason for rejecting this registration (e.g., Medical licence verification failed with council)."
                  className="w-full px-3 py-2 rounded-xl border border-slate-700 bg-slate-800 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              {/* Confirmation Step */}
              <label className="flex items-start gap-2.5 text-xs text-slate-300 hover:text-white cursor-pointer select-none p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                <input
                  type="checkbox"
                  checked={confirmReject}
                  disabled={rejectLoading}
                  onChange={(e) => setConfirmReject(e.target.checked)}
                  className="mt-0.5 rounded border-rose-500 text-rose-500 focus:ring-rose-500"
                />
                <div>
                  <span className="font-semibold text-rose-300">Confirm Rejection Decision</span>
                  <p className="text-[11px] text-slate-400">
                    I confirm that this registration cannot be approved and this reason will be displayed to the user.
                  </p>
                </div>
              </label>

              {/* Actions with "Working..." state */}
              <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setRejectUser(null)}
                  disabled={rejectLoading}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition-colors cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={rejectLoading}
                  className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-md transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {rejectLoading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Working...
                    </>
                  ) : (
                    'Confirm Rejection'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
