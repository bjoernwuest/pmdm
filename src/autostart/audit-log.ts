import { startAuditLog } from "@/services/AuditLog";
import type { DBClient } from "@/services/DatabaseDriver";

export async function start(db: DBClient): Promise<void> {
  await startAuditLog(db);
}
