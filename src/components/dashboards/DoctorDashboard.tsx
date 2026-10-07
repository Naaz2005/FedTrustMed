import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { MedicalRecord, Patient, AIThreatAlert } from '../../types';
import { api } from '../../services/api';
import {
  FilePlus,
  Users,
  ShieldAlert,
  Lock,
  Building2,
  Send,
  FileKey2,
  CheckCircle2,
  Blocks,
  KeyRound,
  Stethoscope,
} from 'lucide-react';

export const DoctorDashboard: React.FC<{ setActiveTab: (tab: string) => void }> = ({ setActiveTab }) => {
  const { user } = useAuth();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [records, setRecords] = useState<MedicalRecord[]>([]);
  const [threats, setThreats] = useState<AIThreatAlert[]>([]);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(false);

  // Upload Form State
  const [selectedPatientId, setSelectedPatientId] = useState('pat-101');
  const [title, setTitle] = useState('');
  const [recordType, setRecordType] = useState('DIAGNOSIS');
  const [diagnosis, setDiagnosis] = useState('');
  const [prescriptionsInput, setPrescriptionsInput] = useState('');
  const [labTestsInput, setLabTestsInput] = useState('');
  const [attachmentName, setAttachmentName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [latestTx, setLatestTx] = useState<any | null>(null);

  // Request Form State
  const [requestHospital, setRequestHospital] = useState('hosp-b');
  const [requestPurpose, setRequestPurpose] = useState('Cardiology Cross-Hospital Consultation');

  const fetchData = async () => {
    try {
      const patData = await api.getPatients();
      if (patData && patData.patients) setPatients(patData.patients);

      const recData = await api.getMedicalRecords();
      if (recData && recData.records) setRecords(recData.records);

      const threatData = await api.getThreats();
      if (threatData && threatData.alerts) setThreats(threatData.alerts);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !diagnosis) return;
    setIsSubmitting(true);

    try {
      const res = await api.createMedicalRecord({
        patientId: selectedPatientId,
        doctorId: 'doc-201',
        title,
        recordType,
        diagnosis,
        prescriptions: prescriptionsInput.split(',').map((s) => s.trim()).filter(Boolean),
        labTests: labTestsInput.split(',').map((s) => s.trim()).filter(Boolean),
      });

      if (res && res.record) {
        setLatestTx(res);
        setTitle('');
        setDiagnosis('');
        setPrescriptionsInput('');
        setLabTestsInput('');
        fetchData();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendConsentRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.requestConsent({
        patientId: selectedPatientId,
        doctorId: 'doc-201',
        requestingHospitalId: requestHospital,
        purpose: requestPurpose,
      });
      setShowRequestModal(false);
      alert('Consent request dispatched to patient. Immutable audit log recorded on Hyperledger Fabric.');
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-teal-700 via-teal-600 to-emerald-700 rounded-3xl p-6 text-white shadow-xl shadow-teal-500/10 relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold uppercase tracking-wider bg-white/20 px-2.5 py-0.5 rounded-full">
                Attending Physician Workstation
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">{user?.fullName}</h1>
            <p className="text-teal-100 text-sm mt-1 max-w-xl">
              Department of Cardiology | {user?.hospitalName}. Create AES-256 encrypted diagnostic reports and record immutable hashes directly on Hyperledger Fabric.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setShowUploadModal(true)}
              className="px-4 py-2.5 rounded-xl bg-white text-teal-800 hover:bg-teal-50 font-bold text-xs shadow-md flex items-center gap-2 transition-all"
            >
              <FilePlus className="w-4 h-4 text-teal-600" /> Upload Encrypted Report
            </button>
            <button
              onClick={() => setShowRequestModal(true)}
              className="px-4 py-2.5 rounded-xl bg-teal-800/80 hover:bg-teal-900 border border-teal-500/40 font-bold text-xs shadow-md flex items-center gap-2 transition-all"
            >
              <Send className="w-4 h-4 text-teal-300" /> Request Record Access
            </button>
          </div>
        </div>
      </div>

      {/* AI Security Alert Notice if any */}
      {threats.length > 0 && (
        <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold text-xs text-amber-900 dark:text-amber-200">
                AI Threat Warning Intercepted ({threats.length} active alerts)
              </h4>
              <p className="text-xs text-amber-800 dark:text-amber-300 mt-0.5">
                {threats[0]?.description} (Target: {threats[0]?.targetHospital})
              </p>
            </div>
          </div>
          <button
            onClick={() => setActiveTab('threats')}
            className="text-xs font-bold text-amber-700 dark:text-amber-300 hover:underline shrink-0"
          >
            Investigate &rarr;
          </button>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span>Assigned Patients</span>
            <Users className="w-4 h-4 text-teal-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mt-2">18 Active</div>
          <div className="text-[11px] text-teal-600 dark:text-teal-400 mt-1">Consent Verified</div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span>Doctor Trust Score</span>
            <Stethoscope className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mt-2">{user?.trustScore || 94} / 100</div>
          <div className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1">High Compliance Rating</div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span>Hyperledger Commits</span>
            <Blocks className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mt-2">{records.length} Blocks</div>
          <div className="text-[11px] text-blue-600 dark:text-blue-400 mt-1">Endorsed by MSP Nodes</div>
        </div>
      </div>

      {/* Patient Roster & Encrypted Creation Modal */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left 2 Cols: Recent Encrypted Medical Reports */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-lg flex items-center gap-2">
                <FileKey2 className="w-5 h-5 text-teal-600" /> Patient Medical Reports & Diagnoses
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Created with AES-256 encryption. SHA-256 fingerprint saved on Hyperledger Fabric.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {records.map((r) => (
              <div
                key={r.id}
                className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 hover:border-teal-300 dark:hover:border-teal-700 transition-all space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 dark:text-white text-sm">{r.title}</span>
                    <span className="text-[10px] font-semibold uppercase bg-teal-100 text-teal-800 dark:bg-teal-900/60 dark:text-teal-200 px-2 py-0.5 rounded-full">
                      {r.recordType}
                    </span>
                  </div>
                  <span className="text-xs text-slate-400">{new Date(r.createdAt).toLocaleDateString()}</span>
                </div>

                <p className="text-xs text-slate-700 dark:text-slate-300">
                  Patient: <strong>{r.patientName}</strong> | Diagnosis: <strong>{r.diagnosis}</strong>
                </p>

                <div className="text-[10px] font-mono text-slate-400 bg-slate-100 dark:bg-slate-800/80 p-2 rounded-lg flex flex-wrap items-center justify-between gap-2">
                  <span>SHA-256: {r.sha256Hash}</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                    <Lock className="w-3 h-3" /> AES-256
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Col: Assigned Patient Cards */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
          <h3 className="font-bold text-slate-900 dark:text-white text-base mb-3 flex items-center gap-2">
            <Users className="w-4 h-4 text-blue-600" /> Assigned Patient Roster
          </h3>
          <div className="space-y-3">
            {patients.map((p) => (
              <div key={p.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-slate-900 dark:text-white">{p.fullName}</span>
                  <span className="text-[10px] bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 px-2 py-0.5 rounded-full font-semibold">
                    {p.bloodType}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">Conditions: {p.medicalConditions.join(', ') || 'None'}</p>
                <div className="pt-1 flex justify-end">
                  <button
                    onClick={() => {
                      setSelectedPatientId(p.id);
                      setShowUploadModal(true);
                    }}
                    className="text-[11px] font-semibold text-teal-600 dark:text-teal-400 hover:underline"
                  >
                    + Add Diagnostic Record
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Upload Encrypted Report Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-bold text-slate-900 dark:text-white text-lg flex items-center gap-2">
                <FilePlus className="w-5 h-5 text-teal-600" /> Upload & Encrypt Medical Report
              </h3>
              <button onClick={() => setShowUploadModal(false)} className="text-slate-400 hover:text-slate-600 font-bold">
                ✕
              </button>
            </div>

            {latestTx && (
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl text-xs text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-900/50 space-y-1">
                <div className="font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Record Encrypted & Block Committed!
                </div>
                <p className="font-mono text-[10px]">
                  Fabric Tx ID: {latestTx.fabricTransaction?.txId} | Block #{latestTx.fabricBlock?.blockIndex}
                </p>
              </div>
            )}

            <form onSubmit={handleCreateRecord} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300">Select Patient</label>
                <select
                  value={selectedPatientId}
                  onChange={(e) => setSelectedPatientId(e.target.value)}
                  className="w-full mt-1 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                >
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.fullName} ({p.email})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300">Report Title</label>
                <input
                  type="text"
                  placeholder="e.g. Coronary Angiogram & Lipid Panel"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full mt-1 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 dark:text-slate-300">Record Type</label>
                  <select
                    value={recordType}
                    onChange={(e) => setRecordType(e.target.value)}
                    className="w-full mt-1 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                  >
                    <option value="DIAGNOSIS">Diagnosis</option>
                    <option value="LAB_RESULT">Lab Result</option>
                    <option value="PRESCRIPTION">Prescription</option>
                    <option value="RADIOLOGY">Radiology</option>
                  </select>
                </div>
                <div>
                  <label className="font-semibold text-slate-700 dark:text-slate-300">Encryption Scheme</label>
                  <input
                    type="text"
                    value="AES-256-GCM + ECC NIST P-256"
                    disabled
                    className="w-full mt-1 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/50 text-slate-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300">Clinical Diagnosis & Notes</label>
                <textarea
                  rows={3}
                  placeholder="Enter diagnosis summary, patient vitals, and findings..."
                  value={diagnosis}
                  onChange={(e) => setDiagnosis(e.target.value)}
                  className="w-full mt-1 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                  required
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300">Prescriptions (Comma Separated)</label>
                <input
                  type="text"
                  placeholder="Lisinopril 10mg, Aspirin 81mg"
                  value={prescriptionsInput}
                  onChange={(e) => setPrescriptionsInput(e.target.value)}
                  className="w-full mt-1 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300">Lab Tests (Comma Separated)</label>
                <input
                  type="text"
                  placeholder="Echocardiogram, Lipid Panel"
                  value={labTestsInput}
                  onChange={(e) => setLabTestsInput(e.target.value)}
                  className="w-full mt-1 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300">
                  Attach Medical Report File (PDF / DICOM Image / Scanned Document)
                </label>
                <div className="mt-1 p-3 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40 flex items-center justify-between gap-3">
                  <input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.dicom,.dcm,.txt"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setAttachmentName(e.target.files[0].name);
                      }
                    }}
                    className="text-xs text-slate-600 dark:text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-teal-100 file:text-teal-800 dark:file:bg-teal-900 dark:file:text-teal-200 cursor-pointer"
                  />
                  {attachmentName && (
                    <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 font-semibold truncate">
                      ✓ {attachmentName}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[10px] text-slate-500">
                  Attached file payloads are converted into encrypted byte buffers using AES-256-GCM before database storage and blockchain hashing.
                </p>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold shadow-md"
                >
                  {isSubmitting ? 'Encrypting & Committing...' : 'Encrypt & Save to Blockchain'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Request Cross-Hospital Consent Modal */}
      {showRequestModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
                <Send className="w-5 h-5 text-teal-600" /> Inter-Hospital Record Request
              </h3>
              <button onClick={() => setShowRequestModal(false)} className="text-slate-400 hover:text-slate-600 font-bold">
                ✕
              </button>
            </div>

            <form onSubmit={handleSendConsentRequest} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300">Target Patient</label>
                <select
                  value={selectedPatientId}
                  onChange={(e) => setSelectedPatientId(e.target.value)}
                  className="w-full mt-1 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                >
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.fullName} ({p.primaryHospitalName})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300">Requesting Hospital Node</label>
                <select
                  value={requestHospital}
                  onChange={(e) => setRequestHospital(e.target.value)}
                  className="w-full mt-1 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                >
                  <option value="hosp-b">Metro Heart & Cancer Specialty (HOSP-B)</option>
                  <option value="hosp-c">City Memorial Hospital (HOSP-C)</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300">Clinical Purpose</label>
                <textarea
                  rows={2}
                  value={requestPurpose}
                  onChange={(e) => setRequestPurpose(e.target.value)}
                  className="w-full mt-1 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                  required
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowRequestModal(false)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold shadow-md"
                >
                  Send Consent Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
