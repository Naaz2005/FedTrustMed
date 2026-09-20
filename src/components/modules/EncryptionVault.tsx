import React, { useState, useEffect } from 'react';
import { MedicalRecord, IotHealthcareReading } from '../../types';
import { api } from '../../services/api';
import {
  FileKey2,
  Lock,
  Unlock,
  KeyRound,
  ShieldCheck,
  Code2,
  CheckCircle2,
  Cpu,
  Activity,
  Zap,
  Radio,
  FileCheck2,
} from 'lucide-react';

export const EncryptionVault: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'AES_ECC' | 'IOT_CLSM_MHE'>('AES_ECC');
  const [records, setRecords] = useState<MedicalRecord[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<MedicalRecord | null>(null);
  const [decryptedResult, setDecryptedResult] = useState<any | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);

  // IoT Ingestion State
  const [iotReadings, setIotReadings] = useState<IotHealthcareReading[]>([]);
  const [patientId, setPatientId] = useState('pat-101');
  const [deviceId, setDeviceId] = useState('IOT-ECG-9021');
  const [deviceType, setDeviceType] = useState<IotHealthcareReading['deviceType']>('ECG_MONITOR');
  const [heartRate, setHeartRate] = useState(78);
  const [spO2, setSpO2] = useState(99);
  const [systolicBp, setSystolicBp] = useState(122);
  const [diastolicBp, setDiastolicBp] = useState(82);
  const [temperature, setTemperature] = useState(36.8);
  const [ingesting, setIngesting] = useState(false);
  const [lastIngestedResult, setLastIngestedResult] = useState<IotHealthcareReading | null>(null);

  const fetchRecords = async () => {
    try {
      const data = await api.getMedicalRecords();
      if (data && data.records) {
        setRecords(data.records);
        if (data.records.length > 0) setSelectedRecord(data.records[0]);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchIotReadings = async () => {
    try {
      const data = await api.getIotReadings();
      if (data && data.readings) {
        setIotReadings(data.readings);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchRecords();
    fetchIotReadings();
  }, []);

  const handleDecrypt = async (rec: MedicalRecord) => {
    setIsDecrypting(true);
    try {
      const res = await api.decryptRecord(rec.id, 'usr-patient-1');
      if (res && res.decryptedData) {
        setDecryptedResult(res.decryptedData);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsDecrypting(false);
    }
  };

  const handleIngestIotData = async (e: React.FormEvent) => {
    e.preventDefault();
    setIngesting(true);
    setLastIngestedResult(null);
    try {
      const res = await api.ingestIotData({
        patientId,
        deviceId,
        deviceType,
        heartRateBpm: heartRate,
        spO2Percent: spO2,
        systolicBp,
        diastolicBp,
        temperatureC: temperature,
        originHospital: 'St. Jude General Hospital',
      });
      if (res && res.reading) {
        setLastIngestedResult(res.reading);
        fetchIotReadings();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIngesting(false);
    }
  };

  return (
    <div className="space-y-6 font-sans">
      
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 rounded-3xl p-6 text-white shadow-xl border border-blue-800/50">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold uppercase tracking-wider bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2.5 py-0.5 rounded-full">
                CLSM + MHE + AES-256 + ECC Cryptographic Vault
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Data Ingestion, CLSM Hashing & MHE Vault</h1>
            <p className="text-slate-300 text-sm mt-1 max-w-xl">
              Supports <strong>Composite Logistic Sine Map (CLSM)</strong> chaotic hashing, <strong>Martino Homomorphic Encryption (MHE)</strong>, and <strong>AES-256 / ECC</strong> zero-trust medical record storage.
            </p>
          </div>

          <div className="flex items-center gap-2 bg-slate-950/80 p-3 rounded-2xl border border-blue-900/60 font-mono text-xs text-emerald-400">
            <Cpu className="w-5 h-5 text-blue-400" />
            <div>
              <div>CLSM Hash: Chaotic Nonlinear</div>
              <div>MHE: Homomorphic Encrypted</div>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 mt-6 border-t border-slate-800/80 pt-4">
          <button
            onClick={() => setActiveTab('AES_ECC')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'AES_ECC'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30'
                : 'bg-slate-950/60 text-slate-400 hover:text-white'
            }`}
          >
            <Lock className="w-4 h-4" /> Medical Records Vault (AES-256 + ECC)
          </button>
          <button
            onClick={() => setActiveTab('IOT_CLSM_MHE')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'IOT_CLSM_MHE'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30'
                : 'bg-slate-950/60 text-slate-400 hover:text-white'
            }`}
          >
            <Activity className="w-4 h-4" /> Healthcare / IoT Telemetry Ingestion (CLSM + MHE)
          </button>
        </div>
      </div>

      {activeTab === 'AES_ECC' && (
        <div className="space-y-6">
          {/* Interactive Visual Pipeline Inspector */}
          {selectedRecord && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-6">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-lg flex items-center gap-2">
                    <FileKey2 className="w-5 h-5 text-blue-600" /> Cryptographic Flow Inspector
                  </h3>
                  <p className="text-xs text-slate-500">
                    Inspecting: <strong>{selectedRecord.title}</strong> (ID: {selectedRecord.id})
                  </p>
                </div>
                <button
                  onClick={() => handleDecrypt(selectedRecord)}
                  disabled={isDecrypting}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-2 transition-all"
                >
                  <Unlock className="w-4 h-4" /> {isDecrypting ? 'Decrypting AES Key...' : 'Execute Decryption Pipeline'}
                </button>
              </div>

              {/* 4-Step Pipeline Architecture */}
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 text-xs">
                
                {/* Step 1: Plaintext Medical Payload */}
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
                  <div className="flex items-center justify-between font-bold text-slate-900 dark:text-white">
                    <span>1. Plaintext Record</span>
                    <Code2 className="w-4 h-4 text-slate-500" />
                  </div>
                  <p className="text-[11px] text-slate-500">Structured diagnosis, prescriptions, and lab tests before storage.</p>
                  <div className="p-2.5 bg-slate-900 text-slate-200 font-mono rounded-xl text-[10px] space-y-1 overflow-x-auto">
                    <div>"patientName": "{selectedRecord.patientName}"</div>
                    <div>"diagnosis": "{selectedRecord.diagnosis.substring(0, 30)}..."</div>
                    <div>"doctor": "{selectedRecord.doctorName}"</div>
                  </div>
                </div>

                {/* Step 2: AES-256 Symmetric Encryption */}
                <div className="p-4 rounded-2xl bg-blue-50/60 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 space-y-2">
                  <div className="flex items-center justify-between font-bold text-blue-900 dark:text-blue-200">
                    <span>2. AES-256 Ciphertext</span>
                    <Lock className="w-4 h-4 text-blue-600" />
                  </div>
                  <p className="text-[11px] text-slate-500">Random 256-bit symmetric key + 12-byte IV for GCM authentication.</p>
                  <div className="p-2.5 bg-slate-950 text-blue-400 font-mono rounded-xl text-[10px] break-all max-h-24 overflow-y-auto">
                    {selectedRecord.encryptedContent.substring(0, 90)}...
                  </div>
                </div>

                {/* Step 3: ECC Public Key Wrapping */}
                <div className="p-4 rounded-2xl bg-purple-50/60 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-900/60 space-y-2">
                  <div className="flex items-center justify-between font-bold text-purple-900 dark:text-purple-200">
                    <span>3. ECC Key Exchange</span>
                    <KeyRound className="w-4 h-4 text-purple-600" />
                  </div>
                  <p className="text-[11px] text-slate-500">AES symmetric key encrypted using recipient NIST P-256 ECC Public Key.</p>
                  <div className="p-2.5 bg-slate-950 text-purple-300 font-mono rounded-xl text-[10px] break-all max-h-24 overflow-y-auto">
                    {selectedRecord.eccEncryptedAesKey.substring(0, 90)}...
                  </div>
                </div>

                {/* Step 4: SHA-256 Blockchain Hash */}
                <div className="p-4 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 space-y-2">
                  <div className="flex items-center justify-between font-bold text-emerald-900 dark:text-emerald-200">
                    <span>4. Fabric Fingerprint</span>
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  </div>
                  <p className="text-[11px] text-slate-500">SHA-256 hash stored on Hyperledger Fabric. Zero plaintext on chain.</p>
                  <div className="p-2.5 bg-slate-950 text-emerald-400 font-mono rounded-xl text-[10px] break-all">
                    {selectedRecord.sha256Hash}
                  </div>
                </div>

              </div>

              {/* Decryption Result Panel */}
              {decryptedResult && (
                <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 rounded-2xl space-y-2">
                  <div className="font-bold text-xs text-emerald-900 dark:text-emerald-200 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    <span>Decrypted Plaintext Verified (AES-256 Decryption Execution Success)</span>
                  </div>
                  <pre className="p-3 bg-slate-950 text-emerald-400 font-mono rounded-xl text-[11px] overflow-x-auto">
                    {JSON.stringify(decryptedResult, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* All Encrypted Records Table */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm">
            <h3 className="font-bold text-slate-900 dark:text-white text-base mb-4">
              All Encrypted Medical Records in Database
            </h3>

            <div className="space-y-3">
              {records.map((r) => (
                <div
                  key={r.id}
                  onClick={() => {
                    setSelectedRecord(r);
                    setDecryptedResult(null);
                  }}
                  className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                    selectedRecord?.id === r.id
                      ? 'bg-blue-50/80 dark:bg-blue-950/50 border-blue-500 shadow-md'
                      : 'bg-slate-50/50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 hover:border-slate-400'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="font-bold text-sm text-slate-900 dark:text-white">{r.title}</div>
                      <p className="text-xs text-slate-500">
                        Patient: {r.patientName} | Doctor: {r.doctorName} ({r.hospitalName})
                      </p>
                    </div>
                    <div className="text-[11px] font-mono text-blue-600 dark:text-blue-400 font-semibold flex items-center gap-1">
                      <Lock className="w-3.5 h-3.5" /> Inspect Pipeline
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'IOT_CLSM_MHE' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Left Column: Form to Ingest Data */}
          <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4 text-xs">
            <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
                <Radio className="w-5 h-5 text-blue-600 animate-pulse" /> IoT Healthcare Ingestion Console
              </h3>
              <p className="text-slate-500">Accept patient biometric telemetry & execute CLSM Hashing + MHE Encryption</p>
            </div>

            <form onSubmit={handleIngestIotData} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Patient ID</label>
                  <input
                    type="text"
                    value={patientId}
                    onChange={(e) => setPatientId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Device ID / Source</label>
                  <input
                    type="text"
                    value={deviceId}
                    onChange={(e) => setDeviceId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Sensor Type</label>
                <select
                  value={deviceType}
                  onChange={(e) => setDeviceType(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none focus:border-blue-500"
                >
                  <option value="ECG_MONITOR">ECG Monitor (Electrocardiogram)</option>
                  <option value="PULSE_OXIMETER">Pulse Oximeter (SpO2)</option>
                  <option value="BLOOD_PRESSURE">Blood Pressure Monitor</option>
                  <option value="GLUCOSE_SENSOR">Continuous Glucose Sensor</option>
                  <option value="SMART_BAND">Smart Healthcare Wearable</option>
                </select>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Heart Rate (bpm)</label>
                  <input
                    type="number"
                    value={heartRate}
                    onChange={(e) => setHeartRate(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">SpO2 (%)</label>
                  <input
                    type="number"
                    value={spO2}
                    onChange={(e) => setSpO2(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Temp (°C)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={temperature}
                    onChange={(e) => setTemperature(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={ingesting}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 transition-all"
              >
                <Zap className="w-4 h-4" /> {ingesting ? 'Processing Ingestion...' : 'Ingest & Encrypt Telemetry'}
              </button>
            </form>

            {lastIngestedResult && (
              <div className="p-4 bg-slate-950 text-slate-200 rounded-2xl border border-blue-900/60 space-y-2">
                <div className="font-bold text-xs text-blue-400 flex items-center justify-between">
                  <span>Ingestion Pipeline Complete</span>
                  <span className="text-[10px] text-emerald-400 font-mono">Enc Latency: {lastIngestedResult.encryptionTimeMs} ms</span>
                </div>
                <div className="space-y-1 font-mono text-[10px]">
                  <div><strong className="text-slate-400">CLSM Hash:</strong> <span className="text-amber-300">{lastIngestedResult.clsmHash}</span></div>
                  <div><strong className="text-slate-400">MHE Ciphertext:</strong> <span className="text-teal-300 break-all">{lastIngestedResult.mheCiphertext.substring(0, 50)}...</span></div>
                  <div><strong className="text-slate-400">FileDAG CID:</strong> <span className="text-emerald-400">{lastIngestedResult.fileDagCid}</span></div>
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Recent Ingested Telemetry List */}
          <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
            <div className="border-b border-slate-100 dark:border-slate-800 pb-3 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 dark:text-white text-base">
                FileDAG Telemetry Ingestion Ledger ({iotReadings.length} records)
              </h3>
              <span className="text-xs text-emerald-500 font-bold font-mono bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                CLSM Verified
              </span>
            </div>

            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
              {iotReadings.map((reading) => (
                <div
                  key={reading.id}
                  className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <Activity className="w-4 h-4 text-blue-500" /> {reading.deviceId} ({reading.deviceType})
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {new Date(reading.timestamp).toLocaleTimeString()}
                    </span>
                  </div>

                  <div className="grid grid-cols-4 gap-2 text-center bg-white dark:bg-slate-900 p-2 rounded-xl border border-slate-200/60 dark:border-slate-800 text-[11px]">
                    <div>
                      <div className="text-slate-400 text-[10px]">Heart Rate</div>
                      <div className="font-bold text-blue-600 dark:text-blue-400">{reading.heartRateBpm} bpm</div>
                    </div>
                    <div>
                      <div className="text-slate-400 text-[10px]">SpO2</div>
                      <div className="font-bold text-emerald-600 dark:text-emerald-400">{reading.spO2Percent}%</div>
                    </div>
                    <div>
                      <div className="text-slate-400 text-[10px]">Blood Press.</div>
                      <div className="font-bold text-indigo-600 dark:text-indigo-400">{reading.systolicBp}/{reading.diastolicBp}</div>
                    </div>
                    <div>
                      <div className="text-slate-400 text-[10px]">Temp</div>
                      <div className="font-bold text-purple-600 dark:text-purple-400">{reading.temperatureC}°C</div>
                    </div>
                  </div>

                  <div className="p-2.5 bg-slate-950 text-slate-300 font-mono text-[10px] rounded-xl space-y-1">
                    <div className="flex items-center justify-between text-amber-400">
                      <span>CLSM Hash:</span>
                      <span className="text-[9px]">{reading.clsmHash}</span>
                    </div>
                    <div className="flex items-center justify-between text-teal-300">
                      <span>MHE Ciphertext:</span>
                      <span className="text-[9px] break-all">{reading.mheCiphertext.substring(0, 36)}...</span>
                    </div>
                    <div className="flex items-center justify-between text-emerald-400">
                      <span>FileDAG CID:</span>
                      <span className="text-[9px]">{reading.fileDagCid}</span>
                    </div>
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
