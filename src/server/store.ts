import type {
  ActionLog,
  Alert,
  Block,
  Detection,
  FieldNote,
  Inspection,
  NotificationDelivery,
  Settings,
} from "@/lib/types";
import {
  SEED_ACTION_LOG,
  SEED_ALERTS,
  SEED_BLOCKS,
  SEED_FIELD_NOTES,
  SEED_INSPECTIONS,
  SEED_SETTINGS,
  seedDetections,
} from "./seed";

/**
 * Persistence layer.
 *
 * The estate state lives in memory for the lifetime of the isolate. When a
 * Cloudflare D1 binding named `DB` is reachable, mutable state is additionally
 * written through to an `app_state` key/value table so alerts, notes, scans
 * and settings survive a cold start. Without the binding the app still runs
 * fully, it just resets on deploy.
 */

export type D1Like = {
  prepare: (sql: string) => {
    bind: (...values: unknown[]) => {
      first: <T>() => Promise<T | null>;
      run: () => Promise<unknown>;
    };
  };
};

const PERSISTED_KEYS = ["alerts", "notes", "settings", "deliveries", "actionLog", "scans"] as const;

type PersistedKey = (typeof PERSISTED_KEYS)[number];

type MutableState = {
  alerts: Alert[];
  notes: FieldNote[];
  settings: Settings;
  deliveries: NotificationDelivery[];
  actionLog: ActionLog[];
  scans: Detection[];
};

export class AgriStore {
  private blocks: Block[] = SEED_BLOCKS;
  private inspections: Inspection[] = SEED_INSPECTIONS;
  private detections: Detection[] = seedDetections(SEED_INSPECTIONS);
  private state: MutableState = {
    alerts: SEED_ALERTS.map((a) => ({ ...a })),
    notes: SEED_FIELD_NOTES.map((n) => ({ ...n })),
    settings: structuredClone(SEED_SETTINGS),
    deliveries: [],
    actionLog: SEED_ACTION_LOG.map((a) => ({ ...a })),
    scans: [],
  };

  private db: D1Like | undefined;
  private ready: Promise<void> | undefined;

  /** Binds a D1 database for write-through persistence. */
  attachDatabase(db: D1Like | undefined) {
    this.db = db;
    this.ready = undefined;
  }

  async init(): Promise<void> {
    if (this.ready) return this.ready;
    this.ready = (async () => {
      if (!this.db) return;
      for (const key of PERSISTED_KEYS) {
        const row = await this.db
          .prepare("SELECT value FROM app_state WHERE key = ?")
          .bind(key)
          .first<{ value: string }>();
        if (!row?.value) continue;
        try {
          const parsed = JSON.parse(row.value);
          if (key === "alerts" && Array.isArray(parsed)) {
            // Merge persisted status/action onto the freshly seeded alerts so
            // new seed rows still appear but operator decisions survive.
            const byId = new Map<string, Alert>((parsed as Alert[]).map((a) => [a.id, a]));
            this.state.alerts = this.state.alerts.map((alert) => {
              const saved = byId.get(alert.id);
              return saved
                ? {
                    ...alert,
                    status: saved.status,
                    action: saved.action,
                    actionedAt: saved.actionedAt,
                  }
                : alert;
            });
          } else if (key === "notes" && Array.isArray(parsed)) {
            this.state.notes = parsed as FieldNote[];
          } else if (key === "settings" && parsed) {
            this.state.settings = { ...this.state.settings, ...(parsed as Settings) };
          } else if (key === "deliveries" && Array.isArray(parsed)) {
            this.state.deliveries = parsed as NotificationDelivery[];
          } else if (key === "actionLog" && Array.isArray(parsed)) {
            this.state.actionLog = parsed as ActionLog[];
          } else if (key === "scans" && Array.isArray(parsed)) {
            this.state.scans = parsed as Detection[];
          }
        } catch {
          // Corrupt payload — fall back to the seed value.
        }
      }
    })();
    return this.ready;
  }

