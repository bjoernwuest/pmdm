import { getConfigEntriesByKey, upsertConfigEntry } from "@/repo/ConfigRepo.ts";
import { getUserProfileConfigEntry } from "@/repo/UserProfileConfigRepo.ts";
import {type DBClient} from "@/services/DatabaseDriver.ts";
import {type ConfigEntrySelectType, ConfigValueTypes} from "@/types/ConfigType.ts";

const DEFAULT_USER_LIST_PAGE_SIZES = [10, 20, 50] as const;

export const config = {
    cfgUserListPageSizes: {
        domain: "User Interface",
        key: "UserListPageSizes",
        description: "Page sizes for user list pagination as number array, e.g. [10, 20, 50].",
        type: ConfigValueTypes["number[]"],
        value: [...DEFAULT_USER_LIST_PAGE_SIZES],
        formatRegex: "^[1-9][0-9]{0,3}$",
        inputFormat: "^[1-9][0-9]{0,3}$",
        outputFormat: "",
        editInUI: true,
        mandatoryForStart: false,
        userProfile: true,
    } satisfies ConfigEntrySelectType,
};

function parsePageSizes(raw: unknown): number[] {
    if (Array.isArray(raw)) {
        const parsed = Array.from(new Set(raw
            .map((value) => (typeof value === "number" ? value : Number(value)))
            .filter((value) => Number.isInteger(value) && value > 0)));
        return parsed.length > 0 ? parsed : [...DEFAULT_USER_LIST_PAGE_SIZES];
    }
    return [...DEFAULT_USER_LIST_PAGE_SIZES];
}

export async function getUserListPageSizes(db: DBClient, userIdentifier?: string): Promise<number[]> {
    let entries = await getConfigEntriesByKey(db, config.cfgUserListPageSizes.domain, config.cfgUserListPageSizes.key, { limit: 1 });
    if (entries.length < 1) {
        entries = await upsertConfigEntry(db, config.cfgUserListPageSizes);
    }

    let overrideValue: unknown = undefined;
    if (userIdentifier) {
        const override = await getUserProfileConfigEntry(db, userIdentifier, config.cfgUserListPageSizes.domain, config.cfgUserListPageSizes.key);
        if (override?.value !== null && override?.value !== undefined) {
            overrideValue = override.value;
        }
    }

    const rawValue = overrideValue !== undefined ? overrideValue : entries[0]!.value;
    return parsePageSizes(rawValue);
}
