# Northstar Operations — Incident Management Runbook

> Fictional sample for public demonstration; not real company data or policy.

## 1. Purpose & Incident Classifications
This runbook defines standard operating procedures for investigating, containing, and resolving service disruptions across Northstar platforms.

### Severity Definitions:
- **P1 (Critical Outage)**: Total service outage, critical data pipeline failure, or major customer impact.
  - Acknowledgment SLA: Within **10 minutes**.
  - Update Frequency: Post status update every **30 minutes**.
- **P2 (Degraded Performance)**: Partial feature degradation, high latency, or non-blocking error rate spikes.
  - Acknowledgment SLA: Within **30 minutes**.
  - Update Frequency: Status update every **60 minutes**.
- **P3 (Minor Issue)**: Non-urgent system glitch or low-impact internal tool anomaly.
  - Acknowledgment SLA: Within **4 business hours**.

## 2. On-Call Escalation Matrix
1. **Primary On-Call Engineer**: Initial responder; assesses alerts, verifies logs, and declares incident severity.
2. **Secondary Standby**: Coordinates cross-team debugging and incident communications.
3. **Operations Coordinator**: Manages status page communications and customer support alerts.
4. **Engineering Lead**: Escalation contact if mitigation exceeds 45 minutes without clear root cause.

## 3. Post-Incident Review (PIR)
- A blameless Post-Incident Review document must be published within **72 hours** of incident resolution.
- Corrective action items must be logged in the operations backlog with an assigned owner and target completion date.
