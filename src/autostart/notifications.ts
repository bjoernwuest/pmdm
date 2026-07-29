import { init } from "@/services/Notifications";
import type { DBClient } from "@/services/DatabaseDriver";

export async function start(db: DBClient): Promise<void> {
  await init(db);
}
