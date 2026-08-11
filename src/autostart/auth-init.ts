import { init } from "@/services/Auth.ts";
import type { DBClient } from "@/services/DatabaseDriver.ts";

export async function start(db: DBClient): Promise<void> {
    await init(db);
}
