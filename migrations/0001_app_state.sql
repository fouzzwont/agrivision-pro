-- Key/value table backing the estate's mutable state.
--
-- Blocks and inspections are derived from the deterministic seed on every cold
-- start; this table only stores what an operator changes at runtime: alert
-- status and actions, field notes, settings, the audit trail, uploaded scan
-- results and the notification delivery log.
CREATE TABLE IF NOT EXISTS app_state (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
