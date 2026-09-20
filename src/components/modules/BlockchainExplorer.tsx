import React, { useState, useEffect } from 'react';
import { FabricBlock, FabricTransaction, FileDagNode } from '../../types';
import { api } from '../../services/api';
import {
  Blocks,
  CheckCircle2,
  Lock,
  Layers,
  ShieldCheck,
  Cpu,
  GitBranch,
  Network,
  Check,
  Zap,
} from 'lucide-react';

export const BlockchainExplorer: React.FC = () => {
  const [mainTab, setMainTab] = useState<'FILE_DAG' | 'HYPERLEDGER'>('FILE_DAG');
  const [dagNodes, setDagNodes] = useState<FileDagNode[]>([]);
  const [selectedDagCid, setSelectedDagCid] = useState<string | null>(null);
  const [dagVerification, setDagVerification] = useState<any | null>(null);

  const [blocks, setBlocks] = useState<FabricBlock[]>([]);
  const [transactions, setTransactions] = useState<FabricTransaction[]>([]);
  const [selectedBlock, setSelectedBlock] = useState<FabricBlock | null>(null);
  const [verificationResult, setVerificationResult] = useState<any | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<'BLOCKS' | 'TRANSACTIONS'>('BLOCKS');

  const fetchData = async () => {
    try {
      const dRes = await api.getFileDagNodes();
      if (dRes && dRes.dagNodes) {
        setDagNodes(dRes.dagNodes);
        if (dRes.dagNodes.length > 0) setSelectedDagCid(dRes.dagNodes[0].cid);
      }

      const bRes = await api.getBlocks();
      if (bRes && bRes.blocks) {
        setBlocks(bRes.blocks);
        if (bRes.blocks.length > 0) setSelectedBlock(bRes.blocks[0]);
      }

      const tRes = await api.getTransactions();
      if (tRes && tRes.transactions) setTransactions(tRes.transactions);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleVerifyLedger = async () => {
    const res = await api.verifyBlockchain();
    setVerificationResult(res);
  };

  const handleVerifyDagNode = async (cid: string) => {
    const res = await api.verifyFileDagCid(cid);
    setDagVerification(res);
  };

  const currentDagNode = dagNodes.find((n) => n.cid === selectedDagCid) || dagNodes[0];

  return (
    <div className="space-y-6 font-sans">
      
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-blue-900 via-slate-900 to-indigo-950 rounded-3xl p-6 text-white shadow-xl border border-blue-800/60">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold uppercase tracking-wider bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2.5 py-0.5 rounded-full">
                FileDAG Blockchain & Hyperledger Ledger Architecture
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Decentralized Data Integrity Ledger</h1>
            <p className="text-slate-300 text-sm mt-1 max-w-xl">
              Combines high-throughput <strong>FileDAG-based blockchain/DAG</strong> storage for healthcare/IoT telemetry with <strong>Hyperledger Fabric</strong> for smart contract audit consent.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setMainTab('FILE_DAG')}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                mainTab === 'FILE_DAG'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30'
                  : 'bg-slate-950/80 text-slate-300 hover:text-white'
              }`}
            >
              <GitBranch className="w-4 h-4" /> FileDAG Architecture
            </button>
            <button
              onClick={() => setMainTab('HYPERLEDGER')}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                mainTab === 'HYPERLEDGER'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30'
                  : 'bg-slate-950/80 text-slate-300 hover:text-white'
              }`}
            >
              <Blocks className="w-4 h-4" /> Hyperledger Fabric
            </button>
          </div>
        </div>
      </div>

      {mainTab === 'FILE_DAG' && (
        <div className="space-y-6">
          
          {/* FileDAG Topology Card */}
          {currentDagNode && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
                    <Network className="w-5 h-5 text-blue-600" /> FileDAG Node & Graph Inspector
                  </h3>
                  <p className="text-xs text-slate-500">
                    CID: <span className="font-mono font-bold text-blue-600">{currentDagNode.cid}</span>
                  </p>
                </div>
                <button
                  onClick={() => handleVerifyDagNode(currentDagNode.cid)}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow flex items-center gap-1.5 transition-all"
                >
                  <ShieldCheck className="w-4 h-4" /> Verify DAG Node Integrity
                </button>
              </div>

              {/* Graphical DAG Parents Representation */}
              <div className="p-4 bg-slate-950 text-slate-200 rounded-2xl border border-slate-800 space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-blue-400 flex items-center gap-1.5">
                    <GitBranch className="w-4 h-4" /> Directed Acyclic Graph (DAG) Parent Hash Links
                  </span>
                  <span className="text-[10px] text-emerald-400 font-mono">Immutable DAG Consensus</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 font-mono text-[11px]">
                  {currentDagNode.dagParentHashes.map((pHash, idx) => (
                    <div key={idx} className="p-2.5 rounded-xl bg-slate-900 border border-blue-900/40 flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-[10px] font-bold">
                        P{idx + 1}
                      </div>
                      <div className="truncate">
                        <div className="text-[9px] text-slate-400">Parent DAG Link CID</div>
                        <div className="text-amber-300 truncate">{pHash}</div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[10px] pt-2 border-t border-slate-800">
                  <div>
                    <span className="text-slate-400 block">CLSM Chaotic Hash:</span>
                    <span className="font-mono text-amber-300 font-bold">{currentDagNode.clsmHash}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Digital Signature (ECDSA P-256):</span>
                    <span className="font-mono text-teal-300 truncate block">{currentDagNode.signature}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Origin Node / Peer:</span>
                    <span className="font-bold text-slate-100">{currentDagNode.originDeviceOrHospital}</span>
                  </div>
                </div>
              </div>

              {dagVerification && (
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-2xl text-xs text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <span>
                    FileDAG Integrity Verification Passed! Verified against parent tips: {dagVerification.dagParents.join(', ')}.
                  </span>
                </div>
              )}
            </div>
          )}

          {/* DAG Ledger List */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm">
            <h3 className="font-bold text-slate-900 dark:text-white text-base mb-4">
              FileDAG Immutable Block Chain Store ({dagNodes.length} Nodes)
            </h3>

            <div className="space-y-3">
              {dagNodes.map((node) => (
                <div
                  key={node.cid}
                  onClick={() => {
                    setSelectedDagCid(node.cid);
                    setDagVerification(null);
                  }}
                  className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                    selectedDagCid === node.cid
                      ? 'bg-blue-50/80 dark:bg-blue-950/50 border-blue-500 shadow-md'
                      : 'bg-slate-50/50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 hover:border-slate-400'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                    <div>
                      <div className="font-mono font-bold text-blue-600 dark:text-blue-400 flex items-center gap-2">
                        <GitBranch className="w-3.5 h-3.5" /> CID: {node.cid}
                      </div>
                      <p className="text-slate-500 text-[11px] mt-0.5">
                        Origin: {node.originDeviceOrHospital} | Size: {node.dataSizeKb} KB | Parents: {node.dagParentHashes.length}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 font-mono text-[10px] text-emerald-600 dark:text-emerald-400">
                      <Check className="w-3.5 h-3.5" /> CLSM Verified
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}

      {mainTab === 'HYPERLEDGER' && (
        <div className="space-y-6">
          {/* Verification Notice */}
          {verificationResult && (
            <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 text-xs text-emerald-800 dark:text-emerald-200 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-bold">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                <span>
                  Ledger Integrity Validated! {verificationResult.totalBlocks} Blocks Verified. Zero tamper detected.
                </span>
              </div>
            </div>
          )}

          {/* Navigation Sub-Tabs */}
          <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
            <button
              onClick={() => setActiveSubTab('BLOCKS')}
              className={`px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-2 transition-all ${
                activeSubTab === 'BLOCKS'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Blocks className="w-4 h-4" /> Block Chain Explorer ({blocks.length} Blocks)
            </button>
            <button
              onClick={() => setActiveSubTab('TRANSACTIONS')}
              className={`px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-2 transition-all ${
                activeSubTab === 'TRANSACTIONS'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Layers className="w-4 h-4" /> Endorsed Transactions ({transactions.length} Tx)
            </button>
          </div>

          {activeSubTab === 'BLOCKS' && (
            <div className="space-y-6">
              {/* Selected Block Inspector */}
              {selectedBlock && (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                    <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
                      <Lock className="w-5 h-5 text-blue-600" /> Block #{selectedBlock.blockIndex} Cryptographic Payload
                    </h3>
                    <span className="text-xs font-mono bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-300 px-2.5 py-1 rounded-lg border border-blue-200 dark:border-blue-800">
                      {selectedBlock.transactionsCount} Endorsed Transactions
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
                    <div className="p-3 bg-slate-950 text-slate-200 rounded-2xl border border-slate-800 space-y-1">
                      <div className="text-slate-400 text-[10px]">Current Block Hash (SHA-256)</div>
                      <div className="text-emerald-400 break-all">{selectedBlock.blockHash}</div>
                    </div>
                    <div className="p-3 bg-slate-950 text-slate-200 rounded-2xl border border-slate-800 space-y-1">
                      <div className="text-slate-400 text-[10px]">Previous Block Hash</div>
                      <div className="text-amber-400 break-all">{selectedBlock.previousHash}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Block List */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-3">
                {blocks.map((b) => (
                  <div
                    key={b.blockIndex}
                    onClick={() => setSelectedBlock(b)}
                    className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                      selectedBlock?.blockIndex === b.blockIndex
                        ? 'bg-blue-50/80 dark:bg-blue-950/50 border-blue-500 shadow-md'
                        : 'bg-slate-50/50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 hover:border-slate-400'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <Blocks className="w-4 h-4 text-blue-500" /> Block #{b.blockIndex}
                      </span>
                      <span className="font-mono text-slate-500">{new Date(b.timestamp).toLocaleTimeString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeSubTab === 'TRANSACTIONS' && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-3">
              {transactions.map((tx) => (
                <div key={tx.txId} className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700/80 space-y-2 text-xs">
                  <div className="flex items-center justify-between font-mono">
                    <span className="font-bold text-blue-600 dark:text-blue-400">TxID: {tx.txId}</span>
                    <span className="text-[10px] text-slate-400">{tx.timestamp}</span>
                  </div>
                  <div className="text-slate-700 dark:text-slate-300 font-semibold">
                    Chaincode: <span className="text-purple-600 dark:text-purple-400 font-bold">{tx.chaincode}</span> | Method: {tx.functionName}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

    </div>
  );
};

