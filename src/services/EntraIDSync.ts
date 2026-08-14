import { getConfigEntriesByKey, upsertConfigEntry } from "@/repo/ConfigRepo.ts";
import { Value } from "@sinclair/typebox/value";
import { IdentifierSchema, type IdentifierType } from "@/types/helpers.ts";
import { ConfidentialClientApplication } from "@azure/msal-node";
import { Client, BatchResponseContent } from "@microsoft/microsoft-graph-client";
import type { User as MSGraphUser, Group as MSGraphGroup } from "@microsoft/microsoft-graph-types";
import { devMode } from "@/devmode.ts";
import {type DBClient, runInTransaction} from "./DatabaseDriver.ts";
import { Cron } from "croner";
import { countUsersAndGroups, deleteObsoleteUserGroupAssignments, disableGroups, disableUsers, getGroups, getUsers, setGroupMemberships, setUserMemberships, upsertGroups, upsertUsers, SYSTEM_USER_IDENTIFIER } from "@/repo/UserRepo.ts";
import PubSub from "./PubSub.ts";
import { TAG_AUTH_SESSION, TAG_LOGIN } from "../types/PubSubType";
import {type ConfigEntrySelectType, ConfigValueTypes, type ConfigEntryInsertType} from "@/types/ConfigType.ts";
import type {GroupInsertType, UserInsertType} from "@/types/UserType.ts";

// Config keys (single source of truth)
const configDomain = "EntraID";
export const config = {
  cfgClientId: { domain: configDomain, key: `ClientID`, description: "The Client ID of the Azure AD App Registration used for Entra ID synchronization.", type: ConfigValueTypes.string, value: undefined, formatRegex: "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$", inputFormat: "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$", outputFormat: "", editInUI: true, mandatoryForStart: true, userProfile: false },
  cfgClientSecret: { domain: configDomain, key: `ClientSecret`, description: "The Client Secret of the Azure AD App Registration used for Entra ID synchronization.", type: ConfigValueTypes.string, value: undefined, formatRegex: "^[A-Za-z0-9\\-_.~]{34,40}$", inputFormat: "^[A-Za-z0-9\\-_.~]{34,40}$", outputFormat: "", editInUI: true, mandatoryForStart: true, userProfile: false },
  cfgTenantId: { domain: configDomain, key: `TenantID`, description: "The Tenant ID of the Azure AD App Registration used for Entra ID synchronization.", type: ConfigValueTypes.string, value: undefined, formatRegex: "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$", inputFormat: "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$", outputFormat: "", editInUI: true, mandatoryForStart: true, userProfile: false },
  cfgSyncInterval: { domain: configDomain, key: `SyncInterval`, description: "The interval between synchronizations with EntraID, given in CRON notion. Set to 'off' to disable scheduled synchronization.", type: ConfigValueTypes.string, value: undefined, formatRegex: "^((?i)@(yearly|annually|monthly|weekly|daily|midnight|hourly)|^\\s*([^ ]+\\s+){4,6}[^ ]+\\s*|^(?i)off)$", inputFormat: "^((?i)@(yearly|annually|monthly|weekly|daily|midnight|hourly)|^\\s*([^ ]+\\s+){4,6}[^ ]+\\s*|^(?i)off)$", outputFormat: "", editInUI: true, mandatoryForStart: true, userProfile: false },
  cfgEnableUserSync: { domain: configDomain, key: `EnableUserSync`, description: "Enable periodic user synchronization and on-login user/group membership sync from EntraID. Disable if you only need group data.", type: ConfigValueTypes.boolean, value: false, formatRegex: "", inputFormat: "", outputFormat: "", editInUI: true, mandatoryForStart: false, userProfile: false },
  cfgSyncDeltalinkGroups: { domain: configDomain, key: `Delta.Groups`, description: "The group IDs to synchronize delta changes for. Leave empty to synchronize all groups.", type: ConfigValueTypes.string, value: undefined, formatRegex: "", inputFormat: "", outputFormat: "", editInUI: false, mandatoryForStart: false, userProfile: false },
  cfgSyncDeltalinkUsers: { domain: configDomain, key: `Delta.Users`, description: "The user IDs to synchronize delta changes for. Leave empty to synchronize all users.", type: ConfigValueTypes.string, value: undefined, formatRegex: "", inputFormat: "", outputFormat: "", editInUI: false, mandatoryForStart: false, userProfile: false },
} satisfies Record<string, ConfigEntryInsertType>;

