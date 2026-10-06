# Northstar Operations — Shift Handoff & Service Continuity

## 1. Shift Schedule & Handoff Times
To ensure uninterrupted 24/7 service coverage, operations shifts follow a structured handoff protocol:
- **APAC to EMEA Handoff**: 08:00 UTC (16:00 SGT)
- **EMEA to Americas Handoff**: 14:00 UTC (10:00 EST)
- **Americas to APAC Handoff**: 22:00 UTC (06:00 SGT)

## 2. Mandatory Handoff Checklist
Before completing shift transfer, the outgoing coordinator must log the following fields in the shift board:
- **Active Tickets**: All open P1/P2/P3 tickets with current progress and blocker summary.
- **System Health**: Cloud service status, API error rates (must be `< 0.05%`), and database CPU utilization.
- **Ongoing Deployments**: Canary release version, deployment progress, and rollback decision deadlines.
- **Scheduled Maintenance**: Any planned infrastructure maintenance windows occurring during the upcoming shift.
- **Key Contacts**: Primary on-call engineer and escalation contacts on duty.

## 3. Maintenance Window Guidelines
- Standard routine maintenance windows are scheduled on **Tuesdays and Thursdays between 02:00 and 04:00 UTC**.
- Production changes require a written change-request ticket approved by the Operations Lead at least 24 hours prior.
