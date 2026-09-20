import React, { useState, useEffect } from 'react';
import { User, TrustScoreFactor } from '../../types';
import { api } from '../../services/api';
import {
  TrendingUp,
  ShieldCheck,
  AlertTriangle,
  Lock,
  Zap,
  CheckCircle2,
  Sliders,
} from 'lucide-react';

export const TrustScoreMatrix: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [trustLogs, setTrustLogs] = useState<TrustScoreFactor[]>([]);
  const [selectedUser, setSelectedUser] = useState<string>('usr-patient-1');
  const [eventChoice, setEventChoice] = useState<string>('SUCCESSFUL_LOGIN');
  const [reasonInput, setReasonInput] = useState('');

  const fetchData = async () => {
    try {
      const scoreData = await api.getTrustScores();
      if (scoreData && scoreData.users) setUsers(scoreData.users);

      const logData = await api.getTrustLogs();
      if (logData && logData.logs) setTrustLogs(logData.logs);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleApplyAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.adjustTrustScore({
        targetId: selectedUser,
        targetType: 'USER',
        event: eventChoice,
        reason: reasonInput || undefined,
      });
      setReasonInput('');
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-purple-950 rounded-3xl p-6 text-white shadow-xl border border-indigo-800/60">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold uppercase tracking-wider bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2.5 py-0.5 rounded-full">
                Real-Time Dynamic Trust Engine
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Adaptive Reputation & Access Matrix</h1>
            <p className="text-slate-300 text-sm mt-1 max-w-xl">
              Calculates user trust dynamically based on authentication behavior, access patterns, and file download rates. Scores drop &lt; 40 auto-freeze accounts and trigger Fabric blockchain transactions.
            </p>
          </div>
        </div>
      </div>

      {/* Rules Rulebook Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50">
          <div className="text-xs font-bold text-emerald-800 dark:text-emerald-200">Successful Login</div>
          <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">+2 pts</div>
          <p className="text-[10px] text-slate-500 mt-0.5">MFA Verification Passed</p>
        </div>

        <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50">
          <div className="text-xs font-bold text-amber-800 dark:text-amber-200">Failed Login</div>
          <div className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1">-5 pts</div>
          <p className="text-[10px] text-slate-500 mt-0.5">Credential Mismatch</p>
        </div>

        <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50">
          <div className="text-xs font-bold text-rose-800 dark:text-rose-200">Repeated Failure</div>
          <div className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-1">-20 pts</div>
          <p className="text-[10px] text-slate-500 mt-0.5">Brute Force Suspected</p>
        </div>

        <div className="p-3.5 rounded-2xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-900/50">
          <div className="text-xs font-bold text-purple-800 dark:text-purple-200">Unauthorized Access</div>
          <div className="text-2xl font-black text-purple-600 dark:text-purple-400 mt-1">-40 pts</div>
          <p className="text-[10px] text-slate-500 mt-0.5">Consent Violation</p>
        </div>

        <div className="p-3.5 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900/50">
          <div className="text-xs font-bold text-indigo-800 dark:text-indigo-200">Excess Downloads</div>
          <div className="text-2xl font-black text-indigo-600 dark:text-indigo-400 mt-1">-30 pts</div>
          <p className="text-[10px] text-slate-500 mt-0.5">Rapid Retrieval Spike</p>
        </div>
      </div>

      {/* Trust Score Adjustment Controls & User Scores */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left 2 Cols: User Trust Scores List */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm">
          <h3 className="font-bold text-slate-900 dark:text-white text-base mb-4">
            Active Accounts & Trust Score Status
          </h3>

          <div className="space-y-3">
            {users.map((u) => (
              <div
                key={u.id}
                className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex items-center justify-between gap-4"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 dark:text-white text-sm">{u.fullName}</span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200">
                      {u.role}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">{u.email} | {u.hospitalName}</p>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <div className="text-lg font-black text-slate-900 dark:text-white">{u.trustScore} / 100</div>
                    {u.isFrozen ? (
                      <span className="text-[10px] text-rose-500 font-bold flex items-center gap-1 justify-end">
                        <Lock className="w-3 h-3" /> Account Frozen (&lt; 40)
                      </span>
                    ) : (
                      <span className="text-[10px] text-emerald-500 font-semibold">Account Active</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Col: Admin Adjustment Form */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
          <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
            <Sliders className="w-5 h-5 text-indigo-600" /> Manual Trust Evaluator
          </h3>

          <form onSubmit={handleApplyAdjustment} className="space-y-3 text-xs">
            <div>
              <label className="font-semibold text-slate-700 dark:text-slate-300">Target User</label>
              <select
                value={selectedUser}
                onChange={(e) => setSelectedUser(e.target.value)}
                className="w-full mt-1 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName} ({u.role}) - Current: {u.trustScore}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="font-semibold text-slate-700 dark:text-slate-300">Trigger Event Rule</label>
              <select
                value={eventChoice}
                onChange={(e) => setEventChoice(e.target.value)}
                className="w-full mt-1 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              >
                <option value="SUCCESSFUL_LOGIN">Successful Login (+2 pts)</option>
                <option value="FAILED_LOGIN">Failed Login (-5 pts)</option>
                <option value="REPEATED_FAILED_LOGIN">Repeated Failed Login (-20 pts)</option>
                <option value="UNAUTHORIZED_ACCESS">Unauthorized Record Access (-40 pts)</option>
                <option value="EXCESSIVE_DOWNLOADS">Excessive Downloads (-30 pts)</option>
                <option value="MANUAL_BONUS">Compliance Bonus (+10 pts)</option>
              </select>
            </div>

            <div>
              <label className="font-semibold text-slate-700 dark:text-slate-300">Custom Reason Notes</label>
              <input
                type="text"
                placeholder="e.g. Annual HIPAA compliance review"
                value={reasonInput}
                onChange={(e) => setReasonInput(e.target.value)}
                className="w-full mt-1 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md transition-all"
            >
              Apply Trust Score Rule
            </button>
          </form>
        </div>

      </div>

    </div>
  );
};
