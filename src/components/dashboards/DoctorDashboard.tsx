import React, { useState, useEffect } from 'react';
import { Home, Users, FileText, ShieldCheck, Key } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import RecordPdfModal from '../modals/RecordPdfModal';

/**
 * Doctor Dashboard – home page with navigation tabs for Patients, Records and Access Requests.
 * All text is plain language; no cryptographic or complex terminology is shown to the user.
 */
const DoctorDashboard: React.FC = () => {
  const { user } = useAuth();
  const [page, setPage] = useState<'home' | 'patients' | 'records' | 'access'>('home');

  // Home metrics
  const [patientsCount, setPatientsCount] = useState<number>(0);
  const [recordsCount, setRecordsCount] = useState<number>(0);
  const [pendingReqCount, setPendingReqCount] = useState<number>(0);

  useEffect(() => {
    // Load metrics once when dashboard mounts
    api.getDoctorPatients().then((p) => setPatientsCount(p.length || 0)).catch(() => {});
    api.getDoctorRecords().then((r) => setRecordsCount(r.length || 0)).catch(() => {});
    api.getDoctorAccessRequests().then((list) => {
      const pending = list.filter((r: any) => r.status === 'PENDING');
      setPendingReqCount(pending.length);
    }).catch(() => {});
  }, []);

  const renderPage = () => {
    switch (page) {
      case 'home':
        return (
          <DoctorHome
            patientsCount={patientsCount}
            recordsCount={recordsCount}
            pendingReqCount={pendingReqCount}
            department={user?.departmentName}
          />
        );
      case 'patients':
        return <DoctorPatients />;
      case 'records':
        return <DoctorRecords />;
      case 'access':
        return <DoctorAccessRequests />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Simple tab navigation */}
      <nav className="flex space-x-4 border-b border-slate-800 pb-2">
        <button
          type="button"
          onClick={() => setPage('home')}
          className={`flex items-center gap-1 px-3 py-1 rounded ${page === 'home' ? 'bg-teal-500/20 text-teal-300' : 'text-slate-400'}`}
        >
          <Home className="w-4 h-4" /> Home
        </button>
        <button
          type="button"
          onClick={() => setPage('patients')}
          className={`flex items-center gap-1 px-3 py-1 rounded ${page === 'patients' ? 'bg-teal-500/20 text-teal-300' : 'text-slate-400'}`}
        >
          <Users className="w-4 h-4" /> Patients
        </button>
        <button
          type="button"
          onClick={() => setPage('records')}
          className={`flex items-center gap-1 px-3 py-1 rounded ${page === 'records' ? 'bg-teal-500/20 text-teal-300' : 'text-slate-400'}`}
        >
          <FileText className="w-4 h-4" /> Records
        </button>
        <button
          type="button"
          onClick={() => setPage('access')}
          className={`flex items-center gap-1 px-3 py-1 rounded ${page === 'access' ? 'bg-teal-500/20 text-teal-300' : 'text-slate-400'}`}
        >
          <ShieldCheck className="w-4 h-4" /> Access Requests
        </button>
      </nav>

      {renderPage()}
    </div>
  );
};

/**
 * Home screen – shows three numbers and department header.
 */
interface DoctorHomeProps {
  patientsCount: number;
  recordsCount: number;
  pendingReqCount: number;
  department?: string;
}
const DoctorHome: React.FC<DoctorHomeProps> = ({ patientsCount, recordsCount, pendingReqCount, department }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
    <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-teal-500/40 transition-all">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Patients I Can Treat</span>
        <div className="w-8 h-8 rounded-lg bg-teal-500/10 text-teal-400 flex items-center justify-center">
          <Users className="w-4 h-4" />
        </div>
      </div>
      <div className="text-2xl font-extrabold text-white mt-2">{patientsCount}</div>
    </div>
    <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-teal-500/40 transition-all">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Pending Access Requests</span>
        <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
          <ShieldCheck className="w-4 h-4" />
        </div>
      </div>
      <div className="text-2xl font-extrabold text-white mt-2">{pendingReqCount}</div>
    </div>
    <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-teal-500/40 transition-all">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Recent Records</span>
        <div className="w-8 h-8 rounded-lg bg-teal-500/10 text-teal-400 flex items-center justify-center">
          <FileText className="w-4 h-4" />
        </div>
      </div>
      <div className="text-2xl font-extrabold text-white mt-2">{recordsCount}</div>
    </div>
    <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-teal-500/40 transition-all">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Department</span>
        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
          <Key className="w-4 h-4" />
        </div>
      </div>
      <div className="text-base font-bold text-white mt-2 truncate">{department || 'General Medicine'}</div>
    </div>
  </div>
);