/**
 * Retrieves the Entra ID Client ID from the configuration entries stored in the database.
 *
 * @param db The database client instance used to access the configuration entries.
 * @return A promise that resolves to the Entra ID Client ID as a string.
 */
export async function getEntraIDClientId(db: DBClient): Promise<string> { return (await getConfigEntriesByKey(db, config.cfgClientId.domain, config.cfgClientId.key) satisfies ConfigEntrySelectType[])[0]!.value as string; }

/**
 * Retrieves the client secret for Entra ID from the database configuration entries.
 *
 * @param db The DBClient instance used to interact with the database.
 * @return A promise that resolves to the client secret as a string.
 */
export async function getEntraIDClientSecret(db: DBClient): Promise<string> { return (await getConfigEntriesByKey(db, config.cfgClientSecret.domain, config.cfgClientSecret.key) satisfies ConfigEntrySelectType[])[0]!.value as string; }

/** 
 * Retrieves the Entra ID Tenant ID from the configuration database.
 *
 * @param {DBClient} db - The database client instance used to query the configuration.
 * @return {Promise<string>} A promise that resolves to the Entra ID Tenant ID as a string.
 */
export async function getEntraIDTenantId(db: DBClient): Promise<string> { return (await getConfigEntriesByKey(db, config.cfgTenantId.domain, config.cfgTenantId.key) satisfies ConfigEntrySelectType[])[0]!.value as string; }

/**
 * Initializes and returns a Microsoft Graph Client with an authentication provider.
 * The authentication provider uses client credentials to acquire an access token.
 *
 * @param {DBClient} db - The database object used to retrieve configuration values,
 *                             such as client ID, client secret, and tenant ID for authentication.
 * @returns {Client} The initialized Microsoft Graph Client instance.
 */
export function getGraphClient(db: DBClient): Client {
  return Client.initWithMiddleware({
    authProvider: {
      getAccessToken: async () => {
        const tokenResponse = await new ConfidentialClientApplication({
          auth: {
            clientId: await getEntraIDClientId(db),
            clientSecret: await getEntraIDClientSecret(db),
            authority: `https://login.microsoftonline.com/${await getEntraIDTenantId(db)}`,
          },
        }).acquireTokenByClientCredential({ scopes: ["https://graph.microsoft.com/.default"] });
        return tokenResponse?.accessToken || "";
      },
    },
  });
}

type DeltaUser = MSGraphUser & { "@removed"?: { reason: string }; id: string };
type DeltaGroup = MSGraphGroup & { "@removed"?: { reason: string }; id: string };
type UserDeltaResult = { newOrUpdated: DeltaUser[]; deletedIds: IdentifierType[]; didFullLoad: boolean; deltaLink?: string };
type GroupDeltaResult = { newOrUpdated: DeltaGroup[]; deletedIds: IdentifierType[]; didFullLoad: boolean; deltaLink?: string };

/**
 * Fetches user data incrementally from Microsoft Graph using delta links. This performs
 * only Graph API calls and configuration reads — no database mutations — so it must be
 * called outside of any database transaction.
 *
 * @param {Client} MSGraphQLClient - The Microsoft Graph API client used to fetch user data.
 * @param {DBClient} DBClient - The database client used to read the stored delta link.
 * @return {Promise<UserDeltaResult>} The fetched users, deleted user ids, and the fresh delta link.
 */
