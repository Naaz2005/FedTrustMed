import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { MedicalRecord, ConsentRecord, AuditLog } from '../../types';
import { api } from '../../services/api';
import {
  FileKey2,
  FileCheck2,
  Lock,
  Download,
  Eye,
  ShieldCheck,
  Building2,
  CheckCircle2,
  XCircle,
  Clock,
  KeyRound,
  ShieldAlert,
} from 'lucide-react';

export const PatientDashboard: React.FC<{ setActiveTab: (tab: string) => void }> = ({ setActiveTab }) => {
  const { user } = useAuth();
  const [records, setRecords] = useState<MedicalRecord[]>([]);
  const [consents, setConsents] = useState<ConsentRecord[]>([]);
  const [selectedDecrypted, setSelectedDecrypted] = useState<any | null>(null);
  const [loadingDecryption, setLoadingDecryption] = useState(false);

  const fetchData = async () => {
    try {
      const recData = await api.getMedicalRecords('pat-101');
      if (recData && recData.records) setRecords(recData.records);

      const cstData = await api.getConsentRecords('pat-101');
      if (cstData && cstData.consents) setConsents(cstData.consents);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleDecryptAndDownload = async (record: MedicalRecord) => {
    setLoadingDecryption(true);
    try {
      const res = await api.decryptRecord(record.id, user?.id || 'usr-patient-1');
      if (res && res.decryptedData) {
        setSelectedDecrypted({
          record,
          data: res.decryptedData,
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingDecryption(false);
    }
  };

  const handleToggleConsent = async (consentId: string, currentStatus: string) => {
    if (currentStatus === 'GRANTED') {
      await api.revokeConsent(consentId);
    } else {
      await api.grantConsent(consentId);
    }
    fetchData();
  };

  return (
    <div className="space-y-6">
      
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-700 rounded-3xl p-6 text-white shadow-xl shadow-blue-500/10 relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-8 -translate-y-8 w-64 h-64 bg-white/10 rounded-full blur-2xl pointer-events-none" />
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold uppercase tracking-wider bg-white/20 px-2.5 py-0.5 rounded-full">
                Patient Self-Sovereign Identity Portal
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Welcome, {user?.fullName}</h1>
            <p className="text-blue-100 text-sm mt-1 max-w-xl">
              Your medical records are encrypted with <strong>AES-256</strong> and protected by <strong>ECC key exchange</strong>. All access requests are enforced by <strong>Hyperledger Fabric smart contracts</strong>.
            </p>
          </div>
          <div className="bg-white/10 backdrop-blur-md border border-white/20 p-4 rounded-2xl flex items-center gap-4 shrink-0">
            <div>
              <div className="text-xs text-blue-200">Trust Score Status</div>
              <div className="text-2xl font-black">{user?.trustScore || 98} / 100</div>
            </div>
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
              <ShieldCheck className="w-7 h-7 text-emerald-300" />
            </div>
          </div>
        </div>
      </div>

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-sm">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold">
            <span>Encrypted Records</span>
            <FileKey2 className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mt-2">{records.length}</div>
          <div className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1 font-medium flex items-center gap-1">
            <Lock className="w-3 h-3" /> AES-256-GCM Encrypted
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-sm">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold">
            <span>Active Consents</span>
            <FileCheck2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mt-2">
            {consents.filter((c) => c.status === 'GRANTED').length}
          </div>
          <div className="text-[11px] text-blue-600 dark:text-blue-400 mt-1 font-medium">
            Blockchain Enforced
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-sm">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold">
            <span>Primary Hospital</span>
            <Building2 className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-base font-bold text-slate-900 dark:text-white mt-2 truncate">
            {user?.hospitalName}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Peer MSP Node Verified</div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-sm">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold">
            <span>ECC Public Key</span>
            <KeyRound className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-xs font-mono text-slate-700 dark:text-slate-300 mt-2 truncate">
            {user?.publicKeyEcc.substring(0, 24)}...
          </div>
          <div className="text-[11px] text-slate-400 mt-1">NIST P-256 Key Pair</div>
        </div>
      </div>

      {/* Medical History & Encrypted Files */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white text-lg flex items-center gap-2">
              <FileKey2 className="w-5 h-5 text-blue-600" /> My Medical Records Vault
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Only authorized doctors with active patient consent can request AES key decryption.
            </p>
          </div>
          <button
            onClick={() => setActiveTab('records')}
            className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
          >
            View Cryptographic Inspector &rarr;
          </button>
        </div>

        <div className="space-y-3">
          {records.map((rec) => (
            <div
              key={rec.id}
              className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 hover:border-blue-300 dark:hover:border-blue-700 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-900 dark:text-white text-sm">{rec.title}</span>
                  <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200">
                    {rec.recordType}
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Doctor: <strong>{rec.doctorName}</strong> | Hospital: <strong>{rec.hospitalName}</strong>
                </p>
                <div className="text-[11px] font-mono text-slate-400 flex items-center gap-3">
                  <span>SHA-256: {rec.sha256Hash.substring(0, 18)}...</span>
                  <span>Fabric Tx: {rec.fabricTxId.substring(0, 16)}...</span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => handleDecryptAndDownload(rec)}
                  disabled={loadingDecryption}
                  className="px-3 py-2 rounded-xl text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 shadow-sm flex items-center gap-1.5 transition-colors"
                >
                  <KeyRound className="w-3.5 h-3.5" /> Decrypt & View
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Decrypted Inspection Modal */}
      {selectedDecrypted && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-6 h-6 text-emerald-500" />
                <h3 className="font-bold text-slate-900 dark:text-white text-lg">
                  Decrypted Patient Record
                </h3>
              </div>
              <button
                onClick={() => setSelectedDecrypted(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white font-bold"
              >
                ✕
              </button>
            </div>

            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl text-xs text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-900/50 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Decryption Successful! AES-256 key verified via recipient ECC Private Key.</span>
            </div>

            <div className="space-y-3 text-sm">
              <div>
                <span className="text-xs font-bold text-slate-400 uppercase">Diagnosis & Clinical Summary</span>
                <p className="font-semibold text-slate-900 dark:text-white mt-0.5">
                  {selectedDecrypted.data.diagnosis || selectedDecrypted.record.diagnosis}
                </p>
              </div>

              {selectedDecrypted.data.prescriptions && (
                <div>
                  <span className="text-xs font-bold text-slate-400 uppercase">Prescriptions</span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {selectedDecrypted.data.prescriptions.map((p: string, idx: number) => (
                      <span key={idx} className="bg-blue-50 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200 text-xs px-2.5 py-1 rounded-lg border border-blue-200 dark:border-blue-800">
                        💊 {p}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {selectedDecrypted.data.labResults && (
                <div>
                  <span className="text-xs font-bold text-slate-400 uppercase">Lab & Diagnostic Findings</span>
                  <div className="space-y-1 mt-1">
                    {selectedDecrypted.data.labResults.map((l: string, idx: number) => (
                      <div key={idx} className="bg-slate-50 dark:bg-slate-800 p-2 rounded-lg text-xs font-mono text-slate-700 dark:text-slate-300">
                        🔬 {l}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <span className="text-xs font-bold text-slate-400 uppercase">Raw Cryptographic Proof</span>
                <pre className="mt-1 p-3 bg-slate-950 text-emerald-400 rounded-xl text-[10px] font-mono overflow-x-auto">
                  {JSON.stringify(
                    {
                      sha256LedgerHash: selectedDecrypted.record.sha256Hash,
                      fabricTxId: selectedDecrypted.record.fabricTxId,
                      ivAes: selectedDecrypted.record.ivAes,
                      eccEncryptedKeySnippet: selectedDecrypted.record.eccEncryptedAesKey.substring(0, 40) + '...',
                    },
                    null,
                    2
                  )}
                </pre>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setSelectedDecrypted(null)}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-semibold"
              >
                Close Vault Viewer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Consent Control Matrix */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white text-lg flex items-center gap-2">
              <FileCheck2 className="w-5 h-5 text-emerald-600" /> Patient Consent Management
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Grant or revoke record sharing permissions across hospitals in real time.
            </p>
          </div>
          <button
            onClick={() => setActiveTab('consent')}
            className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
          >
            Manage All Consents &rarr;
          </button>
        </div>

        <div className="space-y-3">
          {consents.map((c) => (
            <div
              key={c.id}
              className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-900 dark:text-white text-sm">{c.requestingHospitalName}</span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      c.status === 'GRANTED'
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                        : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                    }`}
                  >
                    {c.status}
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">Purpose: {c.purpose}</p>
                <p className="text-[10px] text-slate-400 font-mono mt-1">Fabric Tx: {c.fabricTxId}</p>
              </div>

              <button
                onClick={() => handleToggleConsent(c.id, c.status)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                  c.status === 'GRANTED'
                    ? 'bg-rose-100 text-rose-700 hover:bg-rose-200 dark:bg-rose-950/60 dark:text-rose-300'
                    : 'bg-emerald-600 text-white hover:bg-emerald-700'
                }`}
              >
                {c.status === 'GRANTED' ? 'Revoke Consent' : 'Grant Access'}
              </button>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};
