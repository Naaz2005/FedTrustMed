import { computeSha256 } from './cryptoUtils.js';
import { FabricBlock, FabricTransaction } from '../src/types/index.js';

class HyperledgerFabricNetwork {
  private blocks: FabricBlock[] = [];
  private transactions: FabricTransaction[] = [];
  private channelName: string = 'health-data-channel';
  private endorsingOrgs: string[] = ['HospitalA_MSP', 'HospitalB_MSP', 'HospitalC_MSP'];

  constructor() {
    this.initGenesisBlock();
  }

  // Initialize Genesis Block for Hyperledger Fabric Channel
  private initGenesisBlock() {
    const genesisTime = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const genesisTx: FabricTransaction = {
      txId: 'tx-genesis-00000000001',
      blockIndex: 0,
      timestamp: genesisTime,
      chaincode: 'GenesisChaincode',
      functionName: 'InitChannel',
      payloadHash: computeSha256('FedTrustMed Hyperledger Genesis Channel Config'),
      originHospital: 'System_Admin',
      status: 'VALIDATED',
      endorsedBy: this.endorsingOrgs,
    };

    const blockHash = computeSha256(`0-${genesisTime}-0000000000000000000000000000000000000000000000000000000000000000`);

    const genesisBlock: FabricBlock = {
      blockIndex: 0,
      timestamp: genesisTime,
      previousHash: '0000000000000000000000000000000000000000000000000000000000000000',
      blockHash,
      merkleRoot: genesisTx.payloadHash,
      transactionsCount: 1,
      channelName: this.channelName,
      endorsingOrgs: this.endorsingOrgs,
    };

    this.blocks.push(genesisBlock);
    this.transactions.push(genesisTx);
  }

  // Execute Chaincode Smart Contract & Append Block
  public invokeChaincode(
    chaincode: string,
    functionName: string,
    payloadData: object | string,
    originHospital: string
  ): { block: FabricBlock; transaction: FabricTransaction } {
    const timestamp = new Date().toISOString();
    const payloadHash = typeof payloadData === 'string' ? computeSha256(payloadData) : computeSha256(payloadData);
    const txId = `tx-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    const lastBlock = this.blocks[this.blocks.length - 1];
    const blockIndex = this.blocks.length;

    const transaction: FabricTransaction = {
      txId,
      blockIndex,
      timestamp,
      chaincode,
      functionName,
      payloadHash,
      originHospital,
      status: 'VALIDATED',
      endorsedBy: this.endorsingOrgs.filter(() => Math.random() > 0.1), // Endorsed by MSP nodes
    };

    const merkleRoot = computeSha256(`${payloadHash}-${txId}`);
    const blockHash = computeSha256(`${blockIndex}-${timestamp}-${lastBlock.blockHash}-${merkleRoot}`);

    const block: FabricBlock = {
      blockIndex,
      timestamp,
      previousHash: lastBlock.blockHash,
      blockHash,
      merkleRoot,
      transactionsCount: 1,
      channelName: this.channelName,
      endorsingOrgs: transaction.endorsedBy,
    };

    this.blocks.push(block);
    this.transactions.push(transaction);

    return { block, transaction };
  }

  public getBlocks(): FabricBlock[] {
    return [...this.blocks].reverse(); // latest first
  }

  public getTransactions(): FabricTransaction[] {
    return [...this.transactions].reverse();
  }

  public getBlockByIndex(index: number): FabricBlock | undefined {
    return this.blocks.find((b) => b.blockIndex === index);
  }

  public getTransactionById(txId: string): FabricTransaction | undefined {
    return this.transactions.find((tx) => tx.txId === txId);
  }

  public verifyIntegrity(): { valid: boolean; totalBlocks: number; issues: string[] } {
    const issues: string[] = [];
    for (let i = 1; i < this.blocks.length; i++) {
      const prev = this.blocks[i - 1];
      const curr = this.blocks[i];
      if (curr.previousHash !== prev.blockHash) {
        issues.push(`Block #${curr.blockIndex} previousHash mismatch with Block #${prev.blockIndex} hash.`);
      }
    }
    return {
      valid: issues.length === 0,
      totalBlocks: this.blocks.length,
      issues,
    };
  }
}

export const fabricBlockchain = new HyperledgerFabricNetwork();
