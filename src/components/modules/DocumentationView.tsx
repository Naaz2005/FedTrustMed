import React, { useState } from 'react';
import {
  FileText,
  Database,
  Layers,
  Terminal,
  Code2,
  BookOpen,
  CheckCircle2,
  Lock,
  Blocks,
  ShieldCheck,
  Building2,
  Server,
} from 'lucide-react';

export const DocumentationView: React.FC = () => {
  const [docTab, setDocTab] = useState<'OVERVIEW' | 'ARCHITECTURE' | 'ER_DIAGRAM' | 'API_REF' | 'DEPLOYMENT'>('OVERVIEW');

  return (
    <div className="space-y-6">
      
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 rounded-3xl p-6 text-white shadow-xl border border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold uppercase tracking-wider bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2.5 py-0.5 rounded-full">
                FedTrustMed Specifications & Engineering Specs
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Documentation & System Blueprint</h1>
            <p className="text-slate-300 text-sm mt-1 max-w-xl">
              Comprehensive technical documentation for final-year engineering review: Architecture, Relational Schema, REST APIs, and Hyperledger Fabric Chaincode.
            </p>
          </div>
        </div>
      </div>

      {/* Doc Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
        {[
          { id: 'OVERVIEW', label: 'README & Features', icon: BookOpen },
          { id: 'ARCHITECTURE', label: 'Architecture Diagram', icon: Layers },
          { id: 'ER_DIAGRAM', label: 'Database ER Diagram', icon: Database },
          { id: 'API_REF', label: 'REST API Specs', icon: Code2 },
          { id: 'DEPLOYMENT', label: 'Deployment & Setup', icon: Server },
        ].map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setDocTab(t.id as any)}
              className={`px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-2 transition-all ${
                docTab === t.id
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Icon className="w-4 h-4" /> {t.label}
            </button>
          );
        })}
      </div>

      {/* OVERVIEW TAB */}
      {docTab === 'OVERVIEW' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-6 text-slate-800 dark:text-slate-200 text-sm">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">FedTrustMed Project Objective</h2>
            <p className="leading-relaxed text-slate-600 dark:text-slate-300">
              <strong>FedTrustMed</strong> is a federated blockchain framework designed for secure, privacy-preserving healthcare data sharing across multiple hospital networks. It combines <strong>Hyperledger Fabric smart contracts</strong>, <strong>AES-256 + ECC NIST P-256 hybrid encryption</strong>, a <strong>Dynamic Trust Score Engine</strong>, <strong>AI Threat Detection</strong>, and a <strong>Federated Learning (FedAvg)</strong> framework.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="p-4 rounded-2xl bg-blue-50/60 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 space-y-1">
              <h4 className="font-bold text-blue-900 dark:text-blue-200 text-sm">Key Architectural Pillars</h4>
              <ul className="list-disc list-inside space-y-1 text-slate-700 dark:text-slate-300">
                <li>Decentralized Hyperledger Fabric channel consensus across 3 hospital MSP peers.</li>
                <li>Zero raw medical data on blockchain; only SHA-256 record hashes and consent logs.</li>
                <li>Dynamic Trust Engine adjusting user reputation (+2, -5, -20, -40, -30).</li>
                <li>AI Threat Detector intercepting Brute Force, SQLi, DDoS, and Credential Stuffing.</li>
                <li>FedAvg Federated Learning aggregating gradient weight matrices without sharing raw patient data.</li>
              </ul>
            </div>

            <div className="p-4 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 space-y-1">
              <h4 className="font-bold text-emerald-900 dark:text-emerald-200 text-sm">Supported User Roles</h4>
              <ul className="list-disc list-inside space-y-1 text-slate-700 dark:text-slate-300">
                <li><strong>Patient:</strong> Manage consent, view history, decrypt reports, inspect access logs.</li>
                <li><strong>Doctor:</strong> Create encrypted diagnoses, request cross-hospital consent, review assigned roster.</li>
                <li><strong>Hospital Admin:</strong> Manage doctors, approve inter-hospital requests, monitor hospital MSP peer.</li>
                <li><strong>System Admin:</strong> Onboard hospitals, manage Hyperledger Fabric channel, launch cyber attack simulations.</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* ARCHITECTURE DIAGRAM TAB */}
      {docTab === 'ARCHITECTURE' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-6">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Federated Blockchain & Security Architecture</h2>

          {/* Visual SVG Flow Diagram */}
          <div className="p-6 bg-slate-950 rounded-2xl text-white space-y-6">
            <div className="text-center font-bold text-sm text-blue-400 border-b border-slate-800 pb-3">
              HYPERLEDGER FABRIC & FEDERATED LEARNING DATA FLOW
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-center">
              
              <div className="p-4 rounded-xl bg-slate-900 border border-blue-800 space-y-2">
                <div className="font-bold text-blue-400">Hospital A Peer Node</div>
                <div className="p-2 bg-slate-950 rounded-lg text-[10px] font-mono">
                  <div>PostgreSQL (AES-256)</div>
                  <div>Local AI Model (Pneumonia)</div>
                  <div>MSP Peer: HospitalA_MSP</div>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-900 border border-purple-800 space-y-2">
                <div className="font-bold text-purple-400">Hospital B Peer Node</div>
                <div className="p-2 bg-slate-950 rounded-lg text-[10px] font-mono">
                  <div>PostgreSQL (AES-256)</div>
                  <div>Local AI Model (Cardiac)</div>
                  <div>MSP Peer: HospitalB_MSP</div>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-900 border border-emerald-800 space-y-2">
                <div className="font-bold text-emerald-400">Hospital C Peer Node</div>
                <div className="p-2 bg-slate-950 rounded-lg text-[10px] font-mono">
                  <div>PostgreSQL (AES-256)</div>
                  <div>Local AI Model (Diabetes)</div>
                  <div>MSP Peer: HospitalC_MSP</div>
                </div>
              </div>

            </div>

            <div className="p-4 rounded-xl bg-indigo-950 border border-indigo-700 text-center text-xs space-y-1">
              <div className="font-bold text-indigo-300">Hyperledger Fabric Channel: health-data-channel</div>
              <p className="text-slate-400 text-[11px]">
                Smart Contracts (Chaincode): <strong>ConsentContract</strong> | <strong>MedicalRecordRegistry</strong> | <strong>AuditContract</strong> | <strong>TrustContract</strong>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ER DIAGRAM TAB */}
      {docTab === 'ER_DIAGRAM' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">PostgreSQL Relational ER Diagram</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
            {[
              { title: 'Users', fields: ['id (PK)', 'email', 'fullName', 'role', 'hospitalId (FK)', 'trustScore', 'isFrozen', 'publicKeyEcc'] },
              { title: 'Patients', fields: ['id (PK)', 'userId (FK)', 'fullName', 'dob', 'gender', 'bloodType', 'allergies[]', 'emergencyContact'] },
              { title: 'Doctors', fields: ['id (PK)', 'userId (FK)', 'fullName', 'specialty', 'departmentId (FK)', 'hospitalId (FK)', 'licenseNumber'] },
              { title: 'Hospitals', fields: ['id (PK)', 'name', 'code', 'region', 'status', 'trustScore', 'nodeAddress', 'doctorsCount'] },
              { title: 'Medical Records', fields: ['id (PK)', 'patientId (FK)', 'doctorId (FK)', 'title', 'encryptedContent (AES)', 'sha256Hash', 'fabricTxId'] },
              { title: 'Consent Records', fields: ['id (PK)', 'patientId (FK)', 'requestingHospitalId (FK)', 'status', 'purpose', 'fabricTxId'] },
              { title: 'Blockchain Transactions', fields: ['txId (PK)', 'blockIndex', 'chaincode', 'functionName', 'payloadHash', 'status'] },
              { title: 'Audit Logs', fields: ['id (PK)', 'userId (FK)', 'userRole', 'action', 'ipAddress', 'trustImpact', 'fabricTxId'] },
              { title: 'Trust Scores', fields: ['id (PK)', 'targetId', 'event', 'scoreChange', 'resultingScore', 'reason'] },
            ].map((tbl, i) => (
              <div key={i} className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="font-bold text-sm text-blue-600 dark:text-blue-400 border-b border-slate-200 dark:border-slate-700 pb-1">
                  Table: {tbl.title}
                </div>
                <div className="space-y-1 font-mono text-[11px] text-slate-700 dark:text-slate-300">
                  {tbl.fields.map((f, idx) => (
                    <div key={idx}>• {f}</div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* API REFERENCE TAB */}
      {docTab === 'API_REF' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">REST API Reference Manual</h2>

          <div className="space-y-3 font-mono text-xs">
            {[
              { method: 'POST', endpoint: '/api/auth/login', desc: 'Authenticate user & apply +2 trust score reward' },
              { method: 'GET', endpoint: '/api/medical-records', desc: 'Fetch medical records for patient or doctor' },
              { method: 'POST', endpoint: '/api/medical-records', desc: 'Create report, encrypt with AES-256 + ECC, commit SHA-256 to Fabric' },
              { method: 'POST', endpoint: '/api/medical-records/decrypt', desc: 'Decrypt AES-256 ciphertext using recipient ECC private key' },
              { method: 'POST', endpoint: '/api/consent/grant', desc: 'Patient approves consent request & logs transaction on Fabric' },
              { method: 'POST', endpoint: '/api/consent/revoke', desc: 'Patient revokes consent & logs revocation on Fabric' },
              { method: 'GET', endpoint: '/api/blockchain/blocks', desc: 'Retrieve Hyperledger Fabric blocks chain' },
              { method: 'POST', endpoint: '/api/ai/simulate-attack', desc: 'Launch cyber threat simulation (Brute force, SQLi, DDoS)' },
              { method: 'POST', endpoint: '/api/federated/train-round', desc: 'Trigger FedAvg round across Hospital A, B, C' },
            ].map((apiItem, i) => (
              <div key={i} className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex items-center gap-3">
                <span className={`px-2.5 py-1 rounded-md font-bold text-[10px] ${apiItem.method === 'POST' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'}`}>
                  {apiItem.method}
                </span>
                <span className="font-bold text-slate-900 dark:text-white">{apiItem.endpoint}</span>
                <span className="text-slate-500 font-sans text-[11px] truncate">{apiItem.desc}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* DEPLOYMENT TAB */}
      {docTab === 'DEPLOYMENT' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Deployment & Docker Setup Guide</h2>

          <div className="p-4 bg-slate-950 text-emerald-400 font-mono rounded-2xl text-xs space-y-2 overflow-x-auto">
            <div># 1. Clone & Setup Container Environment</div>
            <div className="text-slate-400">git clone https://github.com/fedtrustmed/fedtrustmed-framework.git</div>
            <div className="text-slate-400">cd fedtrustmed-framework</div>
            
            <div className="pt-2"># 2. Build & Launch Express Backend + Hyperledger Fabric Node Containers</div>
            <div className="text-slate-400">docker-compose up --build -d</div>

            <div className="pt-2"># 3. Verify Container Status</div>
            <div className="text-slate-400">docker ps</div>
            <div className="text-emerald-300">fedtrustmed-app | PORT: 3000 | HEALTHY</div>
            <div className="text-emerald-300">peer0.hospitala.fedtrustmed.org | PORT: 7051 | HEALTHY</div>
            <div className="text-emerald-300">peer0.hospitalb.fedtrustmed.org | PORT: 8051 | HEALTHY</div>
            <div className="text-emerald-300">peer0.hospitalc.fedtrustmed.org | PORT: 9051 | HEALTHY</div>
          </div>
        </div>
      )}

    </div>
  );
};
