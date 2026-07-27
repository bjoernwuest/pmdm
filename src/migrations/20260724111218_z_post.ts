import { sql } from "drizzle-orm";

export const up = async ({ context }: { context: { db: any } }) => {
  // Your custom migration code (runs with Umzug)
};

export const down = async ({ context }: { context: { db: any } }) => {
  // Optional rollback
};