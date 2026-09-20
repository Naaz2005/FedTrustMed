import React, { useState, useEffect } from 'react';
import { ConsentRecord } from '../../types';
import { api } from '../../services/api';
import {
  FileCheck2,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Clock,
  Building2,
  Lock,
} from 'lucide-react';

export const ConsentManager: React.FC = () => {
  const [consents, setConsents] = useState<ConsentRecord[]>([]);

  const fetchConsents = async () => {
    try {
      const res = await api.getConsentRecords();
      if (res && res.consents) setConsents(res.consents);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchConsents();
  }, []);

  const handleGrant = async (id: string) => {
    await api.grantConsent(id);
    fetchConsents();
  };

  const handleRevoke = async (id: string) => {
    await api.revokeConsent(id);
    fetchConsents();
  };

  return (
    <div className="space-y-6">
      
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-emerald-800 via-teal-800 to-slate-900 rounded-3xl p-6 text-white shadow-xl border border-emerald-700/50">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2.5 py-0.5 rounded-full">
                Patient-Controlled Consent Matrix
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Consent & Access Control Center</h1>
            <p className="text-slate-300 text-sm mt-1 max-w-xl">
              Doctor requests record access &rarr; Patient approves or rejects &rarr; Consent state is committed as an immutable <strong>ConsentContract</strong> transaction on Hyperledger Fabric.
            </p>
          </div>
          <div className="bg-slate-950/80 p-3.5 rounded-2xl border border-emerald-800 text-xs text-emerald-300 font-bold shrink-0">
            Active Grants: {consents.filter((c) => c.status === 'GRANTED').length}
          </div>
        </div>
      </div>

      {/* Consent Records Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
        <h3 className="font-bold text-slate-900 dark:text-white text-base">
          Cross-Hospital Access & Consent Ledger
        </h3>

        <div className="space-y-3">
          {consents.map((c) => (
            <div
              key={c.id}
              className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 space-y-3"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 dark:text-white text-sm">{c.requestingHospitalName}</span>
                    <span
                      className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                        c.status === 'GRANTED'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                          : c.status === 'REVOKED'
                          ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                          : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                      }`}
                    >
                      {c.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                    Patient: <strong>{c.patientName}</strong> | Purpose: <em>{c.purpose}</em>
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {c.status !== 'GRANTED' && (
                    <button
                      onClick={() => handleGrant(c.id)}
                      className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all"
                    >
                      Grant Access
                    </button>
                  )}
                  {c.status !== 'REVOKED' && (
                    <button
                      onClick={() => handleRevoke(c.id)}
                      className="px-3.5 py-1.5 bg-rose-100 text-rose-700 hover:bg-rose-200 dark:bg-rose-950/80 dark:text-rose-300 rounded-xl text-xs font-bold transition-all"
                    >
                      Revoke Consent
                    </button>
                  )}
                </div>
              </div>

              <div className="p-2.5 bg-slate-950 text-slate-300 font-mono rounded-xl text-[10px] flex flex-wrap items-center justify-between gap-2">
                <span>Hyperledger Fabric Tx: {c.fabricTxId}</span>
                <span className="text-emerald-400">ConsentContract Verified</span>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};
