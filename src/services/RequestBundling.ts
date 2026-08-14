import {getConfigEntriesByKey} from "@/repo/ConfigRepo.ts";
import PubSub from "@/services/PubSub.ts";
import {TAG_CONFIG, TAG_UPSERT} from "@/types/PubSubType.ts";
import {
    FALLBACK_CLIENT_DEFAULT_EXPECTED_PROCESSING_MS,
    FALLBACK_CLIENT_DEFAULT_TIMEOUT_MS,
    FALLBACK_CLIENT_MAX_AGE_MS,
    FALLBACK_CLIENT_MAX_BYTES,
    FALLBACK_CLIENT_MAX_REQUESTS,
    FALLBACK_DEFAULT_SERVER_TIMEOUT_MS,
    FALLBACK_MAX_SERVER_TIMEOUT_MS,
    FALLBACK_MIN_SERVER_TIMEOUT_MS,
    FALLBACK_SERVER_FLUSH_BYTES,
    FALLBACK_SERVER_FLUSH_COUNT,
    FALLBACK_SERVER_FLUSH_MS,
    type RequestBundlingClientRuntimeConfig,
    type RequestBundlingServerConfig
} from "@/types/RequestBundlingType.ts";
import {type ConfigEntryInsertType, type ConfigEntrySelectType, ConfigValueTypes} from "@/types/ConfigType.ts";

import type {DBClient} from "@/services/DatabaseDriver.ts";

const configDomain = "request_bundling";

export const config = {
    cfgServerFlushMs: { domain: configDomain, key: "Server.FlushMs", description: "How long the request bundling endpoint may buffer NDJSON frames before flushing (milliseconds).", type: ConfigValueTypes.number, value: undefined, formatRegex: "^[1-9][0-9]*$", inputFormat: "^[1-9][0-9]*$", outputFormat: "", editInUI: true, mandatoryForStart: false, userProfile: false },
    cfgServerFlushBytes: { domain: configDomain, key: "Server.FlushBytes", description: "Maximum buffered response bytes before the request bundling endpoint flushes the stream.", type: ConfigValueTypes.number, value: undefined, formatRegex: "^[1-9][0-9]*$", inputFormat: "^[1-9][0-9]*$", outputFormat: "", editInUI: true, mandatoryForStart: false, userProfile: false },
    cfgServerFlushCount: { domain: configDomain, key: "Server.FlushCount", description: "Maximum buffered response item count before the request bundling endpoint flushes the stream.", type: ConfigValueTypes.number, value: undefined, formatRegex: "^[1-9][0-9]*$", inputFormat: "^[1-9][0-9]*$", outputFormat: "", editInUI: true, mandatoryForStart: false, userProfile: false },
    cfgServerDefaultTimeoutMs: { domain: configDomain, key: "Server.DefaultTimeoutMs", description: "Fallback server timeout budget per bundled sub-request (milliseconds).", type: ConfigValueTypes.number, value: undefined, formatRegex: "^[1-9][0-9]*$", inputFormat: "^[1-9][0-9]*$", outputFormat: "", editInUI: true, mandatoryForStart: false, userProfile: false },
    cfgServerMinTimeoutMs: { domain: configDomain, key: "Server.MinTimeoutMs", description: "Minimum allowed server timeout for bundled sub-requests (milliseconds).", type: ConfigValueTypes.number, value: undefined, formatRegex: "^[1-9][0-9]*$", inputFormat: "^[1-9][0-9]*$", outputFormat: "", editInUI: true, mandatoryForStart: false, userProfile: false },
    cfgServerMaxTimeoutMs: { domain: configDomain, key: "Server.MaxTimeoutMs", description: "Maximum allowed server timeout for bundled sub-requests (milliseconds).", type: ConfigValueTypes.number, value: undefined, formatRegex: "^[1-9][0-9]*$", inputFormat: "^[1-9][0-9]*$", outputFormat: "", editInUI: true, mandatoryForStart: false, userProfile: false },
    cfgClientMaxAgeMs: { domain: configDomain, key: "Client.MaxAgeMs", description: "How long the browser may keep queued mutations before sending a request bundling batch (milliseconds).", type: ConfigValueTypes.number, value: undefined, formatRegex: "^[1-9][0-9]*$", inputFormat: "^[1-9][0-9]*$", outputFormat: "", editInUI: true, mandatoryForStart: false, userProfile: false },
    cfgClientMaxBytes: { domain: configDomain, key: "Client.MaxBytes", description: "Maximum estimated queued request bytes before the browser sends a request bundling batch.", type: ConfigValueTypes.number, value: undefined, formatRegex: "^[1-9][0-9]*$", inputFormat: "^[1-9][0-9]*$", outputFormat: "", editInUI: true, mandatoryForStart: false, userProfile: false },
    cfgClientMaxRequests: { domain: configDomain, key: "Client.MaxRequests", description: "Maximum number of queued mutations before the browser sends a request bundling batch.", type: ConfigValueTypes.number, value: undefined, formatRegex: "^[1-9][0-9]*$", inputFormat: "^[1-9][0-9]*$", outputFormat: "", editInUI: true, mandatoryForStart: false, userProfile: false },
    cfgClientDefaultExpectedProcessingMs: { domain: configDomain, key: "Client.DefaultExpectedProcessingMs", description: "Default client hint for expected server processing time of bundled sub-requests (milliseconds).", type: ConfigValueTypes.number, value: undefined, formatRegex: "^[1-9][0-9]*$", inputFormat: "^[1-9][0-9]*$", outputFormat: "", editInUI: true, mandatoryForStart: false, userProfile: false },
    cfgClientDefaultTimeoutMs: { domain: configDomain, key: "Client.DefaultTimeoutMs", description: "Default client timeout budget used for queued bundled sub-requests (milliseconds).", type: ConfigValueTypes.number, value: undefined, formatRegex: "^[1-9][0-9]*$", inputFormat: "^[1-9][0-9]*$", outputFormat: "", editInUI: true, mandatoryForStart: false, userProfile: false },
} satisfies Record<string, ConfigEntryInsertType>;

