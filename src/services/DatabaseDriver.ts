// This file is the "database driver". Thus, besides the files in `/src/repo`, may deal directly with drizzle-orm.

import {devMode, sqlLogging} from "@/devmode.ts";
import {advisoryLockId, databaseUrl as databaseUrlFromEnv} from "@/services/Env.ts";
import {beginPublishScope, commitPublishScope, rollbackPublishScope, publishScopeDepth} from "@/services/PubSub.ts";
import postgres from "postgres";
import {drizzle} from "drizzle-orm/postgres-js";
import {type RunnableMigration, Umzug} from "umzug";
import {eq, sql} from "drizzle-orm";
import {pgTable, text, timestamp} from "drizzle-orm/pg-core";
import path from "node:path";
import {pathToFileURL} from "node:url";

async function loadSchemaModules(): Promise<Record<string, unknown>> {
    const schemaDir = path.resolve(process.cwd(), "src/schema");
    const schemaFiles = Array.from(new Bun.Glob("*.ts").scanSync({ cwd: schemaDir }))
        .filter((file) => file !== "helpers.ts" && !file.endsWith(".d.ts"));

    const mergedSchema: Record<string, unknown> = {};
    for (const file of schemaFiles) {
        const moduleUrl = pathToFileURL(path.join(schemaDir, file)).href;
        const moduleExports = await import(moduleUrl) as Record<string, unknown>;
        Object.assign(mergedSchema, moduleExports);
    }

    return mergedSchema;
}

const schema = await loadSchemaModules();

// Get database URL from the central env module (throws when missing)
const databaseUrl: string = databaseUrlFromEnv;

// Create a properly typed drizzle instance
const createDrizzleInstance = (client: postgres.Sql) => drizzle(client, { schema, logger: sqlLogging });

type DrizzleType = ReturnType<typeof createDrizzleInstance>;
/**
 * Represents a client for interacting with a Drizzle instance or transaction.
 *
 * This type can be either:
 * - The main DrizzleType (database instance)
 * - A transaction context (from db.transaction callback parameter)
 *
 * This union allows functions to accept both the main database connection
 * and transaction contexts, providing flexibility for database operations.
 */
export type DBClient = DrizzleType | Parameters<Parameters<DrizzleType['transaction']>[0]>[0];

let client: postgres.Sql | null = null;
let drizzleInstance: DBClient | null = null;

/**
 * Retrieves an instance of the drizzle ORM, initializing it with the database connection if necessary.
 *
 * @return {DBClient} An instance of the drizzle ORM.
 */
export function getDatabaseConnection(): DBClient {
    if (!client) {
        if (devMode) console.log("Connecting to database...");
        try {
            client = postgres(databaseUrl, {
                max: 10,
                idle_timeout: 20,
                connect_timeout: 10,
                connection: {
                    // Pinning the session to UTC is defense-in-depth only — optimistic-lock
                    // comparisons bind timestamptz values directly (no `::timestamp` casts),
                    // so correctness no longer depends on this setting.
                    timezone: 'UTC',
                },
            });
        } catch (error) {
            console.error("Failed to connect to database: ", error);
            throw error;
        }
    }

    if (!drizzleInstance) {
        if (devMode) console.log("Get drizzle-orm database connection...");
        try {
            if (!client) throw new Error("Database client is not initialized");
            drizzleInstance = createDrizzleInstance(client);
        } catch (error) {
            console.error("Failed to initialize drizzle ORM: ", error);
            throw error;
        }
    }

    return drizzleInstance!;
}

/**
 * Closes the active Drizzle connection and cleans up related resources.
 *
 * @return {Promise<void>} A promise that resolves when the Drizzle connection has been successfully closed.
 */
export async function closeDatabaseConnection() {
    if (client) {
        try {
            await client.end();
            client = null;
            drizzleInstance = null;
        } catch (error) { console.error("Failed to close Drizzle connection: ", error); }
    }
}

/**
 * Initializes the database schema and tables by applying migrations or generating the necessary schema.
 * This method uses the drizzle-kit tool to run the required commands for schema generation and migrations.
 *
 * @return {Promise<void>} A promise that resolves when the database initialization is successfully completed.
 *                         Throws an error if the migration or schema generation process fails.
 */
