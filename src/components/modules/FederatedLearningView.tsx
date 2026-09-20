import React, { useState, useEffect } from 'react';
import { FederatedModelNode, FederatedRound } from '../../types';
import { api } from '../../services/api';
import {
  BrainCircuit,
  Building2,
  Activity,
  Zap,
  CheckCircle2,
  Lock,
  Layers,
  TrendingUp,
} from 'lucide-react';

export const FederatedLearningView: React.FC = () => {
  const [nodes, setNodes] = useState<FederatedModelNode[]>([]);
  const [rounds, setRounds] = useState<FederatedRound[]>([]);
  const [isTraining, setIsTraining] = useState(false);

  const fetchStatus = async () => {
    try {
      const res = await api.getFederatedStatus();
      if (res) {
        if (res.nodes) setNodes(res.nodes);
        if (res.rounds) setRounds(res.rounds);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleRunRound = async () => {
    setIsTraining(true);
    try {
      await api.runFederatedRound();
      fetchStatus();
    } catch (e) {
      console.error(e);
    } finally {
      setIsTraining(false);
    }
  };

  const latestRound = rounds[rounds.length - 1];

  return (
    <div className="space-y-6">
      
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-indigo-900 via-blue-900 to-slate-900 rounded-3xl p-6 text-white shadow-xl border border-indigo-800/60">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2.5 py-0.5 rounded-full">
                Privacy-Preserving Federated AI Architecture
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Federated Learning (FedAvg) Simulator</h1>
            <p className="text-slate-300 text-sm mt-1 max-w-xl">
              Simulates 3 Hospital Nodes (Hospital A, B, C). Each hospital trains a local AI model on private records. <strong>Patient raw data NEVER leaves the hospital node.</strong> Only weight gradients are aggregated centrally.
            </p>
          </div>
          <button
            onClick={handleRunRound}
            disabled={isTraining}
            className="px-5 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-extrabold text-xs rounded-2xl shadow-xl shadow-indigo-500/20 flex items-center gap-2 transition-all shrink-0"
          >
            <Zap className="w-4 h-4 text-amber-300" /> {isTraining ? 'Running FedAvg Round...' : 'Execute Federated Training Round'}
          </button>
        </div>
      </div>

      {/* Global FedAvg Model Performance Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-sm">
          <div className="text-xs font-semibold text-slate-400">Current Federated Round</div>
          <div className="text-3xl font-black text-slate-900 dark:text-white mt-1">
            Round #{latestRound?.roundNumber || 3}
          </div>
          <div className="text-[11px] text-indigo-600 dark:text-indigo-400 font-medium mt-1">3 Hospital MSP Nodes Synced</div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-sm">
          <div className="text-xs font-semibold text-slate-400">Global Model Accuracy</div>
          <div className="text-3xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
            {latestRound?.globalAccuracy || 94.1}%
          </div>
          <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium mt-1">FedAvg Aggregation Weighted</div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-sm">
          <div className="text-xs font-semibold text-slate-400">Global Cross-Entropy Loss</div>
          <div className="text-3xl font-black text-blue-600 dark:text-blue-400 mt-1">
            {latestRound?.globalLoss || 0.191}
          </div>
          <div className="text-[11px] text-blue-600 dark:text-blue-400 font-medium mt-1">Converging Smoothly</div>
        </div>
      </div>

      {/* 3 Hospital Local Nodes Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {nodes.map((node) => (
          <div
            key={node.hospitalId}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4 relative overflow-hidden"
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-slate-900 dark:text-white text-sm">{node.hospitalName}</h3>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Local Training Samples:</span>
                <span className="font-bold text-slate-900 dark:text-white">{node.localSamples} Patients</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-400">Local Model Accuracy:</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">{node.localAccuracy}%</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-400">Local Loss:</span>
                <span className="font-bold text-blue-600 dark:text-blue-400">{node.localLoss}</span>
              </div>

              <div>
                <span className="text-slate-400 uppercase text-[10px] font-bold">Local Weight Parameter Hash</span>
                <div className="p-2 bg-slate-950 text-indigo-300 font-mono text-[10px] rounded-xl mt-1 break-all">
                  {node.modelWeightsHash}
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px]">
                <span className="text-emerald-600 font-bold flex items-center gap-1">
                  <Lock className="w-3.5 h-3.5" /> Data Stays On-Premise
                </span>
                <span className="text-slate-400">{node.status}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Historical Training Rounds Log */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
        <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
          <Layers className="w-5 h-5 text-indigo-600" /> Historical Federated Rounds & Weight Signatures
        </h3>

        <div className="space-y-3">
          {rounds.map((r) => (
            <div key={r.roundNumber} className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 text-xs space-y-2">
              <div className="flex items-center justify-between font-bold">
                <span className="text-slate-900 dark:text-white text-sm">Federated Round #{r.roundNumber}</span>
                <span className="text-slate-400 text-[11px] font-mono">{new Date(r.timestamp).toLocaleString()}</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-slate-600 dark:text-slate-300 font-medium">
                <div>Global Accuracy: <strong className="text-emerald-600">{r.globalAccuracy}%</strong></div>
                <div>Global Loss: <strong className="text-blue-600">{r.globalLoss}</strong></div>
                <div>Participating Orgs: <strong>3 Hospitals</strong></div>
                <div>Status: <strong className="text-emerald-500">Fabric Endorsed</strong></div>
              </div>

              <div className="p-2 bg-slate-950 text-slate-300 font-mono text-[10px] rounded-xl">
                Aggregate Weight Hash: {r.aggregateWeightsHash}
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};
