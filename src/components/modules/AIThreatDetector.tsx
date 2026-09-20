import React, { useState, useEffect } from 'react';
import { AIThreatAlert, ModelPerformanceMetrics } from '../../types';
import { api } from '../../services/api';
import {
  ShieldAlert,
  Zap,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  Cpu,
  Activity,
  BarChart3,
  Sliders,
  Play,
  Database,
} from 'lucide-react';

export const AIThreatDetector: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'IDRSN_BENCHMARK' | 'ATTACK_LOGS'>('IDRSN_BENCHMARK');
  const [alerts, setAlerts] = useState<AIThreatAlert[]>([]);
  const [isSimulating, setIsSimulating] = useState(false);

  // IDRSN & BSTOA Benchmark Metrics
  const [metrics, setMetrics] = useState<ModelPerformanceMetrics[]>([]);
  const [bstoaParams, setBstoaParams] = useState<any>(null);

  // IDRSN Live Classifier Form State
  const [datasetChoice, setDatasetChoice] = useState<'ToN-IoT' | 'CICIDS-2017'>('ToN-IoT');
  const [flowDuration, setFlowDuration] = useState(2500);
  const [fwdPackets, setFwdPackets] = useState(150);
  const [bwdPackets, setBwdPackets] = useState(2);
  const [flowBytesPerSec, setFlowBytesPerSec] = useState(65000);
  const [synFlags, setSynFlags] = useState(120);
  const [destPort, setDestPort] = useState(80);
  const [ipSource, setIpSource] = useState('192.168.1.188');
  const [classificationResult, setClassificationResult] = useState<any>(null);
  const [classifying, setClassifying] = useState(false);

  const fetchThreats = async () => {
    try {
      const res = await api.getThreats();
      if (res && res.alerts) setAlerts(res.alerts);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchIdrsnMetrics = async () => {
    try {
      const res = await api.getIdrsnMetrics();
      if (res && res.metrics) {
        setMetrics(res.metrics);
        setBstoaParams(res.bstoaParams);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchThreats();
    fetchIdrsnMetrics();
  }, []);

  const handleTriggerAttack = async (type: string) => {
    setIsSimulating(true);
    try {
      await api.simulateAttack({
        attackType: type,
        targetUserEmail: 'dr_robert@hospital-a.com',
        targetHospitalCode: 'HOSP-A',
      });
      fetchThreats();
    } catch (e) {
      console.error(e);
    } finally {
      setIsSimulating(false);
    }
  };

  const handleRunIdrsnClassify = async (e: React.FormEvent) => {
    e.preventDefault();
    setClassifying(true);
    setClassificationResult(null);
    try {
      const res = await api.classifyTrafficIdrsn({
        flowDuration,
        totalFwdPackets: fwdPackets,
        totalBwdPackets: bwdPackets,
        flowBytesPerSec,
        synFlagCount: synFlags,
        destPort,
        ipSource,
        datasetOrigin: datasetChoice,
      });
      setClassificationResult(res);
      fetchThreats();
    } catch (err) {
      console.error(err);
    } finally {
      setClassifying(false);
    }
  };

  const handleResolve = async (id: string) => {
    await api.resolveAlert(id);
    fetchThreats();
  };

  const getSeverityBadge = (sev: AIThreatAlert['severity']) => {
    switch (sev) {
      case 'CRITICAL':
        return 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border-rose-300';
      case 'HIGH':
        return 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-300';
      case 'MEDIUM':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300 border-yellow-300';
      default:
        return 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border-blue-300';
    }
  };

  return (
    <div className="space-y-6 font-sans">
      
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-rose-950 via-slate-900 to-indigo-950 rounded-3xl p-6 text-white shadow-xl border border-rose-900/60">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold uppercase tracking-wider bg-rose-500/20 text-rose-300 border border-rose-500/30 px-2.5 py-0.5 rounded-full">
                IDRSN + BSTOA Cyber Security Intelligence
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Attack Detection & Evaluation Model</h1>
            <p className="text-slate-300 text-sm mt-1 max-w-xl">
              Uses <strong>Improved Deep Residual Shrinking Network (IDRSN)</strong> with soft thresholding and <strong>Boosted Sooty Tern Optimization Algorithm (BSTOA)</strong> on <strong>ToN-IoT</strong> & <strong>CICIDS-2017</strong> datasets.
            </p>
          </div>

          <div className="flex items-center gap-2 bg-slate-950/80 p-3 rounded-2xl border border-rose-900/60 font-mono text-xs text-rose-300">
            <Cpu className="w-5 h-5 text-rose-400" />
            <div>
              <div>Model: IDRSN + Soft Thresholding</div>
              <div>Optimizer: BSTOA Meta-Heuristic</div>
            </div>
          </div>
        </div>

        {/* Tab Buttons */}
        <div className="flex items-center gap-2 mt-6 border-t border-slate-800/80 pt-4">
          <button
            onClick={() => setActiveTab('IDRSN_BENCHMARK')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'IDRSN_BENCHMARK'
                ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/30'
                : 'bg-slate-950/60 text-slate-400 hover:text-white'
            }`}
          >
            <BarChart3 className="w-4 h-4" /> IDRSN + BSTOA Benchmark Evaluation
          </button>
          <button
            onClick={() => setActiveTab('ATTACK_LOGS')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'ATTACK_LOGS'
                ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/30'
                : 'bg-slate-950/60 text-slate-400 hover:text-white'
            }`}
          >
            <ShieldAlert className="w-4 h-4" /> Active Threats Feed ({alerts.length})
          </button>
        </div>
      </div>

      {activeTab === 'IDRSN_BENCHMARK' && (
        <div className="space-y-6">
          
          {/* Performance Benchmark Comparison Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {metrics.map((m) => (
              <div key={m.datasetName} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <Database className="w-5 h-5 text-rose-500" />
                    <div>
                      <h3 className="font-bold text-slate-900 dark:text-white text-base">Dataset Experiment: {m.datasetName}</h3>
                      <p className="text-[11px] text-slate-500">Tested on {m.totalSamplesTested.toLocaleString()} traffic records</p>
                    </div>
                  </div>
                  <span className="text-xs font-mono font-bold bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-300 px-2.5 py-1 rounded-xl border border-rose-200 dark:border-rose-900">
                    IDRSN + BSTOA
                  </span>
                </div>

                {/* Metrics 4-Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700">
                    <div className="text-[10px] uppercase font-bold text-slate-400">Accuracy</div>
                    <div className="text-lg font-extrabold text-emerald-600 dark:text-emerald-400">{m.accuracy}%</div>
                  </div>
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700">
                    <div className="text-[10px] uppercase font-bold text-slate-400">Precision</div>
                    <div className="text-lg font-extrabold text-blue-600 dark:text-blue-400">{m.precision}%</div>
                  </div>
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700">
                    <div className="text-[10px] uppercase font-bold text-slate-400">Recall</div>
                    <div className="text-lg font-extrabold text-indigo-600 dark:text-indigo-400">{m.recall}%</div>
                  </div>
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700">
                    <div className="text-[10px] uppercase font-bold text-slate-400">F1-Score</div>
                    <div className="text-lg font-extrabold text-purple-600 dark:text-purple-400">{m.f1Score}%</div>
                  </div>
                </div>

                {/* Timing Latencies */}
                <div className="p-3 bg-slate-950 text-slate-300 rounded-2xl font-mono text-xs flex items-center justify-between">
                  <span className="text-slate-400">Encryption Latency: <strong className="text-emerald-400">{m.encryptionTimeMs} ms</strong></span>
                  <span className="text-slate-400">Decryption Latency: <strong className="text-teal-400">{m.decryptionTimeMs} ms</strong></span>
                </div>
              </div>
            ))}
          </div>

          {/* IDRSN Live Classifier Console */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
            <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
                <Sliders className="w-5 h-5 text-rose-600" /> Interactive IDRSN Live Network Traffic Classifier
              </h3>
              <p className="text-xs text-slate-500">Test soft-threshold residual shrinking network inference on arbitrary IoT flow vectors</p>
            </div>

            <form onSubmit={handleRunIdrsnClassify} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Dataset Archetype</label>
                  <select
                    value={datasetChoice}
                    onChange={(e) => setDatasetChoice(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none"
                  >
                    <option value="ToN-IoT">ToN-IoT (IoT Telemetry Benchmark)</option>
                    <option value="CICIDS-2017">CICIDS-2017 (Intrusion Detection Benchmark)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">SYN Flag Count</label>
                  <input
                    type="number"
                    value={synFlags}
                    onChange={(e) => setSynFlags(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Destination Port</label>
                  <input
                    type="number"
                    value={destPort}
                    onChange={(e) => setDestPort(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Flow Bytes / Sec</label>
                  <input
                    type="number"
                    value={flowBytesPerSec}
                    onChange={(e) => setFlowBytesPerSec(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={classifying}
                className="py-3 px-6 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl shadow-lg shadow-rose-600/30 flex items-center gap-2 transition-all"
              >
                <Play className="w-4 h-4 fill-current" /> {classifying ? 'Running IDRSN Inference...' : 'Classify Traffic with IDRSN + Soft Thresholding'}
              </button>
            </form>

            {classificationResult && (
              <div className={`p-4 rounded-2xl border ${classificationResult.isMalicious ? 'bg-rose-950 text-rose-100 border-rose-800' : 'bg-emerald-950 text-emerald-100 border-emerald-800'} space-y-2 text-xs font-mono`}>
                <div className="flex items-center justify-between font-bold text-sm">
                  <span>IDRSN Decision: {classificationResult.isMalicious ? '⚠️ MALICIOUS THREAT DETECTED' : '✅ NORMAL TRAFFIC FLOW'}</span>
                  <span>Confidence: {classificationResult.confidencePercent}%</span>
                </div>
                <p className="text-[11px] opacity-90">{classificationResult.description}</p>
                <div className="text-[10px] opacity-75">
                  Processed in {classificationResult.processedMs} ms | BSTOA Hyperparameter Optimized: Yes
                </div>
              </div>
            )}
          </div>

        </div>
      )}

      {activeTab === 'ATTACK_LOGS' && (
        <div className="space-y-6">
          {/* Cyber Attack Launch Bar */}
          <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
              <Zap className="w-5 h-5 text-rose-500" /> Quick Launch Cyber Attack Simulator
            </h3>
            <p className="text-xs text-slate-500">
              Click any vector below to trigger an immediate attack simulation and observe AI response:
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              {[
                { id: 'BRUTE_FORCE', label: 'Brute Force' },
                { id: 'SQL_INJECTION', label: 'SQL Injection' },
                { id: 'DDOS_SIMULATION', label: 'DDoS Burst' },
                { id: 'CREDENTIAL_STUFFING', label: 'Cred Stuffing' },
                { id: 'ABNORMAL_BEHAVIOR', label: 'Anomalous User' },
                { id: 'EXCESSIVE_DOWNLOADS', label: 'Bulk Download' },
              ].map((v) => (
                <button
                  key={v.id}
                  disabled={isSimulating}
                  onClick={() => handleTriggerAttack(v.id)}
                  className="p-3 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-900 dark:text-rose-200 font-bold text-xs text-center transition-all shadow-sm"
                >
                  🚀 {v.label}
                </button>
              ))}
            </div>
          </div>

          {/* Security Alerts Log */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-rose-600" /> Active Security Alerts Feed
              </h3>
              <span className="text-xs text-slate-400 font-medium">{alerts.length} Incident Logs</span>
            </div>

            <div className="space-y-3">
              {alerts.map((a) => (
                <div
                  key={a.id}
                  className={`p-4 rounded-2xl border ${
                    a.status === 'ACTIVE'
                      ? 'bg-rose-50/60 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900/60'
                      : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800'
                  } space-y-2 text-xs`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 dark:text-white text-sm">{a.threatType}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getSeverityBadge(a.severity)}`}>
                        {a.severity}
                      </span>
                      <span className="text-[10px] font-semibold text-slate-400">IP: {a.ipAddress}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-slate-400">{new Date(a.detectedAt).toLocaleTimeString()}</span>
                      {a.status === 'ACTIVE' ? (
                        <button
                          onClick={() => handleResolve(a.id)}
                          className="px-3 py-1 bg-emerald-600 text-white hover:bg-emerald-700 font-bold text-[11px] rounded-lg"
                        >
                          Mitigate Alert
                        </button>
                      ) : (
                        <span className="text-emerald-600 font-bold flex items-center gap-1">
                          <ShieldCheck className="w-3.5 h-3.5" /> Mitigated
                        </span>
                      )}
                    </div>
                  </div>

                  <p className="text-slate-700 dark:text-slate-300 font-medium">{a.description}</p>
                  <div className="p-2 bg-slate-950 text-indigo-300 font-mono text-[10px] rounded-xl">
                    Recommended Action: {a.recommendedAction}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
