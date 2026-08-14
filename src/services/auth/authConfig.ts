import {getConfigEntriesByKey, upsertConfigEntry} from "@/repo/ConfigRepo.ts";
import {type DBClient} from "@/services/DatabaseDriver.ts";
import {PubSub} from "@/services/PubSub.ts";
import {type ConfigEntryInsertType, type ConfigEntrySelectType, ConfigValueTypes} from "@/types/ConfigType.ts";
import { TAG_CONFIG, TAG_UPSERT } from "@/types/PubSubType";
import {getEntraIDClientId, getEntraIDClientSecret, getEntraIDTenantId} from "@/services/EntraIDSync.ts";

// ====================================================================================================================
// Config
// ====================================================================================================================

const DEFAULT_SESSION_TIMEOUT = 900;
const DEFAULT_API_KEY_LENGTH = 256;
const DEFAULT_API_KEY_VALIDITY_DAYS = 90;

export const config = {
    cfgRootUserGroup: { domain: "Authentication and Authorization", key: "RootUserGroup", description: "The object identifier of the user group whose members shall have superuser permissions. Superusers have the permission to grant permissions. They do not get any other permission, unless configured otherwise. Other user groups can be granted permissions if required. Thus, this group is meant to bootstrap the permission system.", type: ConfigValueTypes.string, value: undefined, formatRegex: "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$", inputFormat: "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$", outputFormat: "", editInUI: true, mandatoryForStart: true, userProfile: false},
    cfgSessionExpirationInSeconds: { domain: "Authentication and Authorization", key: "SessionExpirationSeconds", description: "The idle lifetime of an interactive session in seconds. Any user interaction resets this timer; once exceeded the user is logged out (default 900).", type: ConfigValueTypes.number, value: DEFAULT_SESSION_TIMEOUT, formatRegex: "^[1-9][0-9]*$", inputFormat: "^[1-9][0-9]*$", outputFormat: "", editInUI: true, mandatoryForStart: false, userProfile: false},
    cfgApiKeyLength: { domain: "Authentication and Authorization", key: "ApiKeyLength", description: "Length of newly generated API keys. Minimum 32, maximum 256. Default 256.", type: ConfigValueTypes.number, value: DEFAULT_API_KEY_LENGTH, formatRegex: "^(3[2-9]|[4-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-6])$", inputFormat: "^(3[2-9]|[4-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-6])$", outputFormat: "", editInUI: true, mandatoryForStart: false, userProfile: false},
    cfgApiKeyValidityDays: { domain: "Authentication and Authorization", key: "ApiKeyValidityDays", description: "Default API key validity in days. Minimum 1, maximum 730. Default 90.", type: ConfigValueTypes.number, value: DEFAULT_API_KEY_VALIDITY_DAYS, formatRegex: "^([1-9]|[1-9][0-9]|[1-6][0-9]{2}|7[0-2][0-9]|730)$", inputFormat: "^([1-9]|[1-9][0-9]|[1-6][0-9]{2}|7[0-2][0-9]|730)$", outputFormat: "", editInUI: true, mandatoryForStart: false, userProfile: false},
} satisfies Record<string, ConfigEntryInsertType>;

export async function getApiKeyLength(db: DBClient): Promise<number> {
    const resp = await getConfigEntriesByKey(db, config.cfgApiKeyLength.domain, config.cfgApiKeyLength.key, { limit: 1 });
    if (resp.length < 1) {
        await upsertConfigEntry(db, { ...config.cfgApiKeyLength, value: DEFAULT_API_KEY_LENGTH });
        return DEFAULT_API_KEY_LENGTH;
    }
    const candidate = Number(resp[0]?.value ?? DEFAULT_API_KEY_LENGTH);
    if (!Number.isFinite(candidate)) return DEFAULT_API_KEY_LENGTH;
    return Math.min(256, Math.max(32, Math.floor(candidate)));
}

export async function getApiKeyValidityDays(db: DBClient): Promise<number> {
    const resp = await getConfigEntriesByKey(db, config.cfgApiKeyValidityDays.domain, config.cfgApiKeyValidityDays.key, { limit: 1 });
    if (resp.length < 1) {
        await upsertConfigEntry(db, { ...config.cfgApiKeyValidityDays, value: DEFAULT_API_KEY_VALIDITY_DAYS });
        return DEFAULT_API_KEY_VALIDITY_DAYS;
    }
    const candidate = Number(resp[0]?.value ?? DEFAULT_API_KEY_VALIDITY_DAYS);
    if (!Number.isFinite(candidate)) return DEFAULT_API_KEY_VALIDITY_DAYS;
    return Math.min(730, Math.max(1, Math.floor(candidate)));
}
// ====================================================================================================================
// OIDC configuration (derived from the EntraID config entries)
// ====================================================================================================================

let oidcConfig: {
    issuer: URL;
    client_id: string;
    client_secret: string;
    redirect_uri: string;
} | undefined = undefined;

/**
 * Loads and returns the configuration object for OIDC (OpenID Connect) authentication.
 * Constructs the OIDC configuration only if it has not already been initialized.
 */
export async function loadOIDCConfig(db: DBClient) {
    if (!oidcConfig) {
        oidcConfig = {
            issuer: new URL(`https://login.microsoftonline.com/${await getEntraIDTenantId(db)}/v2.0`),
            client_id: await getEntraIDClientId(db),
            client_secret: await getEntraIDClientSecret(db),
            redirect_uri: "/login/oauth2/code/entraid",
        };
    }
    return oidcConfig;
}

// OIDC config is derived from the EntraID config entries; a runtime edit takes effect
// without restart via config-change invalidation.
PubSub.subscribe({ and: [TAG_CONFIG, "EntraID", TAG_UPSERT] }, () => {
    oidcConfig = undefined;
});