async function fetchUserDelta(MSGraphQLClient: Client, DBClient: DBClient): Promise<UserDeltaResult> {
    type DeltaUserResponse = { value?: DeltaUser[]; "@odata.nextLink"?: string; "@odata.deltaLink"?: string };

    const deltaCfg = (await getConfigEntriesByKey(DBClient, config.cfgSyncDeltalinkUsers.domain, config.cfgSyncDeltalinkUsers.key))[0];
    let didFullLoad = deltaCfg == null || deltaCfg.value == null;
    let nextLink: string | undefined = (deltaCfg && deltaCfg.value ? String(deltaCfg.value) : null) ?? '/users/delta?$select=id,mail,userPrincipalName,givenName,surname,accountEnabled';

    const newOrUpdated: Set<DeltaUser> = new Set();
    const deletedIds: Set<IdentifierType> = new Set();
    let deltaLink: string | undefined;

    let res: DeltaUserResponse | undefined;
    do {
        try {
            res = (await MSGraphQLClient.api(nextLink!).header('Accept', 'application/json;odata.metadata=minimal').get()) as DeltaUserResponse;
            for (const entry of res.value ?? []) {
                if (entry["@removed"] && Value.Check(IdentifierSchema, { identifier: entry.id })) deletedIds.add({identifier: entry.id} satisfies IdentifierType);
                else newOrUpdated.add(entry as DeltaUser);
            }
            nextLink = res["@odata.nextLink"];
        } catch (mqlError: any) {
            if (mqlError.statusCode === 410 && mqlError.code === "SyncStateNotFound") {
                nextLink = '/users/delta?$select=id,mail,userPrincipalName,givenName,surname,accountEnabled';
                didFullLoad = true;
            } else throw mqlError;
        }
    } while (nextLink);

    if (res?.['@odata.deltaLink']) deltaLink = res['@odata.deltaLink'];

    return { newOrUpdated: Array.from(newOrUpdated), deletedIds: Array.from(deletedIds), didFullLoad, deltaLink };
}

/**
 * Applies a fetched user delta to the database: disables gone users (or all users on a full
 * load), upserts the new/updated users, cleans up obsolete user-group assignments and stores
 * the fresh delta link. Expected to run inside a transaction.
 *
 * @param {DBClient} DBClient - The database client used for the mutations.
 * @param {UserDeltaResult} delta - The delta result produced by {@link fetchUserDelta}.
 * @return {Promise<IdentifierType[]>} The identifiers of the upserted users.
 */
async function applyUserDelta(DBClient: DBClient, delta: UserDeltaResult): Promise<IdentifierType[]> {
    // Disable gone users (or all, if we can not determine which ones are gone)
    if (delta.didFullLoad) await disableUsers(DBClient); else if (0 < delta.deletedIds.length) await disableUsers(DBClient, delta.deletedIds);

    // Upsert all users from newOrUpdated; this may set disabled to false if the user account was re-enabled in EntraID
    await upsertUsers(DBClient, delta.newOrUpdated.map(u => ({ identifier: u.id, firstName: u.givenName ?? '', lastName: u.surname ?? '', email: u.mail || u.userPrincipalName || '', disabled: (u.accountEnabled === false) } satisfies UserInsertType)));

    // cleanup obsolete user/group assignments
    await deleteObsoleteUserGroupAssignments(DBClient);

    // store the fresh delta link if one was captured
    if (delta.deltaLink) await upsertConfigEntry(DBClient, { ...config.cfgSyncDeltalinkUsers, value: delta.deltaLink } as ConfigEntryInsertType);

    return delta.newOrUpdated.map(u => ({identifier: u.id} satisfies IdentifierType));
}

/**
 * Strips scheme, host and API version from an absolute Graph URL so it can be used as a
 * relative batch-item URL. Graph's $batch endpoint rejects URLs that still contain the
 * version segment (e.g. "/v1.0/groups/...").
 */
function toGraphRelativeUrl(url: string): string {
    return url.replace(/^https?:\/\/[^/]+\/(?:v1\.0|beta)/, "");
}

/**
 * Fetches membership relationships for users or groups from the Microsoft Graph API using
 * batched requests. This performs only Graph API calls — no database access — so it must be
 * called outside of any database transaction.
 *
 * Identifiers whose fetch failed are reported in `failedKeys` so callers can skip applying
 * them instead of overwriting existing memberships with empty data.
 *
 * @param {Client} MSGraphQLClient - The client used to interact with Microsoft Graph API.
 * @param {IdentifierType[]} Id_s - An array of identifiers representing the users or groups to fetch memberships for.
 * @param {boolean} [users=false] - A flag indicating whether to fetch user memberships (if true) or group memberships (if false).
 * @return {Promise<{memberIdsByKey: Map<string, string[]>, failedKeys: string[]}>} The fetched member identifiers per key and the keys whose fetch failed.
 */
