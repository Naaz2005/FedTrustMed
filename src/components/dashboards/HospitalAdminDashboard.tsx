import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Doctor, Hospital, FabricTransaction, ConsentRecord } from '../../types';
import { api } from '../../services/api';
import { UserApprovalManager } from '../admin/UserApprovalManager';
import {
  Building2,
  Users,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Blocks,
  FileCheck2,
  TrendingUp,
  Activity,
  Plus,
  UserCheck,
  Shield,
} from 'lucide-react';

export const HospitalAdminDashboard: React.FC<{ setActiveTab: (tab: string) => void }> = ({ setActiveTab }) => {
  const { user } = useAuth();
  const [adminView, setAdminView] = useState<'OVERVIEW' | 'APPROVALS'>('OVERVIEW');
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [transactions, setTransactions] = useState<FabricTransaction[]>([]);
  const [consents, setConsents] = useState<ConsentRecord[]>([]);

  const fetchData = async () => {
    try {
      const docRes = await api.getDoctors();
      if (docRes && docRes.doctors) setDoctors(docRes.doctors);

      const hospRes = await api.getHospitals();
      if (hospRes && hospRes.hospitals) setHospitals(hospRes.hospitals);

      const txRes = await api.getTransactions();
      if (txRes && txRes.transactions) setTransactions(txRes.transactions);

      const cstRes = await api.getConsentRecords();
      if (cstRes && cstRes.consents) setConsents(cstRes.consents);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const currentHospital = hospitals.find((h) => h.id === user?.hospitalId) || hospitals[0];

  return (
    <div className="space-y-6">
      
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-indigo-700 via-indigo-600 to-blue-700 rounded-3xl p-6 text-white shadow-xl shadow-indigo-500/10 relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold uppercase tracking-wider bg-white/20 px-2.5 py-0.5 rounded-full">
                Hospital Node Administration
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">{currentHospital?.name}</h1>
            <p className="text-indigo-100 text-sm mt-1 max-w-xl">
              Node Peer: <span className="font-mono">{currentHospital?.nodeAddress}</span> | MSP Endorsement Active. Manage medical staff, department authorizations, and inter-hospital consents.
            </p>
          </div>
          <div className="bg-white/10 backdrop-blur-md border border-white/20 p-4 rounded-2xl flex items-center gap-4 shrink-0">
            <div>
              <div className="text-xs text-indigo-200">Hospital Trust Index</div>
              <div className="text-2xl font-black">{currentHospital?.trustScore || 96} / 100</div>
            </div>
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
              <TrendingUp className="w-7 h-7 text-emerald-300" />
            </div>
          </div>
        </div>
      </div>

      {/* Sub-Navigation Bar */}
      <div className="flex bg-slate-200/80 dark:bg-slate-800/80 p-1.5 rounded-2xl border border-slate-300 dark:border-slate-700">
        <button
          onClick={() => setAdminView('OVERVIEW')}
          className={`flex-1 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all ${
            adminView === 'OVERVIEW'
              ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-md'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Building2 className="w-4 h-4" /> Hospital Node Overview
        </button>
        <button
          onClick={() => setAdminView('APPROVALS')}
          className={`flex-1 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all ${
            adminView === 'APPROVALS'
              ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-md'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <UserCheck className="w-4 h-4 text-emerald-500" /> Staff Registration & Access Approvals
        </button>
      </div>

      {adminView === 'APPROVALS' ? (
        <UserApprovalManager />
      ) : (
        <>
          {/* Hospital Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-sm">
              <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
                <span>Medical Doctors</span>
                <Users className="w-4 h-4 text-indigo-600" />
              </div>
              <div className="text-2xl font-bold text-slate-900 dark:text-white mt-2">{currentHospital?.doctorsCount || 45} Staff</div>
              <div className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1 font-medium">All Verified & Credentials Signed</div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-sm">
              <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
                <span>Registered Patients</span>
                <Users className="w-4 h-4 text-blue-600" />
              </div>
              <div className="text-2xl font-bold text-slate-900 dark:text-white mt-2">{currentHospital?.patientsCount || 1200}</div>
              <div className="text-[11px] text-blue-600 dark:text-blue-400 mt-1 font-medium">Self-Sovereign Identity</div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-sm">
              <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
                <span>Encrypted Records</span>
                <Building2 className="w-4 h-4 text-purple-600" />
              </div>
              <div className="text-2xl font-bold text-slate-900 dark:text-white mt-2">{currentHospital?.recordsCount || 3400}</div>
              <div className="text-[11px] text-purple-600 dark:text-purple-400 mt-1 font-medium">PostgreSQL + Fabric Hashes</div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-sm">
              <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
                <span>FedAvg Model Version</span>
                <Activity className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-2xl font-bold text-slate-900 dark:text-white mt-2">v{currentHospital?.federatedWeightVersion || 3}.0</div>
              <div className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1 font-medium">Synced with FedTrustMed Network</div>
            </div>
          </div>

          {/* Medical Staff Management & Fabric Ledger */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Left: Manage Doctors & Departments */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
                  <Users className="w-5 h-5 text-indigo-600" /> Hospital Staff & Departments
                </h3>
                <button
                  onClick={() => setAdminView('APPROVALS')}
                  className="px-3 py-1.5 rounded-xl bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 hover:bg-indigo-100 font-semibold text-xs flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Authorize Registration
                </button>
              </div>

              <div className="space-y-3">
                {doctors.map((d) => (
                  <div key={d.id} className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 flex items-center justify-between gap-3">
                    <div>
                      <div className="font-bold text-xs text-slate-900 dark:text-white">{d.fullName}</div>
                      <div className="text-[11px] text-slate-500">{d.specialty} | {d.departmentName}</div>
                      <div className="text-[10px] font-mono text-slate-400 mt-0.5">License: {d.licenseNumber}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400">TS: {d.trustScore}</div>
                      <div className="text-[10px] text-slate-400">{d.assignedPatientsCount} Patients</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: Hospital Blockchain Transactions */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
                  <Blocks className="w-5 h-5 text-blue-600" /> MSP Endorsed Transactions
                </h3>
                <button onClick={() => setActiveTab('blockchain')} className="text-xs font-semibold text-blue-600 hover:underline">
                  View All &rarr;
                </button>
              </div>

              <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                {transactions.map((tx) => (
                  <div key={tx.txId} className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 text-xs space-y-1">
                    <div className="flex items-center justify-between font-mono font-semibold">
                      <span className="text-blue-600 dark:text-blue-400">{tx.txId}</span>
                      <span className="text-emerald-600 text-[10px] bg-emerald-100 dark:bg-emerald-950 px-2 py-0.5 rounded-full">
                        {tx.status}
                      </span>
                    </div>
                    <div className="text-slate-700 dark:text-slate-300 font-medium">
                      Contract: <strong>{tx.chaincode}</strong> &rarr; <span className="font-mono text-indigo-600 dark:text-indigo-400">{tx.functionName}()</span>
                    </div>
                    <div className="text-[10px] text-slate-400 flex items-center justify-between">
                      <span>Origin: {tx.originHospital}</span>
                      <span>Endorsers: {tx.endorsedBy.length} MSP Nodes</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </>
      )}

    </div>
  );
};
