import { FileDagNode, IotHealthcareReading } from '../src/types/index.js';
import { generateClsmHash, encryptMhe, computeSha256 } from './cryptoUtils.js';

class FileDagLedger {
  private dagNodes: FileDagNode[] = [];
  private iotReadings: IotHealthcareReading[] = [];

  constructor() {
    this.seedGenesisDag();
  }

  private seedGenesisDag() {
    const genesisTime = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const genesisCid = 'bafybeiclsmdag000000000000000000000000000000000000000000000';
    
    const genesisNode: FileDagNode = {
      cid: genesisCid,
      timestamp: genesisTime,
      dagParentHashes: ['0000000000000000000000000000000000000000000000000000000000000000'],
      clsmHash: 'clsm-0x8f2a41b990021c321045982ef01a',
      mheCiphertext: 'MHE-CT-RmVkVHJ1c3RNZWQgRmlsZURBRyBHZW5lc2lz',
      signature: 'ECDSA-NIST-P256-SIG-GENESIS-30450221008f...',
      originDeviceOrHospital: 'FileDAG Root Peer',
      dataSizeKb: 1.2,
      isVerified: true,
    };

    this.dagNodes.push(genesisNode);

    // Initial IoT Telemetry reading
    this.iotReadings.push({
      id: 'iot-read-001',
      patientId: 'pat-101',
      deviceId: 'IOT-ECG-9021',
      deviceType: 'ECG_MONITOR',
      timestamp: new Date(Date.now() - 3600 * 1000).toISOString(),
      heartRateBpm: 72,
      spO2Percent: 98,
      systolicBp: 120,
      diastolicBp: 80,
      temperatureC: 36.6,
      clsmHash: genesisNode.clsmHash,
      mheCiphertext: genesisNode.mheCiphertext,
      encryptionTimeMs: 1.45,
      fileDagCid: genesisCid,
      fileDagHash: computeSha256(genesisCid),
      dagParentHashes: genesisNode.dagParentHashes,
      isVerified: true,
    });
  }

  // FileDAG Data Ingestion & Storage Function
  public ingestHealthcareIotData(data: {
    patientId: string;
    deviceId: string;
    deviceType: IotHealthcareReading['deviceType'];
    heartRateBpm: number;
    spO2Percent: number;
    systolicBp: number;
    diastolicBp: number;
    temperatureC: number;
    originHospital?: string;
  }): { node: FileDagNode; reading: IotHealthcareReading } {
    const timestamp = new Date().toISOString();
    const rawPayload = JSON.stringify({
      patientId: data.patientId,
      deviceId: data.deviceId,
      deviceType: data.deviceType,
      timestamp,
      vitals: {
        hr: data.heartRateBpm,
        spo2: data.spO2Percent,
        bp: `${data.systolicBp}/${data.diastolicBp}`,
        temp: data.temperatureC,
      },
    });

    // 1. CLSM Hashing
    const { clsmHash } = generateClsmHash(rawPayload);

    // 2. MHE Homomorphic Encryption
    const mheEncrypted = encryptMhe(rawPayload);

    // 3. FileDAG Parent Selection (2 active tips in DAG)
    const latestTips = this.dagNodes.slice(-2).map((n) => n.cid);
    if (latestTips.length === 0) latestTips.push('bafybeiclsmdag0000000');

    // 4. Generate Content ID (CID)
    const cidHash = computeSha256(`${timestamp}-${clsmHash}-${mheEncrypted.ciphertext}`);
    const cid = `bafybei${cidHash.substring(0, 48)}`;

    const signature = `ECDSA-NIST-P256-SIG-${computeSha256(cid + clsmHash).substring(0, 32)}`;

    const node: FileDagNode = {
      cid,
      timestamp,
      dagParentHashes: latestTips,
      clsmHash,
      mheCiphertext: mheEncrypted.ciphertext,
      signature,
      originDeviceOrHospital: data.originHospital || data.deviceId,
      dataSizeKb: parseFloat((rawPayload.length / 1024 + 0.45).toFixed(2)),
      isVerified: true,
    };

    const reading: IotHealthcareReading = {
      id: `iot-read-${Date.now()}`,
      patientId: data.patientId,
      deviceId: data.deviceId,
      deviceType: data.deviceType,
      timestamp,
      heartRateBpm: data.heartRateBpm,
      spO2Percent: data.spO2Percent,
      systolicBp: data.systolicBp,
      diastolicBp: data.diastolicBp,
      temperatureC: data.temperatureC,
      clsmHash,
      mheCiphertext: mheEncrypted.ciphertext,
      encryptionTimeMs: mheEncrypted.encryptionTimeMs,
      fileDagCid: cid,
      fileDagHash: computeSha256(cid),
      dagParentHashes: latestTips,
      isVerified: true,
    };

    this.dagNodes.push(node);
    this.iotReadings.unshift(reading);

    return { node, reading };
  }

  public getDagNodes(): FileDagNode[] {
    return [...this.dagNodes].reverse();
  }

  public getIotReadings(): IotHealthcareReading[] {
    return [...this.iotReadings];
  }

  public verifyIntegrity(cid: string): { verified: boolean; clsmHash: string; dagParents: string[] } {
    const node = this.dagNodes.find((n) => n.cid === cid);
    if (!node) return { verified: false, clsmHash: '', dagParents: [] };
    return {
      verified: node.isVerified,
      clsmHash: node.clsmHash,
      dagParents: node.dagParentHashes,
    };
  }
}

export const fileDagLedger = new FileDagLedger();