export async function fetchMemberships(MSGraphQLClient: Client, Id_s: IdentifierType[], users: boolean = false): Promise<{ memberIdsByKey: Map<string, string[]>, failedKeys: string[] }> {
    const Ids = Id_s.filter(i => i.identifier !== SYSTEM_USER_IDENTIFIER);
    type MemberPageResponse = { value?: { id: string; "@odata.type"?: string }[]; "@odata.nextLink"?: string };

    // Microsoft Graph $batch supports at most 20 requests per batch.
    const GRAPH_BATCH_LIMIT = 20;
    const memberIdsByKey = new Map<string, string[]>();
    const failedKeys = new Set<string>();
    const pending: { key: string; url: string }[] = Ids.map(id => ({
        key: id.identifier,
        url: users ? `/users/${id.identifier}/memberOf?$select=id` : `/groups/${id.identifier}/members?$select=id`,
    }));

    while (pending.length > 0) {
        const chunk = pending.splice(0, GRAPH_BATCH_LIMIT);
        const batchBody = { requests: chunk.map(({ key, url }) => ({ id: key, method: "GET", url, headers: { Accept: "application/json;odata.metadata=minimal" } })) };

        try {
            const batchResponse = await MSGraphQLClient.api("/$batch").post(batchBody);
            const responses = new BatchResponseContent(batchResponse);

            for (const { key } of chunk) {
                try {
                    const item = await responses.getResponseById(key);
                    if (!item.ok) {
                        failedKeys.add(key);
                        if (devMode) console.warn(`Failed to retrieve user/group memberships for ${key} from batch. Status: ${item.status}`);
                        continue;
                    }
                    const body = await item.json() as MemberPageResponse;
                    const memberIds = memberIdsByKey.get(key) ?? [];
                    for (const v of body.value ?? []) {
                        if (v["@odata.type"] === (users ? "#microsoft.graph.group" : "#microsoft.graph.user")) memberIds.push(v.id);
                    }
                    memberIdsByKey.set(key, memberIds);
                    if (body["@odata.nextLink"]) pending.push({ key, url: toGraphRelativeUrl(body["@odata.nextLink"]) });
                } catch (_e) {
                    failedKeys.add(key);
                    if (devMode) console.warn(`Failed to retrieve user/group memberships for ${key} from batch. Error:`, _e);
                }
            }
        } catch (_e) {
            // A batch-level failure marks every identifier in the chunk as failed so the
            // apply phase skips them instead of overwriting existing memberships.
            for (const { key } of chunk) failedKeys.add(key);
            if (devMode) console.warn(`Failed to retrieve user/group memberships batch. Error:`, _e);
        }
    }

    return { memberIdsByKey, failedKeys: Array.from(failedKeys) };
}

/**
 * Applies previously fetched membership data by replacing the user or group memberships in
 * the database for each identifier. Identifiers whose fetch failed are skipped, preserving
 * their existing memberships.
 *
 * @param {DBClient} DBClient - The database client used to update membership relationships.
 * @param {IdentifierType[]} Id_s - An array of identifiers whose memberships were fetched.
 * @param {Map<string, string[]>} memberIdsByKey - The fetched member identifiers per key.
 * @param {boolean} [users=false] - A flag indicating whether to set user memberships (if true) or group memberships (if false).
 * @param {string[]} [failedKeys=[]] - Identifiers whose Graph fetch failed and must not be overwritten.
 * @return {Promise<void>} A promise that resolves when all memberships have been applied.
 */
export async function applyMemberships(DBClient: DBClient, Id_s: IdentifierType[], memberIdsByKey: Map<string, string[]>, users: boolean = false, failedKeys: string[] = []) {
    const Ids = Id_s.filter(i => i.identifier !== SYSTEM_USER_IDENTIFIER);
    const failed = new Set(failedKeys);

    // Set new user/group memberships
    for (const id of Ids) {
        if (failed.has(id.identifier)) {
            if (devMode) console.warn(`Skipping membership apply for ${id.identifier} because the Graph fetch failed.`);
            continue;
        }
        const memberIds = memberIdsByKey.get(id.identifier) ?? [];
        if (users) await setUserMemberships(DBClient, id, memberIds.map(memberId => ({ identifier: memberId }))); else await setGroupMemberships(DBClient, id, memberIds.map(memberId => ({ identifier: memberId })));
    }
}

