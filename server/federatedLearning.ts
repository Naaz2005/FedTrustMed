import { FederatedModelNode, FederatedRound } from '../src/types/index.js';
import { computeSha256 } from './cryptoUtils.js';
import { fabricBlockchain } from './blockchain.js';

export class FederatedLearningManager {
  private nodes: FederatedModelNode[] = [];
  private rounds: FederatedRound[] = [];
  private currentRoundNumber: number = 3;

  constructor() {
    this.initNodesAndRounds();
  }

  private initNodesAndRounds() {
    this.nodes = [
      {
        hospitalId: 'hosp-a',
        hospitalName: 'St. Jude General Hospital (HOSP-A)',
        localSamples: 4200,
        localLoss: 0.182,
        localAccuracy: 94.6,
        lastUpdated: new Date().toISOString(),
        modelWeightsHash: '0x8f2a41c890e7123a189f',
        status: 'SYNCED',
      },
      {
        hospitalId: 'hosp-b',
        hospitalName: 'Metro Heart & Cancer Specialty (HOSP-B)',
        localSamples: 3100,
        localLoss: 0.198,
        localAccuracy: 93.8,
        lastUpdated: new Date().toISOString(),
        modelWeightsHash: '0x3c7e9021b44d88e2190f',
        status: 'SYNCED',
      },
      {
        hospitalId: 'hosp-c',
        hospitalName: 'City Memorial Hospital (HOSP-C)',
        localSamples: 2700,
        localLoss: 0.205,
        localAccuracy: 92.9,
        lastUpdated: new Date().toISOString(),
        modelWeightsHash: '0x1b4a92f800d119c301ae',
        status: 'SYNCED',
      },
    ];

    // Seed historical rounds
    this.rounds = [
      {
        roundNumber: 1,
        timestamp: new Date(Date.now() - 48 * 3600 * 1000).toISOString(),
        globalLoss: 0.385,
        globalAccuracy: 84.2,
        participatingHospitals: ['HOSP-A', 'HOSP-B', 'HOSP-C'],
        aggregateWeightsHash: '0xfeed00018823a010912f',
      },
      {
        roundNumber: 2,
        timestamp: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
        globalLoss: 0.245,
        globalAccuracy: 90.5,
        participatingHospitals: ['HOSP-A', 'HOSP-B', 'HOSP-C'],
        aggregateWeightsHash: '0xfeed00028823a010913a',
      },
      {
        roundNumber: 3,
        timestamp: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
        globalLoss: 0.191,
        globalAccuracy: 94.1,
        participatingHospitals: ['HOSP-A', 'HOSP-B', 'HOSP-C'],
        aggregateWeightsHash: '0xfeed00038823a010914b',
      },
    ];
  }

  public runFederatedRound(): { newRound: FederatedRound; updatedNodes: FederatedModelNode[] } {
    this.currentRoundNumber += 1;

    // Simulate training improvement with FedAvg
    let totalSamples = 0;
    let weightedAccuracySum = 0;
    let weightedLossSum = 0;

    this.nodes = this.nodes.map((node) => {
      // Simulate local training step
      const accuracyBoost = +(Math.random() * 0.8 + 0.3).toFixed(2);
      const lossReduction = +(Math.random() * 0.015 + 0.005).toFixed(3);

      const newAccuracy = Math.min(98.8, +(node.localAccuracy + accuracyBoost).toFixed(2));
      const newLoss = Math.max(0.08, +(node.localLoss - lossReduction).toFixed(3));
      const newHash = '0x' + computeSha256(`${node.hospitalId}-${this.currentRoundNumber}-${newAccuracy}`).substring(0, 20);

      totalSamples += node.localSamples;
      weightedAccuracySum += newAccuracy * node.localSamples;
      weightedLossSum += newLoss * node.localSamples;

      return {
        ...node,
        localAccuracy: newAccuracy,
        localLoss: newLoss,
        lastUpdated: new Date().toISOString(),
        modelWeightsHash: newHash,
        status: 'SYNCED',
      };
    });

    const globalAccuracy = +(weightedAccuracySum / totalSamples).toFixed(2);
    const globalLoss = +(weightedLossSum / totalSamples).toFixed(3);
    const aggregateWeightsHash = '0xfeed' + computeSha256(`global-round-${this.currentRoundNumber}-${globalAccuracy}`).substring(0, 16);

    const newRound: FederatedRound = {
      roundNumber: this.currentRoundNumber,
      timestamp: new Date().toISOString(),
      globalLoss,
      globalAccuracy,
      participatingHospitals: this.nodes.map((n) => n.hospitalId.toUpperCase()),
      aggregateWeightsHash,
    };

    this.rounds.push(newRound);

    // Commit Federated Learning Weight Sync to Hyperledger Fabric
    fabricBlockchain.invokeChaincode(
      'FederatedLearningContract',
      'CommitGlobalWeights',
      { roundNumber: this.currentRoundNumber, globalAccuracy, globalLoss, aggregateWeightsHash },
      'FedTrustMed_Coordinator'
    );

    return {
      newRound,
      updatedNodes: this.nodes,
    };
  }

  public getNodes(): FederatedModelNode[] {
    return this.nodes;
  }

  public getRounds(): FederatedRound[] {
    return this.rounds;
  }
}

export const federatedLearningManager = new FederatedLearningManager();