  private async persist(key: PersistedKey) {
    if (!this.db) return;
    try {
      await this.db
        .prepare(
          "INSERT INTO app_state (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        )
        .bind(key, JSON.stringify(this.state[key]), new Date().toISOString())
        .run();
    } catch (error) {
      console.error("[store] failed to persist", key, error);
    }
  }

  private log(kind: ActionLog["kind"], summary: string, blockId?: string, actor?: string) {
    this.state.actionLog.unshift({
      id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      at: new Date().toISOString(),
      actor: actor ?? this.state.settings.profile.fullName,
      kind,
      summary,
      blockId,
    });
    this.state.actionLog = this.state.actionLog.slice(0, 200);
    void this.persist("actionLog");
  }

  async listBlocks(): Promise<Block[]> {
    await this.init();
    return this.blocks.map((b) => ({ ...b }));
  }

  async getBlock(id: string): Promise<Block | undefined> {
    await this.init();
    const block = this.blocks.find((b) => b.id === id);
    return block ? { ...block } : undefined;
  }

  async listInspections(): Promise<Inspection[]> {
    await this.init();
    return this.inspections.map((i) => ({ ...i }));
  }

  async listDetections(): Promise<Detection[]> {
    await this.init();
    return [...this.state.scans, ...this.detections].map((d) => ({ ...d }));
  }

  async listAlerts(): Promise<Alert[]> {
    await this.init();
    return this.state.alerts.map((a) => ({ ...a }));
  }

  async listFieldNotes(): Promise<FieldNote[]> {
    await this.init();
    return this.state.notes.map((n) => ({ ...n }));
  }

  async listActionLog(): Promise<ActionLog[]> {
    await this.init();
    return this.state.actionLog.map((a) => ({ ...a }));
  }

  async listDeliveries(): Promise<NotificationDelivery[]> {
    await this.init();
    return this.state.deliveries.map((d) => ({ ...d }));
  }

  async getSettings(): Promise<Settings> {
    await this.init();
    return structuredClone(this.state.settings);
  }

  async saveSettings(patch: Partial<Settings>): Promise<Settings> {
    await this.init();
    this.state.settings = {
      ...this.state.settings,
      ...patch,
      profile: { ...this.state.settings.profile, ...(patch.profile ?? {}) },
      farm: { ...this.state.settings.farm, ...(patch.farm ?? {}) },
      modules: { ...this.state.settings.modules, ...(patch.modules ?? {}) },
      notifications: {
        ...this.state.settings.notifications,
        ...(patch.notifications ?? {}),
      },
      preferences: { ...this.state.settings.preferences, ...(patch.preferences ?? {}) },
    };
    await this.persist("settings");
    this.log("settings", "Updated estate settings");
    return this.getSettings();
  }

  async dismissAlert(id: string): Promise<Alert | undefined> {
    await this.init();
    const alert = this.state.alerts.find((a) => a.id === id);
    if (!alert) return undefined;
    alert.status = "dismissed";
    alert.actionedAt = new Date().toISOString();
    await this.persist("alerts");
    this.log("alert-dismiss", `Dismissed alert: ${alert.title}`, alert.blockId);
    return { ...alert };
  }

  async takeAlertAction(id: string, action: string): Promise<Alert | undefined> {
    await this.init();
    const alert = this.state.alerts.find((a) => a.id === id);
    if (!alert) return undefined;
    alert.status = "actioned";
    alert.action = action;
    alert.actionedAt = new Date().toISOString();
    await this.persist("alerts");
    this.log("alert-action", `${action} — ${alert.title}`, alert.blockId);
    return { ...alert };
  }

  async addFieldNote(note: Omit<FieldNote, "id" | "date">): Promise<FieldNote> {
    await this.init();
    const created: FieldNote = {
      ...note,
      id: `note-${Date.now()}`,
      date: new Date().toISOString().slice(0, 10),
    };
    this.state.notes.unshift(created);
    await this.persist("notes");
    this.log("field-note", created.note.slice(0, 80), created.blockId);
    return created;
  }

  async addScan(detection: Detection): Promise<Detection> {
    await this.init();
    this.state.scans.unshift(detection);
    await this.persist("scans");
    this.log(
      "scan",
      `Scanned ${detection.fileName ?? "image"} — ${detection.disease}`,
      detection.blockId,
    );
    return detection;
  }

  async recordDelivery(delivery: NotificationDelivery): Promise<void> {
    await this.init();
    this.state.deliveries.unshift(delivery);
    this.state.deliveries = this.state.deliveries.slice(0, 100);
    await this.persist("deliveries");
  }
}

let store: AgriStore | undefined;

/** Returns the process-wide store instance. */
export function getStore(): AgriStore {
  if (!store) store = new AgriStore();
  return store;
}