/**
 * Fetches group data incrementally from Microsoft Graph using delta links. This performs
 * only Graph API calls and configuration reads — no database mutations — so it must be
 * called outside of any database transaction.
 *
 * @param {Client} MSGraphQLClient - The client instance used to interact with the Graph API.
 * @param {DBClient} DBClient - The database client used to read the stored delta link.
 * @return {Promise<GroupDeltaResult>} The fetched groups, deleted group ids, and the fresh delta link.
 */
async function fetchGroupDelta(MSGraphQLClient: Client, DBClient: DBClient): Promise<GroupDeltaResult> {
    // Graph delta/page response types
    type DeltaGroupResponse = { value?: DeltaGroup[]; "@odata.nextLink"?: string; "@odata.deltaLink"?: string };

    const deltaCfg = (await getConfigEntriesByKey(DBClient, config.cfgSyncDeltalinkGroups.domain, config.cfgSyncDeltalinkGroups.key))[0];
    let didFullLoad = deltaCfg == null || deltaCfg.value == null;
    let nextLink: string | undefined = (deltaCfg && deltaCfg.value ? String(deltaCfg.value) : null) ?? '/groups/delta?$select=id,displayName';

    const newOrUpdated = new Set<DeltaGroup>();
    const deletedIds = new Set<IdentifierType>();
    let deltaLink: string | undefined;

    let res: DeltaGroupResponse | undefined;
    do {
        try {
            res = (await MSGraphQLClient.api(nextLink!).header('Accept', 'application/json;odata.metadata=minimal').get()) as DeltaGroupResponse;
            for (const entry of res.value ?? []) {
                if (entry["@removed"] && Value.Check(IdentifierSchema, { identifier: entry.id })) deletedIds.add({identifier: entry.id} satisfies IdentifierType);
                else newOrUpdated.add(entry as DeltaGroup);
            }
            nextLink = res["@odata.nextLink"];
        } catch (mqlError: any) {
            if (mqlError.statusCode === 410 && mqlError.code === "SyncStateNotFound") {
                nextLink = "/groups?$select=id,displayName";
                didFullLoad = true;
            } else throw mqlError;
        }
    } while (nextLink);

    if (res?.['@odata.deltaLink']) deltaLink = res['@odata.deltaLink'];

    return { newOrUpdated: Array.from(newOrUpdated), deletedIds: Array.from(deletedIds), didFullLoad, deltaLink };
}

/**
 * Applies a fetched group delta to the database: disables gone groups (or all groups on a
 * full load), upserts the new/updated groups, cleans up obsolete user-group assignments and
 * stores the fresh delta link. Expected to run inside a transaction.
 *
 * @param {DBClient} DBClient - The database client used for the mutations.
 * @param {GroupDeltaResult} delta - The delta result produced by {@link fetchGroupDelta}.
 * @return {Promise<IdentifierType[]>} The identifiers of the upserted groups.
 */
async function applyGroupDelta(DBClient: DBClient, delta: GroupDeltaResult): Promise<IdentifierType[]> {
    // Disable gone groups (or all, if we can not determine which ones are gone)
    if (delta.didFullLoad) await disableGroups(DBClient); else if (0 < delta.deletedIds.length) await disableGroups(DBClient, delta.deletedIds);

    // Upsert all groups from newOrUpdated
    await upsertGroups(DBClient, delta.newOrUpdated.map(g => ({ identifier: g.id, groupName: g.displayName ?? '' } satisfies GroupInsertType)));

    // cleanup obsolete user/group assignments
    await deleteObsoleteUserGroupAssignments(DBClient);

    // store the fresh delta link if one was captured
    if (delta.deltaLink) await upsertConfigEntry(DBClient, { ...config.cfgSyncDeltalinkGroups, value: delta.deltaLink } as ConfigEntryInsertType);

    return delta.newOrUpdated.map(g => ({identifier: g.id} satisfies IdentifierType));
}

let syncRunning = false;
type StartupSyncState = { groupsReady: Promise<void> };

