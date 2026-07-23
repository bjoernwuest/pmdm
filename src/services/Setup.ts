import {type DBClient, getDatabaseConnection} from "./DatabaseDriver.ts";
import { getConfigEntriesByKey } from "@/repo/ConfigRepo.ts";
import { devMode } from "@/devmode.ts";
import { walkDir } from "@/utils/fs.ts";
import type {ConfigEntrySelectType} from "@/types/ConfigType.ts";

/**
 * A variable to store a setup key, typically used for configuration or initialization purposes.
 * The value can either be a string representing the key or remain undefined if no setup key is provided.
 *
 * Type: string | undefined
 */
let setupKey: string | undefined;

/**
 * Generates and retrieves a unique setup key if it is not already set.
 * The setup key is composed of a random combination of alphanumeric characters.
 *
 * @return {string} The generated or existing setup key.
 */
export function getSetupKey(): string {
    if (!setupKey) {
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        const arr = new Array(50);
        for (let i = 0; i < 50; i++) arr[i] = chars[Math.floor(Math.random() * chars.length)];
        setupKey = arr.join("");
    }
    return setupKey;
}

/**
 * Clears the setup key by setting it to undefined.
 *
 * @return {void} This function does not return any value.
 */
export function clearSetupKey() { setupKey = undefined; }

/**
 * Scans the services directory to discover missing configuration entries that require setup routines
 * and maps them by service name. This utilizes the exported `getMissingConfigEntries` function
 * from each service file to identify the missing entries.
 *
 * @param {DBClient | Promise<DBClient>} DBClient - The database client used to interact with the configuration database.
 * @return {Promise<Map<string, ConfigEntryType[]>} A promise resolving to a map containing service file names as keys
 * and arrays of missing configuration entries as values.
 */
async function getMissingConfigParameters(DBClient: DBClient | Promise<DBClient>): Promise<Map<string, ConfigEntrySelectType[]>> {
    const db = (DBClient instanceof Promise) ? await DBClient : DBClient;
    const commonPath = "src/services";
    const result: Map<string, ConfigEntrySelectType[]> = new Map();
    if (devMode) console.log("Discovering missing config entries that would require the setup routine...");
    try {
        for await (const serviceFile of walkDir(commonPath, [".ts"])) {
            if (`${commonPath}/Setup.ts` !== serviceFile.path) {
                try {
                    if (devMode) console.log("Check service file: ", serviceFile.path);
                    const relativePath = serviceFile.path.replace(commonPath, "").replace(/^\//, "");
                    const serviceImport = await import(`@/services/${relativePath}`);
                    if ('object' === typeof serviceImport.config) {
                        for (const e in serviceImport.config) {
                            if (serviceImport.config[e].mandatoryForStart) {
                                if (1 > (await getConfigEntriesByKey(db, serviceImport.config[e].domain, serviceImport.config[e].key)).length) {
                                    if (!result.has(serviceImport.config[e].domain)) result.set(serviceImport.config[e].domain, []);
                                    result.get(serviceImport.config[e].domain)?.push(serviceImport.config[e]);
                                }
                            }
                        }
                    } else if (devMode) console.log("Service file", serviceFile.path, "does not export config object");
                } catch (importError) { if (devMode) console.log("Service file", serviceFile.path, " import error: ", importError); }
            }
        }
    } catch (error) { console.log("discoverSetupDemand error: ", error); }
    return result;
}

/**
 * Represents the mapping of string keys to arrays of configuration entry types.
 * This can be used to define or retrieve configurations associated with specific keys.
 *
 * The variable may be undefined, signifying that no mapping has been established.
 *
 * @type {Map<string, ConfigEntryType[]> | undefined}
 */
let demand: Map<string, ConfigEntrySelectType[]> | undefined = undefined;

/**
 * Retrieves the setup demand configuration parameters that are missing or not yet initialized.
 * The method fetches these parameters by accessing the database and returns them as a map where
 * each entry consists of a configuration key and its associated array of configuration entry types.
 *
 * @return {Promise<Map<string, ConfigEntryType[]>>} A Promise that resolves to a Map object containing
 * the configuration parameters and their corresponding entry types. If size is 0, no setup is required.
 */
export async function getSetupDemand(): Promise<Map<string, ConfigEntrySelectType[]>> {
    if (!demand || 0 < demand.size) demand = await getMissingConfigParameters(getDatabaseConnection());
    return demand as Map<string, ConfigEntrySelectType[]>;
}
