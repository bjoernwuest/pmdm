import { getSetupDemand, getSetupKey } from "@/services/Setup.ts";
import { Elysia } from "elysia";
import { Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { ClientBundleService } from "@/services/ClientBuilder.ts";
import { upsertConfigEntry } from "@/repo/ConfigRepo.ts";
import { getDatabaseConnection, runInTransaction } from "@/services/DatabaseDriver.ts";
import {type ConfigEntrySelectType, ConfigValueTypes, type ConfigEntryInsertType} from "@/types/ConfigType.ts";


const SETUP_HEADER = "x-setup-app";

const toSectionPayload = (sectionTitle: string, entries: ConfigEntrySelectType[]) => ({
    sectionTitle,
    entries: entries.map((entry) => ({
        domain: entry.domain,
        key: entry.key,
        description: entry.description,
        type: entry.type,
        editInUI: entry.editInUI,
        mandatoryForStart: entry.mandatoryForStart,
    })),
});

const toSectionsPayload = (demand: Map<string, ConfigEntrySelectType[]>) => {
    const sections = Array.from(demand.entries()).map(([title, entries]) =>
        toSectionPayload(title, entries)
    );
    return {
        sections,
        current: sections[0] ?? null,
        remaining: sections.length,
    };
};

const schemaForType = (type: ConfigEntrySelectType["type"]) => {
    switch (type) {
        case ConfigValueTypes.string:
            return Type.String();
        case ConfigValueTypes.number:
            return Type.Number();
        case ConfigValueTypes.boolean:
            return Type.Boolean();
        case ConfigValueTypes.object:
            return Type.Record(Type.String(), Type.Any());
        case ConfigValueTypes["string[]"]:
            return Type.Array(Type.String());
        case ConfigValueTypes["number[]"]:
            return Type.Array(Type.Number());
        default:
            return Type.String();
    }
};

const parseValue = (type: ConfigEntrySelectType["type"], raw: unknown) => {
    if (raw === null || raw === undefined) return { ok: false, error: "Missing value" } as const;

    switch (type) {
        case ConfigValueTypes.number: {
            const num = typeof raw === "number" ? raw : Number(raw);
            if (Number.isNaN(num)) return { ok: false, error: "Invalid number" } as const;
            return { ok: true, value: num } as const;
        }
        case ConfigValueTypes.boolean: {
            if (typeof raw === "boolean") return { ok: true, value: raw } as const;
            if (raw === "true" || raw === "1" || raw === 1) return { ok: true, value: true } as const;
            if (raw === "false" || raw === "0" || raw === 0) return { ok: true, value: false } as const;
            return { ok: false, error: "Invalid boolean" } as const;
        }
        case ConfigValueTypes.object:
        case ConfigValueTypes["string[]"]:
        case ConfigValueTypes["number[]"]: {
            if (typeof raw === "object" && raw !== null) {
                return { ok: true, value: raw } as const;
            }
            if (typeof raw === "string") {
                try {
                    const parsed = JSON.parse(raw);
                    return { ok: true, value: parsed } as const;
                } catch {
                    if (type === ConfigValueTypes["string[]"]) {
                        const parsed = raw.split(",").map((v) => v.trim()).filter(Boolean);
                        return { ok: true, value: parsed } as const;
                    }
                    return { ok: false, error: "Invalid JSON" } as const;
                }
            }
            return { ok: false, error: "Invalid value" } as const;
        }
        case ConfigValueTypes.string:
        default:
            return { ok: true, value: String(raw) } as const;
    }
};

export default async function setupApp() {
    const sd = await getSetupDemand();
    if (sd.size === 0) return;

    const DBClient = await getDatabaseConnection();
    const setupBundle = await ClientBundleService.create("src/setup", ["./src/setup/index.tsx"]);

    const setupApp = new Elysia();

    setupApp.get("/", () => {
        const html = `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Setup Wizard</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/setup/clienType.js"></script>
</body>
</html>`;

        return new Response(html, {
            headers: { "Content-Type": "text/html; charset=utf-8", [SETUP_HEADER]: "1" },
        });
    });

    setupApp.get("/setup/clienType.js", ({ request }) => {
        const bundle = setupBundle.getBundle();
        if (!bundle) return new Response("Bundle not available", { status: 503 });

        const clientETag = request.headers.get("if-none-match");
        if (clientETag === bundle.etag) {
            return new Response(null, { status: 304, headers: { ETag: bundle.etag } });
        }

        return new Response(bundle.code, {
            headers: {
                "Content-Type": "application/javascript; charset=utf-8",
                ETag: bundle.etag,
                "Cache-Control": "no-cache",
            },
        });
    });

    setupApp.post(
        "/setup/demand",
        ({ body }) => {
            if (body.setupKey !== getSetupKey()) return new Response("Unauthorized", { status: 401 });

            return getSetupDemand().then((demand) => {
                if (!demand || demand.size === 0) {
                    return new Response(JSON.stringify({ done: true, sections: [] }), { headers: { "Content-Type": "application/json" } });
                }

                const payload = toSectionsPayload(demand);
                return new Response(
                    JSON.stringify({ done: false, ...payload }),
                    { headers: { "Content-Type": "application/json" } }
                );
            });
        },
        {
            body: Type.Object({
                setupKey: Type.String(),
            }),
        }
    );

    setupApp.post(
        "/setup",
        async ({ body }) => {
            const { setupKey, sectionTitle, values } = body;
            if (setupKey !== getSetupKey()) return new Response("Unauthorized", { status: 401 });

            const demand = await getSetupDemand();
            const entries = demand.get(sectionTitle) || [];

            const errors: Record<string, string> = {};
            const updates: ConfigEntryInsertType[] = [];

            for (const entry of entries) {
                const raw = values[entry.key];
                const parsed = parseValue(entry.type, raw);
                if (!parsed.ok) {
                    errors[entry.key] = parsed.error;
                    continue;
                }

                const schema = schemaForType(entry.type);
                if (!Value.Check(schema, parsed.value)) {
                    errors[entry.key] = "Type validation failed";
                    continue;
                }

                updates.push({
                    ...entry,
                    value: parsed.value,
                });
            }

            if (Object.keys(errors).length > 0) {
                return new Response(JSON.stringify({ ok: false, errors }), { status: 400, headers: { "Content-Type": "application/json" } });
            }

            await runInTransaction(DBClient, async (tx) => {
                for (const entry of updates) { await upsertConfigEntry(tx, entry); }
            });

            const nextDemand = await getSetupDemand();
            if (!nextDemand || nextDemand.size === 0) {
                return new Response(JSON.stringify({ done: true, sections: [] }), { headers: { "Content-Type": "application/json" } });
            }

            const payload = toSectionsPayload(nextDemand);
            return new Response(
                JSON.stringify({ done: false, ...payload }),
                { headers: { "Content-Type": "application/json" } }
            );
        },
        {
            body: Type.Object({
                setupKey: Type.String(),
                sectionTitle: Type.String(),
                values: Type.Record(Type.String(), Type.Any()),
            }),
        }
    );

    setupApp.all("*", () => new Response(null, { status: 302, headers: { Location: "/" } }));

    const setupPort = Number(process.env.PORT) || 8000;
    console.log("==================================================");
    console.log("=== SETUP MODE: missing configuration detected ===");
    console.log(`Open the setup UI in your browser:\n\n  http://localhost:${setupPort}/\n`);
    console.log("Use this key in the setup UI (copy from console):\n");
    console.log(getSetupKey());
    console.log("\n==================================================");
    const server = setupApp.listen(setupPort);

    console.log("⏳ Waiting for setup to complete...");

    await new Promise<void>((resolve) => {
        const checkInterval = setInterval(async () => {
            const currentDemand = await getSetupDemand();
            if (currentDemand.size === 0) {
                clearInterval(checkInterval);
                console.log("✅ Setup completed! Starting main application...");
                server.stop();
                resolve();
            }
        }, 2000);
    });
}