/**
 * Patients page – list of patients and a form to create a new record.
 */
const DoctorPatients: React.FC = () => {
  const [patients, setPatients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Load patients the doctor can treat
  useEffect(() => {
    api.getDoctorPatients().then((data) => setPatients(data)).finally(() => setLoading(false));
  }, []);

  // Form state
  const [recordType, setRecordType] = useState('Consultation');
  const [diagnosisCode, setDiagnosisCode] = useState('');
  const [prescriptions, setPrescriptions] = useState<string[]>(['']);
  const [labTests, setLabTests] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleAddPrescription = () => setPrescriptions([...prescriptions, '']);
  const handlePrescriptionChange = (idx: number, value: string) => {
    const newPres = [...prescriptions];
    newPres[idx] = value;
    setPrescriptions(newPres);
  };

  const handleLabTestToggle = (test: string) => {
    setLabTests((prev) =>
      prev.includes(test) ? prev.filter((t) => t !== test) : [...prev, test]
    );
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (file && file.type !== 'application/pdf') {
      setFileError('Only PDF files are accepted');
      setPdfFile(null);
    } else {
      setFileError('');
      setPdfFile(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pdfFile) {
      setFileError('Please select a PDF report');
      return;
    }
    setSubmitting(true);
    const formData = new FormData();
    formData.append('recordType', recordType);
    formData.append('diagnosisCode', diagnosisCode);
    prescriptions.forEach((p, i) => formData.append(`prescription[${i}]`, p));
    labTests.forEach((lt, i) => formData.append(`labTest[${i}]`, lt));
    formData.append('note', note);
    formData.append('reportPdf', pdfFile);

    try {
      await api.createDoctorRecord(formData);
      // Reset form
      setRecordType('Consultation');
      setDiagnosisCode('');
      setPrescriptions(['']);
      setLabTests([]);
      setNote('');
      setPdfFile(null);
      setFileError('');
      // Refresh records count (optional)
    } catch {
      // swallow error – real UI would show toast
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-white">Patients I Can Treat</h2>
      {loading ? (
        <div className="py-4 text-teal-400">Loading patients…</div>
      ) : (
        <ul className="space-y-2">
          {patients.map((p) => (
            <li key={p.id} className="p-3 rounded-xl bg-slate-800 text-slate-300 border border-slate-700">
              {p.fullName} – {p.hospitalName || 'Hospital'}
            </li>
          ))}
        </ul>
      )}

      <hr className="border-slate-700" />

      <h3 className="text-lg font-semibold text-white">Create New Record</h3>
      <form onSubmit={handleSubmit} className="space-y-4 text-sm text-slate-300">
        <div className="flex space-x-4">
          <select
            value={recordType}
            onChange={(e) => setRecordType(e.target.value)}
            className="p-2 rounded bg-slate-900 border border-slate-700"
          >
            <option value="Consultation">Consultation</option>
            <option value="Lab Report">Lab Report</option>
            <option value="Procedure Note">Procedure Note</option>
          </select>
          <input
            type="text"
            placeholder="Diagnosis code (e.g., I10)"
            value={diagnosisCode}
            onChange={(e) => setDiagnosisCode(e.target.value)}
            required
            className="flex-1 p-2 rounded bg-slate-900 border border-slate-700"
          />
        </div>
        <div>
          <label className="block mb-1 font-medium">Prescriptions</label>
          {prescriptions.map((p, i) => (
            <input
              key={i}
              type="text"
              placeholder="Medication"
              value={p}
              onChange={(e) => handlePrescriptionChange(i, e.target.value)}
              className="w-full p-2 mb-1 rounded bg-slate-900 border border-slate-700"
            />
          ))}
          <button
            type="button"
            onClick={handleAddPrescription}
            className="px-3 py-1 rounded bg-teal-500/20 text-teal-300 hover:bg-teal-500/30"
          >
            + Add Prescription
          </button>
        </div>
        <div>
          <label className="block mb-1 font-medium">Lab Tests (select any)</label>
          <div className="flex flex-wrap gap-2">
            {['CBC', 'Lipid Panel', 'Blood Glucose', 'ECG', 'X‑Ray'].map((test) => (
              <label key={test} className="flex items-center space-x-1">
                <input
                  type="checkbox"
                  checked={labTests.includes(test)}
                  onChange={() => handleLabTestToggle(test)}
                  className="form-checkbox text-teal-500"
                />
                <span className="text-sm">{test}</span>
              </label>
            ))}
          </div>
        </div>
        <div>
          <label className="block mb-1 font-medium">Optional Note</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={300}
            rows={3}
            className="w-full p-2 rounded bg-slate-900 border border-slate-700"
          />
          <div className="text-xs text-slate-500 text-right">{note.length}/300</div>
        </div>
        <div>
          <label className="block mb-1 font-medium">Report (PDF only)</label>
          <input type="file" accept="application/pdf" onChange={handleFileChange} className="file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:bg-teal-500/20 file:text-teal-300" />
          {fileError && <div className="text-xs text-rose-400 mt-1">{fileError}</div>}
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="px-4 py-2 rounded bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold"
        >
          {submitting ? 'Saving…' : 'Save Record'}
        </button>
      </form>
    </div>
  );
};

/**
 * Records page – list of doctor's own records with PDF opening.
 */
const DoctorRecords: React.FC = () => {
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [pdfUrl, setPdfUrl] = useState('');
  const [isPdfOpen, setIsPdfOpen] = useState(false);

  useEffect(() => {
    api.getDoctorRecords().then((data) => setRecords(data)).finally(() => setLoading(false));
  }, []);

  const openPdf = (recordId: string) => {
    api.getRecordPdf(recordId).then((url) => {
      setPdfUrl(url);
      setIsPdfOpen(true);
    });
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-white">My Records</h2>
      {loading ? (
        <div className="py-4 text-teal-400">Loading records…</div>
      ) : (
        <ul className="space-y-2">
          {records.map((rec) => (
            <li key={rec.id} className="p-4 rounded bg-slate-800 border border-slate-700 flex justify-between items-center">
              <div>
                <div className="font-medium text-teal-300">{rec.title || 'Medical Record'}</div>
                <div className="text-xs text-slate-400">{new Date(rec.created_at).toLocaleDateString()}</div>
              </div>
              <button
                type="button"
                onClick={() => openPdf(rec.id)}
                className="px-3 py-1 rounded bg-teal-500 hover:bg-teal-400 text-slate-950 text-sm"
              >
                Open PDF
              </button>
            </li>
          ))}
        </ul>
      )}

      {isPdfOpen && <RecordPdfModal pdfUrl={pdfUrl} onClose={() => setIsPdfOpen(false)} />}
    </div>
  );
};

/**
 * Access Requests page – request access to a patient and view request status.
 */
const DoctorAccessRequests: React.FC = () => {
  const [purpose, setPurpose] = useState('Second opinion');
  const [patientId, setPatientId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [requests, setRequests] = useState<any[]>([]);

  const loadRequests = () => {
    api.getDoctorAccessRequests().then(setRequests).catch(() => {});
  };

  useEffect(() => {
    loadRequests();
  }, []);

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientId) return;
    setSubmitting(true);
    try {
      await api.requestPatientAccess(patientId, purpose);
      setPatientId('');
      setPurpose('Second opinion');
      loadRequests();
    } catch {
      // ignore for now
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-white">Request Access to Patient Data</h2>
      <form onSubmit={handleRequest} className="space-y-3 text-sm text-slate-300">
        <input
          type="text"
          placeholder="Patient ID"
          value={patientId}
          onChange={(e) => setPatientId(e.target.value)}
          required
          className="w-full p-2 rounded bg-slate-900 border border-slate-700"
        />
        <select
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
          className="w-full p-2 rounded bg-slate-900 border border-slate-700"
        >
          <option value="Second opinion">Second opinion</option>
          <option value="Follow‑up care">Follow‑up care</option>
          <option value="Research">Research</option>
        </select>
        <button
          type="submit"
          disabled={submitting}
          className="px-4 py-2 rounded bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold"
        >
          {submitting ? 'Sending…' : 'Send Request'}
        </button>
      </form>

      <h3 className="text-lg font-semibold text-white mt-8">My Access Requests</h3>
      <ul className="space-y-2">
        {requests.map((r) => (
          <li key={r.id} className="p-3 rounded bg-slate-800 text-slate-300 border border-slate-700">
            <div>Patient: {r.patientId}</div>
            <div>Purpose: {r.purpose}</div>
            <div>Status: {r.status}</div>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default DoctorDashboard;

