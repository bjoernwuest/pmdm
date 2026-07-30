import { getConfigEntriesByKey, upsertConfigEntry } from "@/repo/ConfigRepo.ts";
import { Value } from "@sinclair/typebox/value";
import { IdentifierSchema, type IdentifierType } from "@/types/helpers.ts";
import { ConfidentialClientApplication } from "@azure/msal-node";
import { Client } from "@microsoft/microsoft-graph-client";
import type { User as MSGraphUser, Group as MSGraphGroup } from "@microsoft/microsoft-graph-types";
import { devMode } from "@/devmode.ts";
import {type DBClient, getDatabaseConnection, runInTransaction} from "./DatabaseDriver.ts";
import { Cron } from "croner";
import { countUsersAndGroups, deleteObsoleteUserGroupAssignments, disableGroups, disableUsers, getGroups, getUsers, setGroupMemberships, setUserMemberships, upsertGroups, upsertUsers } from "@/repo/UserRepo.ts";
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
} satisfies Record<string, ConfigEntrySelectType>;

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

/**
 * Synchronizes user data from Microsoft Graph API with the database.
 * The method fetches user data incrementally using delta links, updates the local database with new or updated users,
 * disables users that are no longer present, and cleans up obsolete user-group assignments.
 *
 * @param {Client} MSGraphQLClient - The Microsoft Graph API client used to fetch user data.
 * @param {DBClient} DBClient - The database client for performing database operations.
 * @return {Promise<void>} A promise that resolves when the synchronization process is completed.
 */
async function userSync(MSGraphQLClient: Client, DBClient: DBClient): Promise<IdentifierType[]> {
  type DeltaUser = MSGraphUser & { "@removed"?: { reason: string }; id: string };
  type DeltaUserResponse = { value?: DeltaUser[]; "@odata.nextLink"?: string; "@odata.deltaLink"?: string };

  const deltaCfg = (await getConfigEntriesByKey(DBClient, config.cfgSyncDeltalinkUsers.domain, config.cfgSyncDeltalinkUsers.key))[0];
  let didFullLoad = deltaCfg == null || deltaCfg.value == null;
  let nextLink: string | undefined = (deltaCfg && deltaCfg.value ? String(deltaCfg.value) : null) ?? '/users/delta?$select=id,mail,userPrincipalName,givenName,surname,accountEnabled';

  const newOrUpdated: Set<DeltaUser> = new Set();
  const deletedIds: Set<IdentifierType> = new Set();

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
        nextLink = "/groups?$select=id,displayName";
        didFullLoad = true;
      } else throw mqlError;
    }
  } while (nextLink);

  // Disable gone groups (or all, if we can not determine which ones are gone)
  if (didFullLoad) await disableUsers(DBClient); else if (0 < deletedIds.size) await disableUsers(DBClient, [...deletedIds]);

  // Upsert all groups from newOrUpdated; this may set isActive to false if user acocunt was disabled in EntraID
  await upsertUsers(DBClient, [...newOrUpdated].map(u => ({ identifier: u.id, firstName: u.givenName ?? '', lastName: u.surname ?? '', email: u.mail || u.userPrincipalName || '', disabled: (u.accountEnabled === false) } satisfies UserInsertType)));

  // cleanup obsolete user/group assignments
  await deleteObsoleteUserGroupAssignments(DBClient);

  // after loop, capture deltaLink if present on last response
  if (res?.['@odata.deltaLink']) await upsertConfigEntry(DBClient, { ...config.cfgSyncDeltalinkUsers, value: res?.['@odata.deltaLink'] } as ConfigEntryInsertType);

  return Array.from(newOrUpdated).map(g => ({identifier: g.id} satisfies IdentifierType));
}

/**
 * Synchronizes membership relationships for users or groups by fetching data from Microsoft Graph API
 * and updating the database using the provided clients.
 *
 * @param {Client} MSGraphQLClient - The client used to interact with Microsoft Graph API.
 * @param {DBClient} DBClient - The database client used to update membership relationships.
 * @param {IdentifierType[]} Id_s - An array of identifiers representing the users or groups to sync.
 * @param {boolean} [users=false] - A flag indicating whether to synchronize user memberships (if true) or group memberships (if false).
 * @return {Promise<void>} A promise that resolves when the synchronization process is complete.
 */
export async function membershipSync(MSGraphQLClient: Client, DBClient: DBClient, Id_s: IdentifierType[], users: boolean = false) {
  const Ids = Id_s.filter(i => i.identifier !== "00000000-0000-0000-0000-000000000000");
  type MemberPageResponse = { value?: { id: string; "@odata.type"?: string }[]; "@odata.nextLink"?: string };
  for (const id of Ids) {
    let nextLink: string | undefined = users ? `users/${id.identifier}/memberOf?$select=id` : `groups/${id.identifier}/members?$select=id`;
    const memberIds: string[] = [];
    try {
      do {
        const mRes = (await MSGraphQLClient.api(nextLink).header('Accept', 'application/json;odata.metadata=minimal').get()) as MemberPageResponse;
        const vals = mRes.value ?? [];
        for (const v of vals) {
          if (v["@odata.type"] === (users ? "#microsoft.graph.group" : "#microsoft.graph.user")) memberIds.push(v.id);
        }
        nextLink = mRes['@odata.nextLink'];
      } while (nextLink);
    } catch (_e) { if (devMode) console.warn(`Failed to retrieve user/group memberships for ${id.identifier} from ${nextLink}. Error:`, _e);}
    // Set new user/group memberships
    if (users) await setUserMemberships(DBClient, id, memberIds.map(id => ({ identifier: id }))); else await setGroupMemberships(DBClient, id, memberIds.map(id => ({ identifier: id })));
  }
}

