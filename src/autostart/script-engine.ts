import { startScriptEngine } from "@/services/ScriptEngine";
import type { DBClient } from "@/services/DatabaseDriver";

export async function start(db: DBClient): Promise<void> {
  await startScriptEngine(db);
}
