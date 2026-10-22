import { createServerFn } from "@tanstack/react-start";
import type { NotificationChannel, Settings, Severity } from "@/lib/types";

const CHANNELS: NotificationChannel[] = ["email", "sms", "in-app"];
const SEVERITIES: Severity[] = ["Low", "Medium", "High", "Critical"];
const LANGUAGES = ["en", "fr", "ar", "es"];

/** Current estate + notification configuration. */
export const getSettings = createServerFn({ method: "GET" }).handler(
  async (): Promise<Settings> => {
    const { getStore } = await import("@/server/store");
    return getStore().getSettings();
  },
);

/**
 * Persists a settings patch. The patch is validated server side so a malformed
 * request can never corrupt the stored configuration.
 */
export const saveSettings = createServerFn({ method: "POST" })
  .inputValidator((data: SettingsPatch) => {
    if (!data || typeof data !== "object") {
      throw new Error("A settings patch is required");
    }

    if (data.profile) {
      if (data.profile.fullName !== undefined && typeof data.profile.fullName !== "string") {
        throw new Error("profile.fullName must be a string");
      }
      if (
        data.profile.email !== undefined &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.profile.email)
      ) {
        throw new Error("profile.email must be a valid email address");
      }
    }

    if (data.notifications) {
      if (
        data.notifications.threshold !== undefined &&
        !SEVERITIES.includes(data.notifications.threshold)
      ) {
        throw new Error("notifications.threshold is not a valid severity");
      }
      if (data.notifications.channels !== undefined) {
        if (!Array.isArray(data.notifications.channels)) {
          throw new Error("notifications.channels must be an array");
        }
        for (const channel of data.notifications.channels) {
          if (!CHANNELS.includes(channel)) {
            throw new Error(`Unknown notification channel: ${channel}`);
          }
        }
      }
    }

    if (
      data.preferences?.language !== undefined &&
      !LANGUAGES.includes(data.preferences.language)
    ) {
      throw new Error("preferences.language is not supported");
    }

    return data;
  })
  .handler(async ({ data }): Promise<Settings> => {
    const { getStore } = await import("@/server/store");
    return getStore().saveSettings(data);
  });

export type SettingsPatch = {
  profile?: Partial<Settings["profile"]>;
  farm?: Partial<Settings["farm"]>;
  modules?: Partial<Settings["modules"]>;
  notifications?: Partial<Settings["notifications"]>;
  preferences?: Partial<Settings["preferences"]>;
};