export async function startScheduler(db: DBClient): Promise<StartupSyncState> {
  let resolveGroupsReady!: () => void;
  let rejectGroupsReady!: (reason?: unknown) => void;
  const groupsReady = new Promise<void>((resolve, reject) => {
    resolveGroupsReady = resolve;
    rejectGroupsReady = reject;
  });

  // Ensure config rows exist (seed with defaults on first run)
  for (const entry of Object.values(config)) {
    const existing = await getConfigEntriesByKey(db, entry.domain, entry.key, { limit: 1 });
    if (existing.length < 1) await upsertConfigEntry(db, entry);
  }

  // read cron expression from config
  const cfg = (await getConfigEntriesByKey(db, config.cfgSyncInterval.domain, config.cfgSyncInterval.key))[0];
  const expr = cfg?.value ? String(cfg.value) : "off";

  // helper to determine whether user sync is enabled from config
  async function isUserSyncEnabled(db: DBClient): Promise<boolean> {
    const row = (await getConfigEntriesByKey(db, config.cfgEnableUserSync.domain, config.cfgEnableUserSync.key))[0];
    const raw = row?.value;
    if (raw === null || raw === undefined) return false;
    if (typeof raw === "boolean") return raw;
    if (raw === "true" || raw === "1" || raw === 1) return true;
    return false;
  }

  // helper to run the syncs serially and guard against concurrent runs
  async function runOnce(onGroupsSynced?: () => void) {
    if (syncRunning) return; // skip concurrent
    syncRunning = true;
    let groupsSynced = false;
    try {
      const client = getGraphClient(db);

      // Fetch group data outside of any transaction, then apply it in a short transaction.
      const groupDelta = await fetchGroupDelta(client, db);
      // Commit groups first so the UI can become available as soon as group data exists.
      await runInTransaction(db, async tx => {
        await applyGroupDelta(tx, groupDelta);
      });

      groupsSynced = true;
      onGroupsSynced?.();

      // Users and memberships can continue in the background after groups are available.
      if (await isUserSyncEnabled(db)) {
        const userDelta = await fetchUserDelta(client, db);
        await runInTransaction(db, async tx => {
          await applyUserDelta(tx, userDelta);
        });

        let count = await countUsersAndGroups(db);
        let users: boolean = count.users > count.groups;

        const ids = (users ? (await getUsers(db)).map(u => ({identifier: u.identifier})) : (await getGroups(db)).map(g => ({identifier: g.identifier})));
        const { memberIdsByKey, failedKeys } = await fetchMemberships(client, ids, users);
        await applyMemberships(db, ids, memberIdsByKey, users, failedKeys);
      }
    } catch (e) {
      if (!groupsSynced) rejectGroupsReady(e);
      throw e;
    } finally { syncRunning = false; }
  }

  // Schedule, if schedule is valid
  if (expr && expr !== "off") try { new Cron(expr, () => { void runOnce(); }, { name: "EntraID user and group sync", }); } catch (_e) {}

   // Register to update user memberships on login
   // IMPORTANT: This is awaited to ensure memberships are synchronized before the user
   // accesses any protected resources (avoids race condition where user has no permissions immediately after login)
   PubSub.subscribe({ and: [TAG_AUTH_SESSION, TAG_LOGIN] }, async (msg) => {
     const session = msg.data;
     if (session?.idTokenClaims?.oid) {
       const idTokenClaims = session.idTokenClaims;
       try {
         if (!await isUserSyncEnabled(db)) return;
         const graphClient = getGraphClient(db);
         const { memberIdsByKey, failedKeys } = await fetchMemberships(graphClient, [{identifier: idTokenClaims.oid}], true);
         await runInTransaction(db, async tx => {
           await upsertUsers(tx, [{ identifier: idTokenClaims.oid, firstName: idTokenClaims.given_name ?? '', lastName: idTokenClaims.family_name ?? '', email: idTokenClaims.email || idTokenClaims.preferred_username || '', disabled: false }]);
           // CRITICAL: Sync memberships from Graph API instead of token claims for reliability
           // This ensures group memberships are always current, even if token doesn't contain them
           await applyMemberships(tx, [{identifier: idTokenClaims.oid}], memberIdsByKey, true, failedKeys);
         });
       } catch (e) {
         if (devMode) console.warn("Failed to sync user on login:", e);
         // Log but don't fail login—user can still authenticate, but without group permissions
         // This is better than blocking login entirely
       }
     }
   })

  // Run first sync on startup without blocking app startup after groups are loaded.
  void runOnce(resolveGroupsReady).catch((e) => {
    if (devMode) console.warn("Initial EntraID sync failed:", e);
  });

  return { groupsReady };
}
