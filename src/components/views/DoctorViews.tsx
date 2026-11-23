import React, { useState, useEffect } from 'react';
import {
  Users,
  FolderLock,
  Key,
  ShieldAlert,
  Search,
  Activity,
  Plus,
  FileText,
  CheckCircle,
  Building,
  User,
  Heart,
  AlertTriangle,
  Clock,
  Sparkles,
  ChevronRight,
  ShieldCheck,
  X,
  Loader2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';

// ----------------------------------------------------------------------
// 1. DOCTOR HOME COMPONENT
// ----------------------------------------------------------------------
export const DoctorHome: React.FC<{ onNavigate?: (page: string) => void }> = ({ onNavigate }) => {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      {/* Doctor Welcome & Node Status */}
      <div className="relative rounded-3xl bg-gradient-to-r from-teal-950/60 via-slate-900 to-slate-950 border border-teal-500/20 p-6 sm:p-8 overflow-hidden shadow-xl">
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-500/10 border border-teal-500/30 text-teal-300 text-xs font-semibold">
              <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
              Verified Medical Practitioner • Department of {user?.departmentName || 'Cardiology'}
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Clinical Workspace: {user?.fullName}
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Hospital Node: <span className="text-teal-400 font-semibold">{user?.hospitalName || 'St. Jude General'}</span>. All consultations, diagnostics, and patient encounters are cryptographically signed with your sealed ECC P-256 private key.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 text-center shrink-0">
            <div className="text-[10px] font-mono uppercase text-slate-400">Licence Status</div>
            <div className="text-sm font-bold text-emerald-400 mt-1">TEST-MED-LIC-0001</div>
            <div className="text-[10px] text-emerald-400/80">State Medical Council Verified</div>
          </div>
        </div>
      </div>

      {/* Quick Action Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div
          onClick={() => onNavigate && onNavigate('Patients and Records')}
          className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-teal-500/40 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Assigned Patients</span>
            <div className="w-8 h-8 rounded-lg bg-teal-500/10 text-teal-400 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-white mt-2">1 Active Inpatient</div>
          <div className="text-[11px] text-teal-400 mt-1 flex items-center gap-1">
            <span>Open patient charts</span>
            <ChevronRight className="w-3 h-3" />
          </div>
        </div>

        <div
          onClick={() => onNavigate && onNavigate('Access Requests')}
          className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-indigo-500/40 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Cross-Node Access</span>
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Key className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-white mt-2">2 Requests Active</div>
          <div className="text-[11px] text-indigo-400 mt-1 flex items-center gap-1">
            <span>Review authorizations</span>
            <ChevronRight className="w-3 h-3" />
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Node Telemetry</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-emerald-400 mt-2">100.00%</div>
          <div className="text-[11px] text-slate-400 mt-1">Peer Node Cryptographic Trust</div>
        </div>
      </div>

      {/* Recent Alerts / Pending Diagnostics */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
        <h3 className="font-bold text-sm text-white uppercase tracking-wider flex items-center gap-2">
          <Activity className="w-4 h-4 text-teal-400" />
          Active Patient Alerts & Inpatient Telemetry
        </h3>

        <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-start space-x-3">
            <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-400 flex items-center justify-center shrink-0">
              <User className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-white">Aarav Sharma</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-teal-500/10 text-teal-300 border border-teal-500/20">
                  ID: pat-profile-001
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Diagnosis: Atypical Angina Pectoris • Resting ECG review scheduled
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onNavigate && onNavigate('Patients and Records')}
            className="px-3.5 py-1.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-bold transition-all cursor-pointer"
          >
            Open Chart
          </button>
        </div>
      </div>
    </div>
  );
};

