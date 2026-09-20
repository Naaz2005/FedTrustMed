import { TrustScoreFactor } from '../src/types/index.js';
import { fabricBlockchain } from './blockchain.js';

export type TrustEvent =
  | 'SUCCESSFUL_LOGIN'
  | 'FAILED_LOGIN'
  | 'REPEATED_FAILED_LOGIN'
  | 'UNAUTHORIZED_ACCESS'
  | 'EXCESSIVE_DOWNLOADS'
  | 'MANUAL_BONUS'
  | 'MANUAL_PENALTY';

export interface TrustRuleResult {
  scoreChange: number;
  newScore: number;
  isFrozen: boolean;
  reason: string;
  factor: TrustScoreFactor;
}

const TRUST_RULE_DELTAS: Record<TrustEvent, number> = {
  SUCCESSFUL_LOGIN: 2,
  FAILED_LOGIN: -5,
  REPEATED_FAILED_LOGIN: -20,
  UNAUTHORIZED_ACCESS: -40,
  EXCESSIVE_DOWNLOADS: -30,
  MANUAL_BONUS: 10,
  MANUAL_PENALTY: -15,
};

export class DynamicTrustEngine {
  private scoreLogs: TrustScoreFactor[] = [];

  public applyTrustRule(
    targetId: string,
    targetType: 'USER' | 'DOCTOR' | 'HOSPITAL',
    event: TrustEvent,
    currentScore: number,
    hospitalName: string,
    customReason?: string
  ): TrustRuleResult {
    const delta = TRUST_RULE_DELTAS[event] || 0;
    let newScore = Math.min(100, Math.max(0, currentScore + delta));
    const isFrozen = newScore < 40;

    const reason = customReason || this.getEventReason(event, delta);

    const factor: TrustScoreFactor = {
      id: `tr-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      targetId,
      targetType,
      event,
      scoreChange: delta,
      resultingScore: newScore,
      reason,
      timestamp: new Date().toISOString(),
    };

    this.scoreLogs.push(factor);

    // If score drops below 40, log immutable transaction to Hyperledger Fabric
    if (isFrozen) {
      fabricBlockchain.invokeChaincode(
        'TrustContract',
        'FreezeAccount',
        {
          targetId,
          targetType,
          resultingScore: newScore,
          reason: `Account frozen due to critical trust degradation (Score < 40)`,
        },
        hospitalName
      );
    } else if (Math.abs(delta) >= 15) {
      fabricBlockchain.invokeChaincode(
        'TrustContract',
        'UpdateTrustScore',
        { targetId, targetType, resultingScore: newScore, event, delta },
        hospitalName
      );
    }

    return {
      scoreChange: delta,
      newScore,
      isFrozen,
      reason,
      factor,
    };
  }

  private getEventReason(event: TrustEvent, delta: number): string {
    switch (event) {
      case 'SUCCESSFUL_LOGIN':
        return `Successful multi-factor authentication (+${delta})`;
      case 'FAILED_LOGIN':
        return `Failed authentication attempt (${delta})`;
      case 'REPEATED_FAILED_LOGIN':
        return `Repeated credential failure detected (${delta})`;
      case 'UNAUTHORIZED_ACCESS':
        return `Attempted access to unauthorized patient medical record (${delta})`;
      case 'EXCESSIVE_DOWNLOADS':
        return `Rapid bulk medical report download threshold exceeded (${delta})`;
      case 'MANUAL_BONUS':
        return `Administrator compliance audit approval (+${delta})`;
      case 'MANUAL_PENALTY':
        return `Security compliance penalty (${delta})`;
      default:
        return `Trust score adjustment (${delta})`;
    }
  }

  public getLogsForTarget(targetId: string): TrustScoreFactor[] {
    return this.scoreLogs.filter((l) => l.targetId === targetId).reverse();
  }

  public getAllLogs(): TrustScoreFactor[] {
    return [...this.scoreLogs].reverse();
  }
}

export const trustEngine = new DynamicTrustEngine();