let cachedServerConfig: RequestBundlingServerConfig | undefined;
let cachedClientConfig: RequestBundlingClientRuntimeConfig | undefined;

// A runtime edit of any request_bundling config entry takes effect without restart:
// the cached configs are dropped on the config-change event.
PubSub.subscribe({ and: [TAG_CONFIG, configDomain, TAG_UPSERT] }, () => {
    cachedServerConfig = undefined;
    cachedClientConfig = undefined;
});

function toPositiveInteger(value: unknown, fallback: number): number {
    if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
    const rounded = Math.round(value);
    return rounded > 0 ? rounded : fallback;
}

async function readConfigNumber(db: DBClient, entry: Pick<ConfigEntrySelectType, "domain" | "key">, fallback: number): Promise<number> {
    const result = await getConfigEntriesByKey(db, entry.domain, entry.key);
    return toPositiveInteger(result[0]?.value, fallback);
}

export async function getRequestBundlingServerConfig(db: DBClient): Promise<RequestBundlingServerConfig> {
    if (!cachedServerConfig) {
        const flushMs = await readConfigNumber(db, config.cfgServerFlushMs, FALLBACK_SERVER_FLUSH_MS);
        const flushBytes = await readConfigNumber(db, config.cfgServerFlushBytes, FALLBACK_SERVER_FLUSH_BYTES);
        const flushCount = await readConfigNumber(db, config.cfgServerFlushCount, FALLBACK_SERVER_FLUSH_COUNT);
        const defaultServerTimeoutMs = await readConfigNumber(db, config.cfgServerDefaultTimeoutMs, FALLBACK_DEFAULT_SERVER_TIMEOUT_MS);
        const minServerTimeoutMs = await readConfigNumber(db, config.cfgServerMinTimeoutMs, FALLBACK_MIN_SERVER_TIMEOUT_MS);
        const maxServerTimeoutMs = await readConfigNumber(db, config.cfgServerMaxTimeoutMs, FALLBACK_MAX_SERVER_TIMEOUT_MS);

        cachedServerConfig = {
            flushMs,
            flushBytes,
            flushCount,
            defaultServerTimeoutMs,
            minServerTimeoutMs: Math.min(minServerTimeoutMs, maxServerTimeoutMs),
            maxServerTimeoutMs: Math.max(maxServerTimeoutMs, minServerTimeoutMs),
        };
    }

    return cachedServerConfig;
}

export async function getRequestBundlingClientRuntimeConfig(db: DBClient): Promise<RequestBundlingClientRuntimeConfig> {
    if (!cachedClientConfig) {
        cachedClientConfig = {
            maxAgeMs: await readConfigNumber(db, config.cfgClientMaxAgeMs, FALLBACK_CLIENT_MAX_AGE_MS),
            maxBytes: await readConfigNumber(db, config.cfgClientMaxBytes, FALLBACK_CLIENT_MAX_BYTES),
            maxRequests: await readConfigNumber(db, config.cfgClientMaxRequests, FALLBACK_CLIENT_MAX_REQUESTS),
            defaultExpectedProcessingMs: await readConfigNumber(db, config.cfgClientDefaultExpectedProcessingMs, FALLBACK_CLIENT_DEFAULT_EXPECTED_PROCESSING_MS),
            defaultTimeoutMs: await readConfigNumber(db, config.cfgClientDefaultTimeoutMs, FALLBACK_CLIENT_DEFAULT_TIMEOUT_MS),
        };
    }

    return cachedClientConfig;
}
