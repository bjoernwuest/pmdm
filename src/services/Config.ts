import {type ConfigEntrySelectType, ConfigValueTypes} from "@/types/ConfigType.ts";

export type ConfigValueParseResult =
    | { ok: true; value: unknown }
    | { ok: false; error: string };

export function parseConfigValue(type: ConfigEntrySelectType["type"], raw: unknown): ConfigValueParseResult {
    if (raw === null || raw === undefined) return { ok: false, error: "Missing value" };

    switch (type) {
        case ConfigValueTypes.number: {
            const num = typeof raw === "number" ? raw : Number(raw);
            if (Number.isNaN(num)) return { ok: false, error: "Invalid number" };
            return { ok: true, value: num };
        }
        case ConfigValueTypes.boolean: {
            if (typeof raw === "boolean") return { ok: true, value: raw };
            if (raw === "true" || raw === "1" || raw === 1) return { ok: true, value: true };
            if (raw === "false" || raw === "0" || raw === 0) return { ok: true, value: false };
            return { ok: false, error: "Invalid boolean" };
        }
        case ConfigValueTypes.object:
        case ConfigValueTypes["string[]"]:
        case ConfigValueTypes["number[]"]: {
            if (typeof raw === "object" && raw !== null) {
                return { ok: true, value: raw };
            }
            if (typeof raw === "string") {
                try {
                    const parsed = JSON.parse(raw);
                    return { ok: true, value: parsed };
                } catch {
                    if (type === ConfigValueTypes["string[]"]) {
                        const parsed = raw.split(",").map((v) => v.trim()).filter(Boolean);
                        return { ok: true, value: parsed };
                    }
                    return { ok: false, error: "Invalid JSON" };
                }
            }
            return { ok: false, error: "Invalid value" };
        }
        case ConfigValueTypes.string:
        default:
            return { ok: true, value: String(raw) };
    }
}

export function validateConfigInputFormat(entry: Pick<ConfigEntrySelectType, "inputFormat" | "type">, raw: unknown): ConfigValueParseResult {
    if (!entry.inputFormat || entry.inputFormat.trim().length === 0) return { ok: true, value: raw };

    let regex: RegExp;
    try {
        regex = new RegExp(entry.inputFormat);
    } catch {
        return { ok: false, error: "Invalid server-side inputFormat regex" };
    }

    if (entry.type === ConfigValueTypes["string[]"]) {
        if (!Array.isArray(raw)) return { ok: false, error: "Expected array value for input format validation" };
        const allValid = raw.every((item) => typeof item === "string" && regex.test(item));
        return allValid ? { ok: true, value: raw } : { ok: false, error: `Array entry does not match required format: ${entry.inputFormat}` };
    }

    if (entry.type === ConfigValueTypes["number[]"]) {
        if (!Array.isArray(raw)) return { ok: false, error: "Expected array value for input format validation" };
        const allValid = raw.every((item) => typeof item === "number" && Number.isFinite(item) && regex.test(String(item)));
        return allValid ? { ok: true, value: raw } : { ok: false, error: `Array entry does not match required format: ${entry.inputFormat}` };
    }

    if (entry.type !== ConfigValueTypes.string && entry.type !== ConfigValueTypes.number) {
        return { ok: true, value: raw };
    }

    let asString: string;
    if (typeof raw === "string") asString = raw;
    else if (typeof raw === "number" && Number.isFinite(raw)) asString = String(raw);
    else return { ok: false, error: "Invalid value for input format validation" };

    if (!regex.test(asString)) {
        return { ok: false, error: `Value does not match required format: ${entry.inputFormat}` };
    }

    return { ok: true, value: raw };
}
