import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Hospital, AIThreatAlert, FabricBlock, TrustScoreFactor } from '../../types';
import { api } from '../../services/api';
import { UserApprovalManager } from '../admin/UserApprovalManager';
import {
  ShieldAlert,
  Building2,
  Blocks,
  Activity,
  Zap,
  CheckCircle2,
  Lock,
  RefreshCw,
  Terminal,
  TrendingDown,
  AlertTriangle,
  UserCheck,
  Shield,
} from 'lucide-react';

export const SystemAdminDashboard: React.FC<{ setActiveTab: (tab: string) => void }> = ({ setActiveTab }) => {
  const { user } = useAuth();
  const [adminView, setAdminView] = useState<'OVERVIEW' | 'APPROVALS'>('OVERVIEW');
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [threats, setThreats] = useState<AIThreatAlert[]>([]);
  const [blocks, setBlocks] = useState<FabricBlock[]>([]);
  const [trustLogs, setTrustLogs] = useState<TrustScoreFactor[]>([]);

  // Cyber Attack Simulator Form State
  const [simAttackType, setSimAttackType] = useState<string>('BRUTE_FORCE');
  const [simTargetUser, setSimTargetUser] = useState<string>('dr_robert@hospital-a.com');
  const [simTargetHospital, setSimTargetHospital] = useState<string>('HOSP-A');
  const [simResult, setSimResult] = useState<any | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);

  const fetchData = async () => {
    try {
      const hospRes = await api.getHospitals();
      if (hospRes && hospRes.hospitals) setHospitals(hospRes.hospitals);

      const threatRes = await api.getThreats();
      if (threatRes && threatRes.alerts) setThreats(threatRes.alerts);

      const blockRes = await api.getBlocks();
      if (blockRes && blockRes.blocks) setBlocks(blockRes.blocks);

      const logRes = await api.getTrustLogs();
      if (logRes && logRes.logs) setTrustLogs(logRes.logs);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleRunAttackSimulation = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSimulating(true);

    try {
      const res = await api.simulateAttack({
        attackType: simAttackType,
        targetUserEmail: simTargetUser,
        targetHospitalCode: simTargetHospital,
      });

      if (res) {
        setSimResult(res);
        fetchData();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSimulating(false);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-6 text-white shadow-xl border border-slate-800 relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold uppercase tracking-wider bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2.5 py-0.5 rounded-full">
                System Administrator & Cyber Defense Command
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Root Network Operations</h1>
            <p className="text-slate-300 text-sm mt-1 max-w-xl">
              Monitors all 3 Hospital Peers, Hyperledger Fabric consensus ledger, User Approvals Queue, and AI Threat Detection.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setActiveTab('threats')}
              className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-md flex items-center gap-2 transition-all"
            >
              <ShieldAlert className="w-4 h-4" /> Threat Matrix
            </button>
            <button
              onClick={() => setActiveTab('federated')}
              className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md flex items-center gap-2 transition-all"
            >
              <Activity className="w-4 h-4" /> Federated AI
            </button>
          </div>
        </div>
      </div>

      {/* Mode Sub-Navigation Bar */}
      <div className="flex bg-slate-200/80 dark:bg-slate-800/80 p-1.5 rounded-2xl border border-slate-300 dark:border-slate-700">
        <button
          onClick={() => setAdminView('OVERVIEW')}
          className={`flex-1 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all ${
            adminView === 'OVERVIEW'
              ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-md'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Shield className="w-4 h-4" /> System Health & Cyber Simulator
        </button>
        <button
          onClick={() => setAdminView('APPROVALS')}
          className={`flex-1 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all ${
            adminView === 'APPROVALS'
              ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-md'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <UserCheck className="w-4 h-4 text-emerald-500" /> User Approvals & Access Control Matrix
        </button>
      </div>

      {adminView === 'APPROVALS' ? (
        <UserApprovalManager />
      ) : (
        <>
          {/* Cyber Attack Live Simulator Banner */}
          <div className="bg-gradient-to-br from-rose-950/80 via-slate-900 to-rose-950/40 border border-rose-900/60 rounded-3xl p-6 shadow-xl text-white space-y-4">
            <div className="flex items-center justify-between border-b border-rose-900/50 pb-3">
              <div className="flex items-center gap-2">
                <Zap className="w-6 h-6 text-rose-500 animate-pulse" />
                <h3 className="font-bold text-lg text-rose-100">Interactive Cyber Attack & Threat Simulator</h3>
              </div>
              <span className="text-xs font-semibold uppercase bg-rose-500/20 text-rose-300 px-2.5 py-0.5 rounded-full border border-rose-500/40">
                Live AI Sandbox
              </span>
            </div>

            <p className="text-xs text-slate-300">
              Trigger simulated cyber security threats to test AI Threat Detection interception and witness automatic Trust Score penalties (-5 to -40 points) and instant account freezing when score drops &lt; 40!
            </p>

            <form onSubmit={handleRunAttackSimulation} className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="font-bold text-slate-300">Select Cyber Threat Vectors</label>
                <select
                  value={simAttackType}
                  onChange={(e) => setSimAttackType(e.target.value)}
                  className="w-full mt-1 p-2.5 rounded-xl border border-rose-900/80 bg-slate-950 text-white font-semibold"
                >
                  <option value="BRUTE_FORCE">Brute Force Login (-20 Trust)</option>
                  <option value="SQL_INJECTION">SQL Injection Attempt (-40 Trust)</option>
                  <option value="DDOS_SIMULATION">DDoS Traffic Burst (-30 Trust)</option>
                  <option value="CREDENTIAL_STUFFING">Credential Stuffing (-20 Trust)</option>
                  <option value="EXCESSIVE_DOWNLOADS">Excessive File Downloads (-30 Trust)</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-300">Target User Account</label>
                <input
                  type="email"
                  value={simTargetUser}
                  onChange={(e) => setSimTargetUser(e.target.value)}
                  className="w-full mt-1 p-2.5 rounded-xl border border-rose-900/80 bg-slate-950 text-white font-semibold"
                />
              </div>

              <div>
                <label className="font-bold text-slate-300">Target Hospital MSP Node</label>
                <select
                  value={simTargetHospital}
                  onChange={(e) => setSimTargetHospital(e.target.value)}
                  className="w-full mt-1 p-2.5 rounded-xl border border-rose-900/80 bg-slate-950 text-white font-semibold"
                >
                  <option value="HOSP-A">St. Jude General (HOSP-A)</option>
                  <option value="HOSP-B">Metro Heart Specialty (HOSP-B)</option>
                  <option value="HOSP-C">City Memorial (HOSP-C)</option>
                </select>
              </div>

              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={isSimulating}
                  className="w-full py-2.5 px-4 bg-rose-600 hover:bg-rose-700 font-bold text-white rounded-xl shadow-lg shadow-rose-600/30 flex items-center justify-center gap-2 transition-all"
                >
                  <Zap className="w-4 h-4" /> {isSimulating ? 'Simulating Attack...' : 'Launch Attack Vector'}
                </button>
              </div>
            </form>

            {/* Simulation Output Card */}
            {simResult && (
              <div className="p-4 rounded-2xl bg-slate-950 border border-rose-800/80 space-y-2 font-mono text-xs text-rose-200">
                <div className="font-bold text-rose-400 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-500" />
                  <span>AI Threat Detector Reaction Output</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] pt-1">
                  <div>
                    <span className="text-slate-400">Threat Detected:</span> {simResult.alert?.threatType}
                  </div>
                  <div>
                    <span className="text-slate-400">Severity:</span> {simResult.alert?.severity}
                  </div>
                  <div>
                    <span className="text-slate-400">Score Impact:</span> {simResult.trustResult?.scoreChange} pts
                  </div>
                </div>
                <div className="text-[11px] pt-1 border-t border-slate-800 text-slate-300 flex items-center justify-between">
                  <span>New User Trust Score: <strong>{simResult.updatedUser?.trustScore} / 100</strong></span>
                  {simResult.updatedUser?.isFrozen ? (
                    <span className="text-rose-400 font-bold flex items-center gap-1">
                      <Lock className="w-3.5 h-3.5" /> ACCOUNT FROZEN (Score &lt; 40)
                    </span>
                  ) : (
                    <span className="text-amber-400 font-semibold">Account Warning Issued</span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Network Overview Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Hospitals Network Peer Status */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-indigo-600" /> Federated Hospital Peer Nodes
                </h3>
                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> 3 Nodes Online
                </span>
              </div>

              <div className="space-y-3">
                {hospitals.map((h) => (
                  <div
                    key={h.id}
                    className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-slate-900 dark:text-white">{h.name}</span>
                      <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                        {h.status}
                      </span>
                    </div>

                    <div className="text-xs text-slate-500 font-mono">
                      Address: {h.nodeAddress} | Code: {h.code}
                    </div>

                    <div className="flex items-center justify-between pt-1 text-xs border-t border-slate-200 dark:border-slate-700/60">
                      <span className="text-slate-600 dark:text-slate-400">
                        Doctors: <strong>{h.doctorsCount}</strong> | Patients: <strong>{h.patientsCount}</strong>
                      </span>
                      <span className="font-bold text-blue-600 dark:text-blue-400">Trust Score: {h.trustScore}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Dynamic Trust Score Penalties History */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
                  <TrendingDown className="w-5 h-5 text-rose-500" /> Recent Dynamic Trust Score Audits
                </h3>
                <button onClick={() => setActiveTab('trust')} className="text-xs font-semibold text-rose-600 hover:underline">
                  Trust Matrix &rarr;
                </button>
              </div>

              <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                {trustLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between font-semibold">
                      <span className="text-slate-900 dark:text-white">{log.reason}</span>
                      <span
                        className={`font-bold px-2 py-0.5 rounded-md ${
                          log.scoreChange > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {log.scoreChange > 0 ? `+${log.scoreChange}` : log.scoreChange} pts
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400 flex items-center justify-between">
                      <span>Target: {log.targetId}</span>
                      <span>Resulting Score: {log.resultingScore}</span>
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
