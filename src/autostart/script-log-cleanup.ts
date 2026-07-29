import { init } from "@/services/ScriptLog";
import type { DBClient } from "@/services/DatabaseDriver";

export async function start(db: DBClient): Promise<void> {
  await init(db);
}
