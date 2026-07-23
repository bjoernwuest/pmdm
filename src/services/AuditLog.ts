import PubSub from "@/services/PubSub.ts";
import {type DBClient, getDatabaseConnection} from "@/services/DatabaseDriver.ts";
import { insertAuditEntries } from "@/repo/AuditRepo.ts";
import { devMode } from "@/devmode.ts";
import { getConfigEntriesByKey, upsertConfigEntry } from "@/repo/ConfigRepo.ts";
import {type ConfigEntrySelectType, ConfigValueTypes} from "@/types/ConfigType.ts";
import type {AuditEntrySchemaInsertType} from "@/types/AuditEntryType.ts";
import { TAG_CREATE, TAG_UPDATE, TAG_DELETE, TAG_GRANT, TAG_REVOKE, TAG_DISABLE, TAG_ENABLED, type TagExpression } from "../types/PubSubType";

const configDomain = "audit_log";

// ── ConfigEntry declarations ────────────────────────────────────────────────────
export const config = {
    cfgFlushIntervalMs: {
        domain: configDomain,
        key: "FlushIntervalMs",
        description: "Maximum age of a batched audit-log entry before it is written to the database (milliseconds).",
        type: ConfigValueTypes.number,
        value: 60000,
        inputFormat: "^[1-9][0-9]*$",
        outputFormat: "",
        editInUI: true,
        mandatoryForStart: false,
        userProfile: false,
    } satisfies ConfigEntrySelectType,
    cfgFlushMaxBatchSize: {
        domain: configDomain,
        key: "FlushMaxBatchSize",
        description: "Maximum number of buffered audit-log entries before an immediate flush is triggered.",
        type: ConfigValueTypes.number,
        value: 500,
        inputFormat: "^[1-9][0-9]*$",
        outputFormat: "",
        editInUI: true,
        mandatoryForStart: false,
        userProfile: false,
    } satisfies ConfigEntrySelectType,
} satisfies Record<string, ConfigEntrySelectType>;

let batch: AuditEntrySchemaInsertType[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Reads the two runtime parameters from the database (with fallbacks).
 * Called once at startup and whenever the flush timer is re-armed.
 */
async function readRuntimeConfig(db: DBClient): Promise<{ flushIntervalMs: number; flushMaxBatchSize: number }> {
    const [intervalRow] = await getConfigEntriesByKey(db, config.cfgFlushIntervalMs.domain, config.cfgFlushIntervalMs.key, { limit: 1 });
    const [batchSizeRow] = await getConfigEntriesByKey(db, config.cfgFlushMaxBatchSize.domain, config.cfgFlushMaxBatchSize.key, { limit: 1 });

    const toPositiveInt = (value: unknown, fallback: number): number => {
        const num = Number(value);
        return Number.isFinite(num) && num > 0 ? Math.round(num) : fallback;
    };

    return {
        flushIntervalMs: toPositiveInt(intervalRow?.value, 60000),
        flushMaxBatchSize: toPositiveInt(batchSizeRow?.value, 500),
    };
}

async function flushBatch(): Promise<void> {
    if (batch.length === 0) return;

    const toFlush = batch;
    batch = [];
    try {
        const db = getDatabaseConnection();
        await insertAuditEntries(db, toFlush);
        if (devMode) console.log(`[audit-log] Flushed ${toFlush.length} entries to database`);
    } catch (err) {
        console.error("[audit-log] Failed to flush audit entries:", err);
        // Re-queue on failure (prepend to preserve order as best we can)
        batch = [...toFlush, ...batch];
    }
}

let currentMaxBatchSize = 500;

/**
 * Handles a PubSub event. Logs it if the tags contain one of the audit action tags.
 * Also triggers an immediate flush when the batch exceeds the configured max size.
 */
function onPubSubEvent(msg: import("../types/PubSubType").PubSubMessage): void {
    batch.push({
        topic: msg.tags.join(","),
        payload: msg.data ?? {},
    });

    // Flush immediately if the batch exceeds the configured threshold
    if (batch.length >= currentMaxBatchSize) {
        void flushBatch();
    }
}

let subscriberToken: string | false = false;

/**
 * Starts the audit log subscriber and the periodic flush timer.
 */
export async function startAuditLog(db: DBClient): Promise<void> {
    if (subscriberToken) return; // Already started

    // Ensure the config rows exist (seed with defaults on first run)
    for (const entry of Object.values(config)) {
        const existing = await getConfigEntriesByKey(db, entry.domain, entry.key, { limit: 1 });
        if (existing.length < 1) await upsertConfigEntry(db, entry);
    }

    const { flushIntervalMs, flushMaxBatchSize } = await readRuntimeConfig(db);
    currentMaxBatchSize = flushMaxBatchSize;

    const auditExpression: TagExpression = { or: [TAG_CREATE, TAG_UPDATE, TAG_DELETE, TAG_GRANT, TAG_REVOKE, TAG_DISABLE, TAG_ENABLED] };
    subscriberToken = PubSub.subscribe(auditExpression, onPubSubEvent);
    flushTimer = setInterval(flushBatch, flushIntervalMs);

    if (devMode) console.log("[audit-log] Subscriber started (tags: create, update, delete, grant, revoke, disable, enabled, interval:", flushIntervalMs, "ms, maxBatch:", flushMaxBatchSize, ")");
}

/**
 * Stops the audit log subscriber and flushes any remaining entries.
 */
export async function stopAuditLog(): Promise<void> {
    if (subscriberToken) {
        PubSub.unsubscribe(subscriberToken);
        subscriberToken = false;
    }
    if (flushTimer) {
        clearInterval(flushTimer);
        flushTimer = null;
    }
    await flushBatch();
    if (devMode) console.log("[audit-log] Subscriber stopped, final flush complete");
}
