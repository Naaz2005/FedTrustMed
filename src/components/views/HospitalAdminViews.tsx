import React, { useState, useEffect } from 'react';
import {
  Building,
  Users,
  Activity,
  CheckCircle,
  Clock,
  ChevronRight,
  ShieldCheck,
  UserCheck,
  AlertCircle,
  Search,
  Filter,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';

// ----------------------------------------------------------------------
// 1. HOSPITAL ADMIN HOME
// ----------------------------------------------------------------------
export const HospitalAdminHome: React.FC<{ onNavigate?: (page: string) => void }> = ({ onNavigate }) => {
  const { user } = useAuth();
  const [stats, setStats] = useState<{
    hospitalName: string;
    doctorsCount: number;
    patientsCount: number;
    pendingStaffCount: number;
  }>({
    hospitalName: user?.hospitalName || 'My Hospital',
    doctorsCount: 0,
    patientsCount: 0,
    pendingStaffCount: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    api.getHospitalOverview()
      .then((data) => {
        if (isMounted && data) {
          setStats({
            hospitalName: data.hospitalName || user?.hospitalName || 'My Hospital',
            doctorsCount: data.doctorsCount ?? 0,
            patientsCount: data.patientsCount ?? 0,
            pendingStaffCount: data.pendingStaffCount ?? 0,
          });
        }
      })
      .catch((err) => {
        console.error('Failed to load hospital overview stats:', err);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [user]);

  return (
    <div className="space-y-6">
      {/* Hospital Banner */}
      <div className="relative rounded-3xl bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 border border-slate-800 p-6 sm:p-8 overflow-hidden shadow-xl">
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Hospital Node Operational
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              {stats.hospitalName} Administration
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Administrative portal for managing hospital practitioners, registered patients, and non-clinical access activity.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-950/90 border border-slate-800 text-center shrink-0">
            <div className="text-[10px] font-mono uppercase text-slate-400">Node Trust Status</div>
            <div className="text-2xl font-black text-emerald-400 mt-0.5">Verified Active</div>
            <div className="text-[10px] text-emerald-400/80">Affiliated Network Participant</div>
          </div>
        </div>
      </div>

      {/* Primary Metrics Grid: Doctors, Patients, Pending Staff */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Doctors Count */}
        <div
          onClick={() => onNavigate && onNavigate('Staff and Patients')}
          className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-teal-500/40 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Affiliated Doctors</span>
            <div className="w-8 h-8 rounded-lg bg-teal-500/10 text-teal-400 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-white mt-2">
            {loading ? '...' : stats.doctorsCount}
          </div>
          <div className="text-[11px] text-teal-400 mt-1 flex items-center gap-1">
            <span>View medical staff</span>
            <ChevronRight className="w-3 h-3" />
          </div>
        </div>

        {/* Patients Count */}
        <div
          onClick={() => onNavigate && onNavigate('Staff and Patients')}
          className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-indigo-500/40 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Registered Patients</span>
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center group-hover:scale-110 transition-transform">
              <UserCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-white mt-2">
            {loading ? '...' : stats.patientsCount}
          </div>
          <div className="text-[11px] text-indigo-400 mt-1 flex items-center gap-1">
            <span>View patient directory</span>
            <ChevronRight className="w-3 h-3" />
          </div>
        </div>

        {/* Pending Staff Count */}
        <div
          onClick={() => onNavigate && onNavigate('Staff and Patients')}
          className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-amber-500/40 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Pending Staff</span>
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-white mt-2">
            {loading ? '...' : stats.pendingStaffCount}
          </div>
          <div className="text-[11px] text-amber-400 mt-1 flex items-center gap-1">
            <span>Review pending applications</span>
            <ChevronRight className="w-3 h-3" />
          </div>
        </div>
      </div>

      {/* Quick Navigation Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div
          onClick={() => onNavigate && onNavigate('Staff and Patients')}
          className="p-6 rounded-2xl border border-slate-800 bg-slate-900/40 hover:bg-slate-900/70 transition-all cursor-pointer space-y-3"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-500/10 text-teal-400 flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">Staff and Patients</h3>
              <p className="text-xs text-slate-400">View affiliated doctors, registered patients, and pending staff requests.</p>
            </div>
          </div>
        </div>

        <div
          onClick={() => onNavigate && onNavigate('Hospital Activity')}
          className="p-6 rounded-2xl border border-slate-800 bg-slate-900/40 hover:bg-slate-900/70 transition-all cursor-pointer space-y-3"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">Hospital Activity</h3>
              <p className="text-xs text-slate-400">Audit trail of who created, shared, or opened records at this hospital.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ----------------------------------------------------------------------
// 2. HOSPITAL STAFF AND PATIENTS
// ----------------------------------------------------------------------
export const HospitalStaffAndPatients: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'doctors' | 'patients' | 'pending'>('doctors');
  const [staff, setStaff] = useState<any[]>([]);
  const [patients, setPatients] = useState<any[]>([]);
  const [pendingStaff, setPendingStaff] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const loadData = () => {
    setLoading(true);
    Promise.all([
      api.getHospitalStaff().catch(() => []),
      api.getHospitalPatients().catch(() => []),
      api.getHospitalPendingApprovals().catch(() => []),
    ]).then(([staffData, patientsData, pendingData]) => {
      setStaff(staffData || []);
      setPatients(patientsData || []);
      setPendingStaff(pendingData || []);
    }).finally(() => {
      setLoading(false);
    });
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredStaff = staff.filter((s) =>
    (s.full_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (s.specialty || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (s.email || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredPatients = patients.filter((p) =>
    (p.full_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.email || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredPending = pendingStaff.filter((u) =>
    (u.full_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (u.email || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-800 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-teal-400" />
            Staff and Patients
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Directory of affiliated medical practitioners, registered patients, and pending staff applications.
          </p>
        </div>

        {/* Tab Selection */}
        <div className="flex bg-slate-900 border border-slate-800 rounded-xl p-1 gap-1">
          <button
            type="button"
            onClick={() => setActiveTab('doctors')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'doctors'
                ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Doctors ({staff.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('patients')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'patients'
                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Patients ({patients.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('pending')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'pending'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Pending Staff ({pendingStaff.length})
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative max-w-md">
        <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={`Search ${activeTab}...`}
          className="w-full bg-slate-900/80 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-teal-500"
        />
      </div>

      {/* Tab 1: Doctors */}
      {activeTab === 'doctors' && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-xl">
          <div className="px-6 py-4 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between">
            <h3 className="font-bold text-sm text-white">Affiliated Doctors</h3>
            <span className="text-xs text-slate-400">{filteredStaff.length} practitioner(s)</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider font-mono text-[10px] border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Doctor Name</th>
                  <th className="py-3 px-4">Department & Specialty</th>
                  <th className="py-3 px-4">Licence Number</th>
                  <th className="py-3 px-4">Trust Score</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 text-slate-300">
                {filteredStaff.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500">
                      {loading ? 'Loading affiliated doctors...' : 'No affiliated doctors found for this hospital.'}
                    </td>
                  </tr>
                ) : (
                  filteredStaff.map((doc) => (
                    <tr key={doc.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-bold text-white">{doc.full_name}</div>
                        <div className="text-[11px] font-mono text-slate-400">{doc.email}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div>{doc.department_name || 'General Practice'}</div>
                        <div className="text-[11px] text-slate-400">{doc.specialty || 'Specialist'}</div>
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-teal-300">
                        {doc.license_number || 'N/A'}
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-bold text-emerald-400">{doc.trust_score || '100.00'}%</span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          ACTIVE
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Patients */}
      {activeTab === 'patients' && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-xl">
          <div className="px-6 py-4 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between">
            <h3 className="font-bold text-sm text-white">Registered Patients</h3>
            <span className="text-xs text-slate-400">{filteredPatients.length} patient(s)</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider font-mono text-[10px] border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Patient Name</th>
                  <th className="py-3 px-4">Gender & Blood Group</th>
                  <th className="py-3 px-4">Primary Hospital</th>
                  <th className="py-3 px-4">Registration Date</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 text-slate-300">
                {filteredPatients.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500">
                      {loading ? 'Loading registered patients...' : 'No registered patients found for this hospital.'}
                    </td>
                  </tr>
                ) : (
                  filteredPatients.map((pat) => (
                    <tr key={pat.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-bold text-white">{pat.full_name}</div>
                        <div className="text-[11px] font-mono text-slate-400">{pat.email}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div>{pat.gender || 'Unspecified'}</div>
                        <div className="text-[11px] text-slate-400">Blood Type: {pat.blood_type || 'N/A'}</div>
                      </td>
                      <td className="py-3 px-4 text-slate-300">
                        {pat.primary_hospital_name || 'This Hospital'}
                      </td>
                      <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                        {pat.created_at ? new Date(pat.created_at).toLocaleDateString() : 'N/A'}
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          REGISTERED
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Pending Staff */}
      {activeTab === 'pending' && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-xl">
          <div className="px-6 py-4 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between">
            <h3 className="font-bold text-sm text-white">Pending Staff Applications</h3>
            <span className="text-xs text-slate-400">{filteredPending.length} pending applicant(s)</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider font-mono text-[10px] border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Applicant</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Department</th>
                  <th className="py-3 px-4">Credentials</th>
                  <th className="py-3 px-4">Submission Date</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 text-slate-300">
                {filteredPending.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500">
                      {loading ? 'Loading pending applications...' : 'No pending staff applications for this hospital.'}
                    </td>
                  </tr>
                ) : (
                  filteredPending.map((applicant) => (
                    <tr key={applicant.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-bold text-white">{applicant.full_name}</div>
                        <div className="text-[11px] font-mono text-slate-400">{applicant.email}</div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-800 text-teal-300">
                          {applicant.role}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-300">
                        {applicant.department_name || 'Pending Assignment'}
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-400">
                        {applicant.medical_license_number || applicant.admin_authorization_code || 'Provided on File'}
                      </td>
                      <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                        {applicant.created_at ? new Date(applicant.created_at).toLocaleDateString() : 'N/A'}
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          PENDING APPROVAL
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

// ----------------------------------------------------------------------
// 3. HOSPITAL ACTIVITY
// ----------------------------------------------------------------------
export const HospitalActivity: React.FC = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let isMounted = true;
    api.getHospitalActivity()
      .then((data) => {
        if (isMounted) {
          setLogs(data || []);
        }
      })
      .catch((err) => {
        console.error('Failed to load hospital activity:', err);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const filteredLogs = logs.filter((log) =>
    (log.user_name || '').toLowerCase().includes(search.toLowerCase()) ||
    (log.action || '').toLowerCase().includes(search.toLowerCase()) ||
    (log.details || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-800 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-indigo-400" />
            Hospital Activity
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Non-clinical activity log of record operations, consent grants, and access events for this hospital.
          </p>
        </div>

        <div className="relative max-w-xs w-full">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search activity..."
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-xl">
        <div className="divide-y divide-slate-800">
          {filteredLogs.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              {loading ? 'Loading activity logs...' : 'No activity logged for this hospital yet.'}
            </div>
          ) : (
            filteredLogs.map((log) => (
              <div
                key={log.id}
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-850 transition-colors"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-500/10 text-indigo-300 border border-indigo-500/30">
                      {log.action}
                    </span>
                    <span className="text-xs font-semibold text-white">
                      {log.user_name}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      ({log.user_role})
                    </span>
                  </div>
                  <p className="text-xs text-slate-300">{log.details}</p>
                </div>

                <div className="text-right shrink-0">
                  <span className="text-xs font-mono text-slate-400 block">
                    {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono block">
                    {new Date(log.timestamp).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
