import React, { useState } from 'react';
import {
  ShieldCheck,
  Key,
  Lock,
  User,
  Fingerprint,
  CheckCircle,
  Building,
  Activity,
  Copy,
  Check,
  Shield,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export const AccountView: React.FC = () => {
  const { user } = useAuth();
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedHash, setCopiedHash] = useState(false);
  const [mfaState, setMfaState] = useState(user?.mfaEnabled ?? false);

  if (!user) return null;

  const mockEccKey = user.publicKeyEcc || `-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE7Z5f8m0QW9x7K6j8vP1m4R3bV7cX
L4y1n8q3t9z7w2e1u5i4o0p9a8s7d6f5g4h3j2k1l0z9x8c7v6b5n4m3==
-----END PUBLIC KEY-----`;

  const mockAadhaarHash = `hmac-sha256:7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069`;

  const copyToClipboard = (text: string, type: 'key' | 'hash') => {
    navigator.clipboard?.writeText(text);
    if (type === 'key') {
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    } else {
      setCopiedHash(true);
      setTimeout(() => setCopiedHash(false), 2000);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Profile Card */}
      <div className="rounded-2xl border border-slate-800 bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 p-6 sm:p-8 shadow-xl">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <div className="w-16 h-16 rounded-2xl bg-teal-500/20 border border-teal-500/40 text-teal-300 flex items-center justify-center font-extrabold text-2xl shadow-lg shadow-teal-500/10">
              {user.fullName.charAt(0)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-white">{user.fullName}</h2>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-teal-500/10 border border-teal-500/30 text-teal-300">
                  {user.role}
                </span>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" />
                  {user.approvalStatus}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1 font-mono">{user.email}</p>
              <p className="text-xs text-slate-400 mt-0.5">
                Affiliation: <span className="text-slate-200 font-semibold">{user.hospitalName || 'FedTrustMed Central Node'}</span>
                {user.departmentName && ` • ${user.departmentName}`}
              </p>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center gap-4">
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400">Account Standing</div>
              <div className={`text-sm font-bold ${user.isFrozen ? 'text-rose-400' : 'text-emerald-400'}`}>
                {user.isFrozen ? 'Your account is frozen, contact admin' : 'Your account is in good standing'}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                {user.isFrozen ? 'Security policy restriction' : 'Identity verified & policies compliant'}
              </div>
            </div>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${user.isFrozen ? 'bg-rose-500/10 border border-rose-500/20 text-rose-400' : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'}`}>
              <ShieldCheck className="w-5 h-5" />
            </div>
          </div>
        </div>
      </div>

      {/* Grid of Security & Identity Attributes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Cryptographic Identity (ECC & Zero Knowledge) */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
          <div className="flex items-center space-x-2 text-teal-400">
            <Key className="w-5 h-5" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-200">
              Cryptographic ECC P-256 Key Vault
            </h3>
          </div>
          <p className="text-xs text-slate-400">
            Your ECC public key is registered on the federated key directory. Private keys are encrypted and sealed with AES-256-GCM.
          </p>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-mono">Registered Public Key (SPKI / PEM)</span>
              <button
                type="button"
                onClick={() => copyToClipboard(mockEccKey, 'key')}
                className="inline-flex items-center gap-1 text-[11px] text-teal-400 hover:text-teal-300 font-semibold cursor-pointer"
              >
                {copiedKey ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedKey ? 'Copied' : 'Copy Key'}
              </button>
            </div>
            <pre className="p-3 rounded-xl bg-slate-950 font-mono text-[11px] text-slate-300 overflow-x-auto border border-slate-800/80 leading-relaxed max-h-36">
              {mockEccKey}
            </pre>
          </div>

          <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs">
            <span className="text-slate-400">Key Pair Curve</span>
            <span className="font-mono font-semibold text-teal-300">NIST P-256 (prime256v1)</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">Vault Seal Algorithm</span>
            <span className="font-mono font-semibold text-slate-300">AES-256-GCM (128-bit Tag)</span>
          </div>
        </div>

        {/* Identity & Zero-Knowledge Verification */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
          <div className="flex items-center space-x-2 text-teal-400">
            <Fingerprint className="w-5 h-5" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-200">
              Zero-Knowledge Identity Protection
            </h3>
          </div>
          <p className="text-xs text-slate-400">
            Raw Aadhaar numbers are never stored in plaintext. Identity validation is performed using a peppered HMAC-SHA256 one-way function.
          </p>

          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Aadhaar HMAC Hash:</span>
              <button
                type="button"
                onClick={() => copyToClipboard(mockAadhaarHash, 'hash')}
                className="text-[11px] text-teal-400 hover:text-teal-300 font-semibold cursor-pointer flex items-center gap-1"
              >
                {copiedHash ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copiedHash ? 'Copied' : 'Copy'}
              </button>
            </div>
            <div className="font-mono text-[11px] text-slate-300 break-all bg-slate-900/80 p-2 rounded-lg border border-slate-800">
              {mockAadhaarHash}
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
              <span>Display Suffix:</span>
              <span className="font-mono font-bold text-teal-400">•••• •••• {user.aadhaarLast4 || '0001'}</span>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-800 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Aadhaar Verification Status:</span>
              <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-semibold text-[11px]">
                {user.aadhaarVerificationStatus}
              </span>
            </div>
            {user.medicalLicenseNumber && (
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Medical Licence Number:</span>
                <span className="font-mono font-semibold text-white">{user.medicalLicenseNumber}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Emergency Account Freeze:</span>
              <span className={`font-semibold ${user.isFrozen ? 'text-rose-400' : 'text-emerald-400'}`}>
                {user.isFrozen ? 'FROZEN (RESTRICTED)' : 'ACTIVE (UNRESTRICTED)'}
              </span>
            </div>
          </div>
        </div>

      </div>

      {/* Security Policies & Multi-Factor Auth */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-400 flex items-center justify-center">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white">Multi-Factor Authentication (TOTP / OTP)</h4>
              <p className="text-xs text-slate-400">Require 6-digit cryptographic verification code at portal login</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setMfaState(!mfaState)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              mfaState
                ? 'bg-emerald-500 hover:bg-emerald-600 text-slate-950 shadow-md shadow-emerald-500/20'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
            }`}
          >
            {mfaState ? 'MFA Enabled' : 'Enable MFA'}
          </button>
        </div>
      </div>
    </div>
  );
};
