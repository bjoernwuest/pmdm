import { startScheduler } from "@/services/EntraIDSync.ts";
import type { DBClient } from "@/services/DatabaseDriver.ts";

/**
 * Starts the EntraID sync scheduler. Blocks inside `start()` until the initial
 * group sync has completed (the `groupsReady` promise) so that group-derived
 * permissions exist before the server accepts requests — the autostart contract
 * explicitly permits waiting inside `start()`. A failure rejects and is logged
 * by the auto-discovery loop (the server continues without EntraID sync).
 */
export async function start(db: DBClient): Promise<void> {
    const syncState = await startScheduler(db);
    await syncState.groupsReady;
}