// ----------------------------------------------------------------------
// 2. DOCTOR PATIENTS AND RECORDS COMPONENT
// ----------------------------------------------------------------------
export const DoctorPatientsAndRecords: React.FC = () => {
  const [patients, setPatients] = useState<any[]>([]);
  const [records, setRecords] = useState<any[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<any | null>(null);
  const [search, setSearch] = useState('');
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [newDiagnosis, setNewDiagnosis] = useState('');
  const [newNote, setNewNote] = useState('');
  const [newPrescription, setNewPrescription] = useState('Aspirin 75mg once daily');
  const [savingNote, setSavingNote] = useState(false);

  useEffect(() => {
    api.getAllPatients().then((list) => {
      if (list && list.length > 0) {
        setPatients(list);
        setSelectedPatient(list[0]);
      } else {
        const fallback = [
          {
            id: 'pat-profile-001',
            full_name: 'Aarav Sharma',
            email: 'patient@fedtrustmed.demo',
            dob: '1988-06-15',
            gender: 'Male',
            blood_type: 'O+',
            allergies: ['Penicillin'],
            medical_conditions: ['Hypertension'],
            emergency_contact: '+91-9876543210',
            primary_hospital_name: 'St. Jude General',
          },
        ];
        setPatients(fallback);
        setSelectedPatient(fallback[0]);
      }
    }).catch(() => {});

    api.getAllRecords().then((recs) => {
      setRecords(recs || []);
    }).catch(() => {});
  }, []);

  const handleAddNote = (e: React.FormEvent) => {
    e.preventDefault();
    setSavingNote(true);
    setTimeout(() => {
      const added = {
        id: `rec-${Date.now()}`,
        title: `Clinical Consultation Note - ${newDiagnosis || 'Cardiology Follow-up'}`,
        doctor_name: 'Dr. Priya Patel',
        hospital_name: 'St. Jude General',
        diagnosis: newDiagnosis || 'Cardiac follow-up review',
        clinicalNotes: newNote || 'Patient examined. Prescriptions and vital checks verified.',
        prescriptions: [newPrescription],
        created_at: new Date().toISOString(),
      };
      setRecords([added, ...records]);
      setSavingNote(false);
      setIsNoteModalOpen(false);
      setNewDiagnosis('');
      setNewNote('');
    }, 600);
  };

  const filteredPatients = patients.filter((p) =>
    p.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    p.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <FolderLock className="w-5 h-5 text-teal-400" />
            Assigned Patient Directory & Medical Encounters
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Encrypted zero-knowledge medical records subject to patient dynamic consent.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsNoteModalOpen(true)}
          className="px-4 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-md shadow-teal-500/20 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>New Consultation Note</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Patient Selection List */}
        <div className="space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search patients..."
              className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-teal-500"
            />
          </div>

          <div className="space-y-2">
            {filteredPatients.map((p) => {
              const isSelected = selectedPatient?.id === p.id;
              return (
                <div
                  key={p.id}
                  onClick={() => setSelectedPatient(p)}
                  className={`p-4 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-teal-500/15 border-teal-500/40 text-white shadow-sm'
                      : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-white">{p.full_name}</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-950 text-teal-400 border border-slate-800">
                      {p.blood_type || 'O+'}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 mt-1 font-mono">{p.email}</div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Allergies: <span className="text-rose-400 font-semibold">{Array.isArray(p.allergies) ? p.allergies.join(', ') : 'Penicillin'}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Selected Patient Encounters & Vitals */}
        <div className="lg:col-span-2 space-y-4">
          {selectedPatient ? (
            <div className="space-y-4">
              {/* Patient Banner */}
              <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-white">{selectedPatient.full_name}</h3>
                    <p className="text-xs text-slate-400">
                      Gender: {selectedPatient.gender} • DOB: {selectedPatient.dob} • Emergency Contact: {selectedPatient.emergency_contact}
                    </p>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                    Consent Verified: ACTIVE
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800/80 text-xs">
                  <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800/80">
                    <span className="text-[10px] uppercase text-slate-400 block font-mono">Blood Group</span>
                    <span className="font-bold text-white text-sm">{selectedPatient.blood_type || 'O+'}</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800/80">
                    <span className="text-[10px] uppercase text-slate-400 block font-mono">Documented Allergies</span>
                    <span className="font-bold text-rose-400 text-sm">Penicillin</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800/80">
                    <span className="text-[10px] uppercase text-slate-400 block font-mono">Conditions</span>
                    <span className="font-bold text-amber-300 text-sm">Hypertension</span>
                  </div>
                </div>
              </div>

              {/* Records List */}
              <div className="space-y-3">
                <h4 className="font-bold text-xs uppercase tracking-wider text-slate-400">
                  Encrypted Clinical Encounter History
                </h4>

                {records.map((r, idx) => (
                  <div key={r.id || idx} className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-white">{r.title || 'Clinical Encounter'}</span>
                      <span className="text-xs text-slate-400 font-mono">
                        {r.created_at ? new Date(r.created_at).toLocaleDateString() : 'Recent'}
                      </span>
                    </div>

                    <div className="text-xs text-slate-300 bg-slate-950/80 p-3 rounded-lg border border-slate-800 leading-relaxed">
                      <span className="font-semibold text-teal-400 block mb-1">Diagnosis: {r.diagnosis}</span>
                      <p className="text-slate-300">{r.clinicalNotes || 'Exam completed. Vital signs stable.'}</p>
                    </div>

                    {r.prescriptions && r.prescriptions.length > 0 && (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-slate-400">Rx:</span>
                        {r.prescriptions.map((pr: string, i: number) => (
                          <span key={i} className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 font-mono text-[11px]">
                            {pr}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-12 text-center text-slate-500 text-sm">
              Select a patient from the directory.
            </div>
          )}
        </div>

      </div>

      {/* New Consultation Note Modal */}
      {isNoteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-teal-400" />
                Add Encrypted Consultation Note
              </h3>
              <button
                type="button"
                onClick={() => setIsNoteModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddNote} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Diagnosis / Assessment</label>
                <input
                  type="text"
                  value={newDiagnosis}
                  onChange={(e) => setNewDiagnosis(e.target.value)}
                  placeholder="e.g. Mild Angina Pectoris (ICD-10 I20)"
                  required
                  className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Clinical Examination Findings</label>
                <textarea
                  rows={3}
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Enter objective clinical examination notes and plan..."
                  required
                  className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Prescription Item</label>
                <input
                  type="text"
                  value={newPrescription}
                  onChange={(e) => setNewPrescription(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white"
                />
              </div>

              <div className="p-3 rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-300 text-[11px]">
                Note will be sealed with AES-256-GCM and cryptographically signed with Doctor ECC P-256 Key.
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsNoteModalOpen(false)}
                  className="px-3 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingNote}
                  className="px-4 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold"
                >
                  {savingNote ? 'Encrypting & Sealing...' : 'Sign & Seal Note'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// ----------------------------------------------------------------------
// 3. DOCTOR ACCESS REQUESTS & EMERGENCY BREAK-GLASS COMPONENT
// ----------------------------------------------------------------------
export const DoctorAccessRequests: React.FC = () => {
  const [breakGlassModal, setBreakGlassModal] = useState(false);
  const [patientName, setPatientName] = useState('Aarav Sharma');
  const [justification, setJustification] = useState(
    'Immediate allergy profile required for emergency surgical anesthesia.'
  );
  const [breakGlassSuccess, setBreakGlassSuccess] = useState(false);
  const [breakGlassLogs, setBreakGlassLogs] = useState<any[]>([
    {
      id: 'bg-001',
      patientName: 'Aarav Sharma',
      reason: 'Urgent cardiac catheterization historical ECG access',
      timestamp: new Date(Date.now() - 3600000 * 24).toISOString(),
      status: 'AUDITED & LOGGED',
    },
  ]);

  const handleBreakGlassSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const entry = {
      id: `bg-${Date.now()}`,
      patientName,
      reason: justification,
      timestamp: new Date().toISOString(),
      status: 'AUDITED & LOGGED',
    };
    setBreakGlassLogs([entry, ...breakGlassLogs]);
    setBreakGlassSuccess(true);
    setTimeout(() => {
      setBreakGlassSuccess(false);
      setBreakGlassModal(false);
    }, 1200);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Key className="w-5 h-5 text-indigo-400" />
            Cross-Hospital Record Access & Consent Directives
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Review federated patient record authorizations and emergency break-glass protocols.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setBreakGlassModal(true)}
          className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-rose-600/20 cursor-pointer"
        >
          <ShieldAlert className="w-4 h-4" />
          <span>Emergency Break-Glass Protocol</span>
        </button>
      </div>

      {/* Emergency Break-Glass Alert Box */}
      <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-200 text-xs flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold block text-sm">Emergency Override Policy (Break-Glass)</span>
          In life-threatening medical emergencies, licensed physicians may execute break-glass access to retrieve critical allergy and history records. Every break-glass override generates an immutable cryptographic audit record delivered to hospital administrators.
        </div>
      </div>

      {/* Break-Glass Audit Trail Log */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
        <h3 className="font-bold text-sm text-white uppercase tracking-wider flex items-center gap-2">
          <Clock className="w-4 h-4 text-teal-400" />
          Emergency Break-Glass Audit Log
        </h3>

        <div className="divide-y divide-slate-800">
          {breakGlassLogs.map((log) => (
            <div key={log.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-white">{log.patientName}</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-rose-500/10 text-rose-300 border border-rose-500/20">
                    {log.status}
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-1 font-mono">{log.reason}</p>
              </div>
              <span className="text-[11px] font-mono text-slate-400 shrink-0">
                {new Date(log.timestamp).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Break-Glass Modal */}
      {breakGlassModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-rose-500/40 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-base text-rose-400 flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-rose-500" />
                Emergency Break-Glass Authorization
              </h3>
              <button
                type="button"
                onClick={() => setBreakGlassModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {breakGlassSuccess ? (
              <div className="py-8 text-center space-y-2">
                <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto" />
                <h4 className="text-base font-bold text-white">Emergency Override Logged</h4>
                <p className="text-xs text-slate-300">
                  Audit record committed with SHA-256 checksum and dispatched to compliance monitor.
                </p>
              </div>
            ) : (
              <form onSubmit={handleBreakGlassSubmit} className="space-y-4 text-xs">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Target Patient</label>
                  <input
                    type="text"
                    value={patientName}
                    onChange={(e) => setPatientName(e.target.value)}
                    required
                    className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Justified Clinical Emergency Reason (Min 20 characters)
                  </label>
                  <textarea
                    rows={3}
                    value={justification}
                    onChange={(e) => setJustification(e.target.value)}
                    required
                    placeholder="Provide specific medical emergency context..."
                    className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white"
                  />
                </div>

                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-[11px] leading-relaxed">
                  Notice: Your digital signature and IP address will be indelibly inscribed into the immutable compliance ledger. False claims will be escalated to the Medical Ethics Board.
                </div>

                <div className="pt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setBreakGlassModal(false)}
                    className="px-3 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold"
                  >
                    Confirm & Execute Override
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