/**
 * Synchronizes group data between a remote Graph API and a local database. It processes additions, updates, and deletions
 * of groups to keep the local database in sync with the remote state. If a sync state is lost or invalidated, a full
 * reload is performed.
 *
 * @param {Client} MSGraphQLClient - The client instance used to interact with the Graph API.
 * @param {DBClient} DBClient - The database client used for querying and updating local group records.
 * @return {Promise<void>} A promise that resolves once the group synchronization process is complete.
 */
async function groupSync(MSGraphQLClient: Client, DBClient: DBClient): Promise<IdentifierType[]> {
  // Graph delta/page response types
  type DeltaGroup = MSGraphGroup & { "@removed"?: { reason: string }; id: string };
  type DeltaGroupResponse = { value?: DeltaGroup[]; "@odata.nextLink"?: string; "@odata.deltaLink"?: string };

  const deltaCfg = (await getConfigEntriesByKey(DBClient, config.cfgSyncDeltalinkGroups.domain, config.cfgSyncDeltalinkGroups.key))[0];
  let didFullLoad = deltaCfg == null || deltaCfg.value == null;
  let nextLink: string | undefined = (deltaCfg && deltaCfg.value ? String(deltaCfg.value) : null) ?? '/groups/delta?$select=id,displayName';

  const newOrUpdated = new Set<DeltaGroup>();
  const deletedIds = new Set<IdentifierType>();

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

  // Disable gone groups (or all, if we can not determine which ones are gone)
  if (didFullLoad) await disableGroups(DBClient); else if (0 < deletedIds.size) await disableGroups(DBClient, [...deletedIds]);

  // Upsert all groups from newOrUpdated
  await upsertGroups(DBClient, Array.from(newOrUpdated).map(g => ({ identifier: g.id, groupName: g.displayName ?? '' } satisfies GroupInsertType)));

  // cleanup obsolete user/group assignments
  await deleteObsoleteUserGroupAssignments(DBClient);

  // after loop, capture deltaLink if present on last response
  if (res?.['@odata.deltaLink']) await upsertConfigEntry(DBClient, { ...config.cfgSyncDeltalinkGroups, value: res?.['@odata.deltaLink'] } as ConfigEntryInsertType);

  return Array.from(newOrUpdated).map(g => ({identifier: g.id} satisfies IdentifierType));
}

let syncRunning = false;
type StartupSyncState = { groupsReady: Promise<void> };

export async function startScheduler(): Promise<StartupSyncState> {
  let resolveGroupsReady!: () => void;
  let rejectGroupsReady!: (reason?: unknown) => void;
  const groupsReady = new Promise<void>((resolve, reject) => {
    resolveGroupsReady = resolve;
    rejectGroupsReady = reject;
  });

  // read cron expression from config
  const cfg = (await getConfigEntriesByKey(getDatabaseConnection(), config.cfgSyncInterval.domain, config.cfgSyncInterval.key))[0];
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
      // Commit groups first so the UI can become available as soon as group data exists.
      await runInTransaction(getDatabaseConnection(), async tx => {
        const client = getGraphClient(tx);
        await groupSync(client, tx);
      });

      groupsSynced = true;
      onGroupsSynced?.();

      // Users and memberships can continue in the background after groups are available.
      if (await isUserSyncEnabled(getDatabaseConnection())) {
        await runInTransaction(getDatabaseConnection(), async tx => {
          const client = getGraphClient(tx);
          await userSync(client, tx);

          let count = await countUsersAndGroups(tx);
          let users: boolean = count.users > count.groups;

          await membershipSync(client, tx, (users ? (await getUsers(tx)).map(u => ({identifier: u.identifier})) : (await getGroups(tx)).map(g => ({identifier: g.identifier}))), users);
        });
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
         await runInTransaction(getDatabaseConnection(), async tx => {
           if (!await isUserSyncEnabled(tx)) return;
           const graphClient = getGraphClient(tx);
           await upsertUsers(tx, [{ identifier: idTokenClaims.oid, firstName: idTokenClaims.given_name ?? '', lastName: idTokenClaims.family_name ?? '', email: idTokenClaims.email || idTokenClaims.preferred_username || '', disabled: false }]);
           // CRITICAL: Sync memberships from Graph API instead of token claims for reliability
           // This ensures group memberships are always current, even if token doesn't contain them
           await membershipSync(graphClient, tx, [{identifier: idTokenClaims.oid}], true);
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
