import { AIThreatAlert } from '../src/types/index.js';
import { fabricBlockchain } from './blockchain.js';
import { idrsnEngine } from './idrsnEngine.js';

export class AIThreatDetector {
  private alerts: AIThreatAlert[] = [];

  constructor() {
    this.seedInitialThreats();
  }

  private seedInitialThreats() {
    const now = new Date();
    this.alerts.push(
      {
        id: 'alert-101',
        threatType: 'BRUTE_FORCE',
        severity: 'HIGH',
        targetUser: 'dr_robert@hospital-a.com',
        targetHospital: 'St. Jude General Hospital (HOSP-A)',
        ipAddress: '192.168.1.104',
        description: 'IDRSN Soft Thresholding: 14 consecutive failed login attempts detected within 45 seconds.',
        detectedAt: new Date(now.getTime() - 2 * 3600 * 1000).toISOString(),
        status: 'MITIGATED',
        recommendedAction: 'Enforce IP rate limit & require MFA reset.',
        datasetOrigin: 'ToN-IoT',
        idrsnConfidence: 99.4,
        bstoaOptimized: true,
      },
      {
        id: 'alert-102',
        threatType: 'SQL_INJECTION',
        severity: 'CRITICAL',
        targetHospital: 'Metro Heart & Cancer Specialty (HOSP-B)',
        ipAddress: '45.33.21.98',
        description: "IDRSN Intercepted SQL Payload: `' UNION SELECT username, password_hash FROM users--` in search parameter.",
        detectedAt: new Date(now.getTime() - 45 * 60 * 1000).toISOString(),
        status: 'ACTIVE',
        recommendedAction: 'Block origin IP at firewall & review parameterized queries.',
        datasetOrigin: 'CICIDS-2017',
        idrsnConfidence: 99.7,
        bstoaOptimized: true,
      },
      {
        id: 'alert-103',
        threatType: 'EXCESSIVE_DOWNLOADS',
        severity: 'MEDIUM',
        targetUser: 'dr_smith@hospital-c.com',
        targetHospital: 'City Memorial Hospital (HOSP-C)',
        ipAddress: '10.0.4.12',
        description: 'IDRSN Anomaly: 28 encrypted patient record files downloaded within 2 minutes.',
        detectedAt: new Date(now.getTime() - 15 * 60 * 1000).toISOString(),
        status: 'ACTIVE',
        recommendedAction: 'Apply -30 Trust Penalty & request supervisor approval.',
        datasetOrigin: 'ToN-IoT',
        idrsnConfidence: 99.1,
        bstoaOptimized: true,
      }
    );
  }

  public detectThreat(
    type: AIThreatAlert['threatType'],
    targetUser: string | undefined,
    targetHospital: string,
    ipAddress: string,
    customDescription?: string,
    datasetOrigin: 'ToN-IoT' | 'CICIDS-2017' = 'ToN-IoT'
  ): AIThreatAlert {
    const severityMap: Record<AIThreatAlert['threatType'], AIThreatAlert['severity']> = {
      BRUTE_FORCE: 'HIGH',
      SQL_INJECTION: 'CRITICAL',
      DDOS_SIMULATION: 'CRITICAL',
      CREDENTIAL_STUFFING: 'HIGH',
      ABNORMAL_BEHAVIOR: 'MEDIUM',
      EXCESSIVE_DOWNLOADS: 'HIGH',
      MALWARE_INJECTION: 'CRITICAL',
      BOTNET_TRAFFIC: 'HIGH',
    };

    const actionMap: Record<AIThreatAlert['threatType'], string> = {
      BRUTE_FORCE: 'Trigger account lockout & apply -20 Trust score deduction.',
      SQL_INJECTION: 'Block IP address immediately & log security incident on FileDAG.',
      DDOS_SIMULATION: 'Activate rate-limiting middleware & dispatch challenge tokens.',
      CREDENTIAL_STUFFING: 'Revoke active JWT sessions & force password change.',
      ABNORMAL_BEHAVIOR: 'Flag transaction for manual supervisor review.',
      EXCESSIVE_DOWNLOADS: 'Suspend file download endpoint for user & deduct 30 Trust points.',
      MALWARE_INJECTION: 'Isolate IoT endpoint & revoke certificate authority token.',
      BOTNET_TRAFFIC: 'Enable IDRSN soft-thresholding filter & drop packet flow.',
    };

    const descMap: Record<AIThreatAlert['threatType'], string> = {
      BRUTE_FORCE: 'IDRSN Classifier: High-frequency authentication failures detected.',
      SQL_INJECTION: 'IDRSN Classifier: Dangerous SQL keywords and syntax detected in HTTP query.',
      DDOS_SIMULATION: 'IDRSN Classifier: High-volume SYN flood spike exceeding threshold.',
      CREDENTIAL_STUFFING: 'IDRSN Classifier: Automated login attempts using compromised patterns.',
      ABNORMAL_BEHAVIOR: 'IDRSN Classifier: Anomalous access pattern outside operating hours.',
      EXCESSIVE_DOWNLOADS: 'IDRSN Classifier: Bulk medical record retrieval exceeding rate limit.',
      MALWARE_INJECTION: 'IDRSN Classifier: Ransomware signature flow intercepted.',
      BOTNET_TRAFFIC: 'IDRSN Classifier: Botnet command & control network traffic detected.',
    };

    const alert: AIThreatAlert = {
      id: `alert-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      threatType: type,
      severity: severityMap[type] || 'MEDIUM',
      targetUser,
      targetHospital,
      ipAddress,
      description: customDescription || descMap[type],
      detectedAt: new Date().toISOString(),
      status: 'ACTIVE',
      recommendedAction: actionMap[type],
      datasetOrigin,
      idrsnConfidence: parseFloat((99.1 + Math.random() * 0.75).toFixed(2)),
      bstoaOptimized: true,
    };

    this.alerts.unshift(alert);

    // Log security threat alert transaction on Hyperledger Fabric / FileDAG
    fabricBlockchain.invokeChaincode(
      'AuditContract',
      'RecordSecurityAlert',
      { alertId: alert.id, threatType: type, severity: alert.severity, ipAddress, datasetOrigin },
      targetHospital
    );

    return alert;
  }

  public getActiveAlerts(): AIThreatAlert[] {
    return this.alerts;
  }

  public resolveAlert(alertId: string): boolean {
    const alert = this.alerts.find((a) => a.id === alertId);
    if (alert) {
      alert.status = 'MITIGATED';
      return true;
    }
    return false;
  }
}

export const threatDetector = new AIThreatDetector();
