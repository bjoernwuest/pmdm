import { sql } from "drizzle-orm";

export const up = async ({ context }: { context: { db: any } }) => {
    const db = context.db;

    const rows = await db.execute(sql`
        SELECT identifier, kind, config FROM data_types WHERE kind IN ('numeric', 'string')
    `);

    const rowArray = Array.isArray(rows) ? rows : (rows.rows ?? []);

    for (const row of rowArray) {
        const config = row.config as Record<string, any>;
        const targetIdentifier = row.identifier;

        if (row.kind === "numeric") {
            const decimals = config.decimals ?? 0;
            const d = Number(decimals);
            const regex = d > 0
                ? `^-?\\d+(?:\\.\\d{1,${d}})?$`
                : `^-?\\d+$`;

            const newConfig = { ...config, inputValidation: regex };
            await db.execute(sql`
        UPDATE data_types
        SET kind = 'string', config = ${JSON.stringify(newConfig)}::jsonb
        WHERE identifier = ${targetIdentifier}
      `);
        } else if (row.kind === "string") {
            const min: number | undefined = typeof config.min === "number" ? config.min : undefined;
            const max: number | undefined = typeof config.max === "number" ? config.max : undefined;

            const hasMin = min !== undefined && min > 0;
            const hasMax = max !== undefined;

            let regex: string | undefined;
            if (hasMin && hasMax) {
                regex = `^.{${min},${max}}$`;
            } else if (hasMin) {
                regex = `^.{${min},}$`;
            } else if (hasMax) {
                regex = `^.{0,${max}}$`;
            }

            if (regex) {
                const newConfig = { ...config, inputValidation: regex };
                await db.execute(sql`
          UPDATE data_types
          SET config = ${JSON.stringify(newConfig)}::jsonb
          WHERE identifier = ${targetIdentifier}
        `);
            }
        }
    }
};

export const down = async ({ context }: { context: { db: any } }) => {
    const db = context.db;

    const rows = await db.execute(sql`
    SELECT identifier, kind, config FROM data_types WHERE config ? 'inputValidation'
  `);

    const rowArray = Array.isArray(rows) ? rows : (rows.rows ?? []);

    for (const row of rowArray) {
        const config = row.config as Record<string, any>;
        const targetIdentifier = row.identifier;

        if (row.kind === "string" && (config.decimals !== undefined || config.decimals === 0)) {
            // Former numeric row: change kind back and remove inputValidation
            delete config.inputValidation;
            await db.execute(sql`
        UPDATE data_types
        SET kind = 'numeric', config = ${JSON.stringify(config)}::jsonb
        WHERE identifier = ${targetIdentifier}
      `);
        } else {
            // String row: just remove inputValidation
            delete config.inputValidation;
            await db.execute(sql`
        UPDATE data_types
        SET config = ${JSON.stringify(config)}::jsonb
        WHERE identifier = ${targetIdentifier}
      `);
        }
    }
};
