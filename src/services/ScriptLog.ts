import { Cron } from "croner";
import { getConfigEntriesByKey, upsertConfigEntry } from "@/repo/ConfigRepo.ts";
import { deleteScriptLogsOlderThan } from "@/repo/ScriptLogRepo.ts";
import { getDatabaseConnection } from "@/services/DatabaseDriver.ts";
import { ConfigValueTypes } from "@/types/ConfigType.ts";
import { devMode } from "@/devmode.ts";

import type { DBClient } from "@/services/DatabaseDriver.ts";
import type { ConfigEntrySelectType } from "@/types/ConfigType.ts";

export const config = {
    cfgScriptLogDeletionSchedule: {
        domain: "Script Log",
        key: "DeletionSchedule",
        description: "CRON expression that controls how often old script log entries are deleted. Leave empty or 'off' to disable automatic cleanup.",
        type: ConfigValueTypes.string,
        value: "0 * * * *",
        inputFormat: "",
        outputFormat: "",
        editInUI: true,
        mandatoryForStart: false,
        userProfile: false,
    },
    cfgScriptLogDeleteOlderThanHours: {
        domain: "Script Log",
        key: "DeleteOlderThanHours",
        description: "Delete script log entries older than this number of hours. Must be a positive integer.",
        type: ConfigValueTypes.number,
        value: 168,
        inputFormat: "^[1-9][0-9]*$",
        outputFormat: "",
        editInUI: true,
        mandatoryForStart: false,
        userProfile: false,
    },
} satisfies Record<string, ConfigEntrySelectType>;

export async function init(client?: DBClient): Promise<void> {
    const db = client ?? await getDatabaseConnection();

    for (const entry of Object.values(config)) {
        const existing = await getConfigEntriesByKey(db, entry.domain, entry.key, { limit: 1 });
        if (existing.length < 1) await upsertConfigEntry(db, entry);
    }

    const [scheduleRow] = await getConfigEntriesByKey(db, config.cfgScriptLogDeletionSchedule.domain, config.cfgScriptLogDeletionSchedule.key, { limit: 1 });
    const cronExpr = (scheduleRow?.value as string) ?? "0 * * * *";
    if (!cronExpr || cronExpr === "off") return;

    const [hoursRow] = await getConfigEntriesByKey(db, config.cfgScriptLogDeleteOlderThanHours.domain, config.cfgScriptLogDeleteOlderThanHours.key, { limit: 1 });
    const hours = Number(hoursRow?.value ?? 168);
    if (!Number.isInteger(hours) || hours < 1) return;

    const runCleanup = async () => {
        try {
            const deleted = await deleteScriptLogsOlderThan(db, hours);
            if (devMode && deleted > 0) console.log(`[script-log-cleanup] Deleted ${deleted} old script log entries`);
        } catch (e) {
            console.warn("[script-log-cleanup] Cleanup failed:", e);
        }
    };

    try {
        new Cron(cronExpr, () => { void runCleanup(); }, { name: "Script log cleanup" });
        if (devMode) console.log(`[script-log-cleanup] Scheduled with cron "${cronExpr}", retention ${hours}h`);
    } catch (e) {
        console.warn("[script-log-cleanup] Invalid CRON expression:", e);
    }
}