export async function initDatabase(): Promise<void> {
    if (devMode) console.log("🚀 Starting programmatically controlled database migrations...");

    const db = getDatabaseConnection() as DrizzleType;
    let lockAcquired = false;
    try {
        const umzugMigrationsTable = pgTable("migrations", {
            name: text("name").primaryKey(),
            appliedAt: timestamp("applied_at", { mode: "string", withTimezone: true }).defaultNow().notNull(),
        });

        type Context = { db: DrizzleType };

        const umzug = new Umzug<Context>({
            migrations: {
                glob: path.join(process.cwd(), "src/migrations/*.{ts,sql}"),
                resolve: ({ name, path: filepath, context }): RunnableMigration<Context> => {
                    if (!filepath) throw new Error(`Migration ${name} has no valid file path.`);

                    const ext = path.extname(filepath);
                    if (ext === ".sql") {
                        return {
                            name,
                            up: async () => {
                                const sqlContent = await Bun.file(filepath).text();
                                await context.db.execute(sql.raw(sqlContent));
                            },
                            down: async () => {}
                        };
                    }
                    return {
                        name,
                        up: async () => {
                            const migration = await import(filepath);
                            return migration.up({ context });
                        },
                        down: async () => {
                            const migration = await import(filepath);
                            if (migration.down) return migration.down({ context });
                        }
                    };
                },
            },

            storage: {
                async executed({ context }) {
                    try {
                        await context.db.execute(sql`CREATE TABLE IF NOT EXISTS "migrations" ("name" text PRIMARY KEY, "applied_at" timestamptz DEFAULT now() NOT NULL);`);
                        const result = await context.db.select({ name: umzugMigrationsTable.name }).from(umzugMigrationsTable);
                        return result.map(r => r.name);
                    } catch (e) { return []; }
                },
                async logMigration({ name, context }) { await context.db.insert(umzugMigrationsTable).values({ name }); },
                async unlogMigration({ name, context }) { await context.db.delete(umzugMigrationsTable).where(eq(umzugMigrationsTable.name, name)); }
            },
            context: { db: db },
            logger: devMode ? console : undefined,
        });

        const lockResult = await db.execute(sql.raw(`SELECT pg_try_advisory_lock(${advisoryLockId}) AS acquired`));
        const row = lockResult[0] as { acquired: boolean } | undefined;
        if (!row || !row.acquired) {
            throw new Error("Another instance is currently running migrations. The advisory lock is held by a different database session.");
        }
        lockAcquired = true;
        if (devMode) console.log("🔒 Database lock acquired.");

        const executed = await umzug.up();

        if (executed.length === 0) { if (devMode) console.log("✅ Database schema is up to date. No migrations required."); }
        else {
            console.log(`🎉 Successfully applied ${executed.length} migration(s):`);
            executed.forEach((m) => console.log(`  - ${m.name}`));
        }

    } catch (err) { throw new Error("Applying programmatic migrations failed: " + String(err)); }
    finally {
        if (lockAcquired) {
            await db.execute(sql.raw(`SELECT pg_advisory_unlock(${advisoryLockId})`));
            if (devMode) console.log("🔓 Database lock released.");
        }
    }
}

const TRANSACTION_MAX_ATTEMPTS = 4;
const TRANSACTION_RETRY_BASE_DELAY_MS = 50;

function isRetryableTransactionError(err: unknown): boolean {
    return err instanceof postgres.PostgresError && (err.code === "40001" || err.code === "40P01");
}

/**
 * Executes a provided callback function within a database transaction.
 *
 * @param {DBClient} DBClient - The database client instance to manage the transaction.
 * @param {Function} callback - A function to be executed within the transaction context.
 * The function receives a transactional database client as its argument.
 * @return {Promise<T>} A promise that resolves to the result of the callback function.
 */
export async function runInTransaction<T>(DBClient: DBClient, callback: (tx: DBClient) => Promise<T>): Promise<T> {
    // PubSub events published while the transaction callback runs are deferred: they are
    // dispatched only when the transaction commits and discarded on rollback, so subscribers
    // never observe events from uncommitted (or failed) transactions.
    const outermost = publishScopeDepth() === 0;

    for (let attempt = 0; ; attempt++) {
        beginPublishScope();
        try {
            const result = await DBClient.transaction(async (tx) => callback(tx), { accessMode: "read write", deferrable: false, isolationLevel: "serializable" });
            commitPublishScope();
            return result;
        } catch (err) {
            rollbackPublishScope();
            if (outermost && attempt + 1 < TRANSACTION_MAX_ATTEMPTS && isRetryableTransactionError(err)) {
                const retryableErr = err as postgres.PostgresError;
                const delay = TRANSACTION_RETRY_BASE_DELAY_MS * 2 ** attempt + Math.floor(Math.random() * TRANSACTION_RETRY_BASE_DELAY_MS);
                if (devMode) console.warn(`Transaction failed with retryable error ${retryableErr.code}, retrying in ${delay}ms (attempt ${attempt + 1} of ${TRANSACTION_MAX_ATTEMPTS - 1}).`);
                await Bun.sleep(delay);
                continue;
            }
            throw err;
        }
    }
}