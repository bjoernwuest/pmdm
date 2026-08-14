import { type DBClient, runInTransaction } from "@/services/DatabaseDriver.ts";
import { getConfigEntriesByKey, upsertConfigEntry } from "@/repo/ConfigRepo.ts";
import { getUserProfileConfigEntry } from "@/repo/UserProfileConfigRepo.ts";
import {
    getTransitionedProductRequests,
    getAwaitingPerUser,
    getTransitionsPerUser,
    getUsersWithRelevantGroups,
    type AwaitingItem,
    type TransitionItem,
} from "@/repo/NotificationRepo.ts";
import { getGraphClient } from "@/services/EntraIDSync.ts";
import { Cron } from "croner";
import { type ConfigEntrySelectType, ConfigValueTypes } from "@/types/ConfigType.ts";
import { devMode } from "@/devmode.ts";

const configDomain = "Notifications";
export const config = {
    cfgEnabled:         { domain: configDomain, key: "Enabled",                  description: "Master switch. Must be true for the notification system to run.", type: ConfigValueTypes.boolean, value: false, formatRegex: "", inputFormat: "", outputFormat: "", editInUI: true, mandatoryForStart: false, userProfile: false },
    cfgSchedule:        { domain: configDomain, key: "Notification schedule",    description: "Default CRON expression for the notification digest. Users can override with their own schedule via their profile.", type: ConfigValueTypes.string, value: "", formatRegex: `^((?i)@(yearly|annually|monthly|weekly|daily|midnight|hourly)|^\\s*([^ ]+\\s+){4,6}[^ ]+\\s*|^(?i)off)$`, inputFormat: `^((?i)@(yearly|annually|monthly|weekly|daily|midnight|hourly)|^\\s*([^ ]+\\s+){4,6}[^ ]+\\s*|^(?i)off)$`, outputFormat: "", editInUI: true, mandatoryForStart: false, userProfile: true },
    cfgFrom:            { domain: configDomain, key: "From",                     description: "Sender email address. Must match the Mail.Send scope restriction.", type: ConfigValueTypes.string, value: "", formatRegex: "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$", inputFormat: "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$", outputFormat: "", editInUI: true, mandatoryForStart: false, userProfile: false },
    cfgSubject:         { domain: configDomain, key: "Subject",                  description: "Email subject line. Supports {User.Firstname} and {User.Lastname} placeholders.", type: ConfigValueTypes.string, value: "Action required: Product Request digest", formatRegex: "", inputFormat: "", outputFormat: "", editInUI: true, mandatoryForStart: false, userProfile: false },
    cfgEmailTemplate:   { domain: configDomain, key: "EmailTemplate",            description: "HTML email body template.", type: ConfigValueTypes.string, value: `<p>Dear {User.Firstname},</p>\n\n<p>you have following product requests awaiting your contribution:</p>\n\n{awaiting}\n\n<p>Following product requests evolved in the workflow:</p>\n\n{transitions}\n\n<p>—<br>Your Product Management Team</p>`, formatRegex: "", inputFormat: "", outputFormat: "", editInUI: true, mandatoryForStart: false, userProfile: false },
    cfgBaseURL:         { domain: configDomain, key: "BaseURL",                  description: "Base URL for constructing absolute links in emails.", type: ConfigValueTypes.string, value: "", formatRegex: `^https?://[^\\s/$.?#].[^\\s]*$`, inputFormat: `^https?://[^\\s/$.?#].[^\\s]*$`, outputFormat: "", editInUI: true, mandatoryForStart: false, userProfile: false },
    cfgLastDigestAt:    { domain: configDomain, key: "LastDigestAt",             description: "Internal timestamp of the last digest run.", type: ConfigValueTypes.string, value: "", formatRegex: "", inputFormat: "", outputFormat: "", editInUI: false, mandatoryForStart: false, userProfile: false },
    cfgNotifyProvide:   { domain: configDomain, key: "NotifyOnProvideData",      description: `Include "Provide value" awaiting items in the digest.`, type: ConfigValueTypes.boolean, value: true, formatRegex: "", inputFormat: "", outputFormat: "", editInUI: true, mandatoryForStart: false, userProfile: true },
    cfgNotifyApprove:   { domain: configDomain, key: "NotifyOnApprovalPending",  description: `Include "Approve value" awaiting items in the digest.`, type: ConfigValueTypes.boolean, value: true, formatRegex: "", inputFormat: "", outputFormat: "", editInUI: true, mandatoryForStart: false, userProfile: true },
    cfgNotifyImporting: { domain: configDomain, key: "NotifyOnImporting",        description: "Include importing status transitions in the digest.", type: ConfigValueTypes.boolean, value: true, formatRegex: "", inputFormat: "", outputFormat: "", editInUI: true, mandatoryForStart: false, userProfile: true },
    cfgNotifyDone:      { domain: configDomain, key: "NotifyOnDone",             description: "Include done status transitions in the digest.", type: ConfigValueTypes.boolean, value: true, formatRegex: "", inputFormat: "", outputFormat: "", editInUI: true, mandatoryForStart: false, userProfile: true },
    cfgNotifyCancelled: { domain: configDomain, key: "NotifyOnCancelled",        description: "Include cancelled status transitions in the digest.", type: ConfigValueTypes.boolean, value: true, formatRegex: "", inputFormat: "", outputFormat: "", editInUI: true, mandatoryForStart: false, userProfile: true },
} satisfies Record<string, ConfigEntrySelectType>;

let syncRunning = false;

function matchesCronField(field: string, value: number, min: number, max: number): boolean {
    if (field === "*") return true;
    for (const part of field.split(",")) {
        const trimmed = part.trim();
        if (trimmed.includes("/")) {
            const slashParts = trimmed.split("/");
            const range = slashParts[0]!;
            const stepStr = slashParts[1]!;
            const step = parseInt(stepStr, 10);
            if (Number.isNaN(step) || step <= 0) continue;
            const rangeMatch = range === "*";
            if (rangeMatch && (value - min) % step === 0) return true;
            if (range.includes("-")) {
                const dashParts = range.split("-");
                const rMin = Number(dashParts[0]);
                const rMax = Number(dashParts[1]);
                if (!Number.isNaN(rMin) && !Number.isNaN(rMax) && value >= rMin && value <= rMax && (value - rMin) % step === 0) return true;
            }
        } else if (trimmed.includes("-")) {
            const dashParts = trimmed.split("-");
            const rMin = Number(dashParts[0]);
            const rMax = Number(dashParts[1]);
            if (!Number.isNaN(rMin) && !Number.isNaN(rMax) && value >= rMin && value <= rMax) return true;
        } else {
            const num = parseInt(trimmed, 10);
            if (!Number.isNaN(num) && num === value) return true;
        }
    }
    return false;
}

function cronMatchesNow(expr: string): boolean {
    try {
        const parts = expr.trim().split(/\s+/);
        if (parts.length < 5) return false;
        const now = new Date();
        return matchesCronField(parts[0]!, now.getMinutes(), 0, 59)
            && matchesCronField(parts[1]!, now.getHours(), 0, 23)
            && matchesCronField(parts[2]!, now.getDate(), 1, 31)
            && matchesCronField(parts[3]!, now.getMonth() + 1, 1, 12)
            && matchesCronField(parts[4]!, now.getDay(), 0, 6);
    } catch {
        return false;
    }
}

async function getUserConfigValue(db: DBClient, userId: string, cfgEntry: ConfigEntrySelectType): Promise<unknown> {
    const override = await getUserProfileConfigEntry(db, userId, configDomain, cfgEntry.key);
    if (override && override.value !== null && override.value !== undefined) {
        if (cfgEntry.type === ConfigValueTypes.string) {
            const val = String(override.value);
            if (val.length > 0) return val;
        } else {
            return override.value;
        }
    }
    return cfgEntry.value;
}

async function getUserBooleanConfig(db: DBClient, userId: string, cfgEntry: ConfigEntrySelectType): Promise<boolean> {
    const val = await getUserConfigValue(db, userId, cfgEntry);
    if (typeof val === "boolean") return val;
    if (val === "true") return true;
    if (val === "false") return false;
    return true;
}

function buildAwaitingTable(awaitingProvide: AwaitingItem[], awaitingApprove: AwaitingItem[], baseURL: string): string {
    const rows: { productNumber: string; awaiting: string; link: string }[] = [];

    for (const item of awaitingProvide) {
        rows.push({
            productNumber: item.productNumber,
            awaiting: "Provide value",
            link: baseURL ? `<a href="${baseURL}/product-requests/${item.requestId}">Open request</a>` : "Open request",
        });
    }
    for (const item of awaitingApprove) {
        rows.push({
            productNumber: item.productNumber,
            awaiting: "Approve value",
            link: baseURL ? `<a href="${baseURL}/product-requests/${item.requestId}">Open request</a>` : "Open request",
        });
    }

    rows.sort((a, b) => {
        if (a.awaiting !== b.awaiting) return a.awaiting === "Provide value" ? -1 : 1;
        return a.productNumber.localeCompare(b.productNumber);
    });

    if (rows.length === 0) return "<p>None</p>";

    let html = `<table border="1" cellpadding="5" cellspacing="0" style="border-collapse:collapse">
  <thead><tr><th>Product Number</th><th>Awaiting</th><th>Link</th></tr></thead>
  <tbody>`;
    for (const row of rows) {
        html += `\n    <tr><td>${row.productNumber}</td><td>${row.awaiting}</td><td>${row.link}</td></tr>`;
    }
    html += `\n  </tbody>\n</table>`;
    return html;
}

function buildTransitionsTable(transitions: TransitionItem[], baseURL: string): string {
    const statusOrder: Record<string, number> = { importing: 0, done: 1, cancelled: 2 };

    const sorted = [...transitions].sort((a, b) => {
        const sa = statusOrder[a.newStatus] ?? 99;
        const sb = statusOrder[b.newStatus] ?? 99;
        if (sa !== sb) return sa - sb;
        return a.productNumber.localeCompare(b.productNumber);
    });

    if (sorted.length === 0) return "<p>None</p>";

    let html = `<table border="1" cellpadding="5" cellspacing="0" style="border-collapse:collapse">
  <thead><tr><th>Product Number</th><th>New Status</th><th>Link</th></tr></thead>
  <tbody>`;
    for (const row of sorted) {
        const isDone = row.newStatus === "done";
        const href = isDone
            ? `${baseURL}/products/${row.productNumber}`
            : `${baseURL}/product-requests/${row.requestId}`;
        const label = isDone ? "View product" : "View request";
        html += `\n    <tr><td>${row.productNumber}</td><td>${row.newStatus}</td><td>${baseURL ? `<a href="${href}">${label}</a>` : label}</td></tr>`;
    }
    html += `\n  </tbody>\n</table>`;
    return html;
}

async function sendEmail(fromEmail: string, toEmail: string, subject: string, htmlBody: string, db: DBClient) {
    const graphClient = getGraphClient(db);
    await graphClient.api(`/users/${fromEmail}/sendMail`).post({
        message: {
            subject,
            body: { contentType: "HTML", content: htmlBody },
            toRecipients: [{ emailAddress: { address: toEmail } }],
        },
        saveToSentItems: false,
    });
}

async function readConfig(db: DBClient) {
    const enabledRow = (await getConfigEntriesByKey(db, configDomain, config.cfgEnabled.key, { limit: 1 }))[0];
    const scheduleRow = (await getConfigEntriesByKey(db, configDomain, config.cfgSchedule.key, { limit: 1 }))[0];
    const fromRow = (await getConfigEntriesByKey(db, configDomain, config.cfgFrom.key, { limit: 1 }))[0];

    const enabled = enabledRow?.value === true || enabledRow?.value === "true";
    const cronExpr = scheduleRow?.value ? String(scheduleRow.value) : "";
    const fromEmail = fromRow?.value ? String(fromRow.value) : "";

    return { enabled, cronExpr, fromEmail };
}

async function getGlobalStringConfig(db: DBClient, entry: ConfigEntrySelectType): Promise<string> {
    const row = (await getConfigEntriesByKey(db, configDomain, entry.key, { limit: 1 }))[0];
    return row?.value ? String(row.value) : (entry.value as string) || "";
}

export async function sendDigest(db: DBClient) {
    if (syncRunning) return;
    syncRunning = true;
    try {
        const { enabled, fromEmail } = await readConfig(db);
        if (!enabled || !fromEmail) return;

        const lastDigestAt = await getGlobalStringConfig(db, config.cfgLastDigestAt);
        const subject = await getGlobalStringConfig(db, config.cfgSubject);
        const emailTemplate = await getGlobalStringConfig(db, config.cfgEmailTemplate);
        const baseURL = await getGlobalStringConfig(db, config.cfgBaseURL);

        const transitions = lastDigestAt
            ? await getTransitionedProductRequests(db, lastDigestAt)
            : [];
        const transitionsPerUser = transitions.length > 0
            ? await getTransitionsPerUser(db, transitions)
            : new Map<string, TransitionItem[]>();

        const awaitingPerUser = await getAwaitingPerUser(db);
        const allUsers = await getUsersWithRelevantGroups(db);

        let sentCount = 0;

        for (const user of allUsers) {
            const awaiting = awaitingPerUser.get(user.identifier) ?? { awaitingProvide: [], awaitingApprove: [] };
            const userTransitions = transitionsPerUser.get(user.identifier) ?? [];

            const notifyProvide = await getUserBooleanConfig(db, user.identifier, config.cfgNotifyProvide);
            const notifyApprove = await getUserBooleanConfig(db, user.identifier, config.cfgNotifyApprove);
            const notifyImporting = await getUserBooleanConfig(db, user.identifier, config.cfgNotifyImporting);
            const notifyDone = await getUserBooleanConfig(db, user.identifier, config.cfgNotifyDone);
            const notifyCancelled = await getUserBooleanConfig(db, user.identifier, config.cfgNotifyCancelled);

            const userCronExpr = await getUserConfigValue(db, user.identifier, config.cfgSchedule);
            const effectiveCron = userCronExpr && String(userCronExpr).length > 0 ? String(userCronExpr) : null;
            if (effectiveCron) {
                try { new Cron(effectiveCron); } catch { /* invalid, fallback to system */ }
                if (!cronMatchesNow(effectiveCron)) continue;
            }

            const filteredAwaitingProvide = notifyProvide ? awaiting.awaitingProvide : [];
            const filteredAwaitingApprove = notifyApprove ? awaiting.awaitingApprove : [];
            const filteredTransitions = userTransitions.filter((t) => {
                switch (t.newStatus) {
                    case "importing": return notifyImporting;
                    case "done": return notifyDone;
                    case "cancelled": return notifyCancelled;
                    default: return false;
                }
            });

            const hasWriteOrApprove = filteredAwaitingProvide.length > 0 || filteredAwaitingApprove.length > 0;
            const hasAnyItems = hasWriteOrApprove || filteredTransitions.length > 0;
            if (!hasAnyItems) continue;
            if (!hasWriteOrApprove) continue;

            if (!user.email) continue;

            const awaitingHtml = buildAwaitingTable(filteredAwaitingProvide, filteredAwaitingApprove, baseURL);
            const transitionsHtml = buildTransitionsTable(filteredTransitions, baseURL);

            let body = emailTemplate
                .replace(/\{User\.Firstname\}/g, user.firstName)
                .replace(/\{User\.Lastname\}/g, user.lastName)
                .replace(/\{awaiting\}/g, awaitingHtml)
                .replace(/\{transitions\}/g, transitionsHtml);

            const userSubject = subject
                .replace(/\{User\.Firstname\}/g, user.firstName)
                .replace(/\{User\.Lastname\}/g, user.lastName);

            try {
                await sendEmail(fromEmail, user.email, userSubject, body, db);
                sentCount++;
            } catch (e) {
                if (devMode) console.warn(`Failed to send notification to ${user.email}:`, e);
            }
        }

        await upsertConfigEntry(db, {
            ...config.cfgLastDigestAt,
            value: new Date().toISOString(),
        });

        if (devMode) console.log(`[notifications] Digest sent to ${sentCount} users`);
    } finally {
        syncRunning = false;
    }
}

export async function sendToUser(
    db: DBClient,
    fromEmail: string,
    userIds?: string[],
    groupIds?: string[],
): Promise<number> {
    const { enabled, fromEmail: cfgFrom } = await readConfig(db);
    if (!enabled) return 0;
    const effectiveFrom = fromEmail || cfgFrom;
    if (!effectiveFrom) return 0;

    const subject = await getGlobalStringConfig(db, config.cfgSubject);
    const emailTemplate = await getGlobalStringConfig(db, config.cfgEmailTemplate);
    const baseURL = await getGlobalStringConfig(db, config.cfgBaseURL);

    const lastDigestAt = await getGlobalStringConfig(db, config.cfgLastDigestAt);
    const transitions = lastDigestAt
        ? await getTransitionedProductRequests(db, lastDigestAt)
        : [];
    const transitionsPerUser = transitions.length > 0
        ? await getTransitionsPerUser(db, transitions)
        : new Map<string, TransitionItem[]>();
    const awaitingPerUser = await getAwaitingPerUser(db);
    const allUsers = await getUsersWithRelevantGroups(db);

    const targetUserIds = new Set<string>();
    if (userIds) for (const id of userIds) targetUserIds.add(id);
    if (groupIds) {
        const { getUsers } = await import("@/repo/UserRepo.ts");
        const { UserGroup, User } = await import("@/schema/UserSchema.ts");
        const { inArray, eq, and } = await import("drizzle-orm");
        const memberRows = await db
            .selectDistinct({ userId: UserGroup.userIdentifier })
            .from(UserGroup)
            .innerJoin(User, and(eq(UserGroup.userIdentifier, User.identifier), eq(User.disabled, false)))
            .where(inArray(UserGroup.groupIdentifier, groupIds));
        for (const r of memberRows) targetUserIds.add(r.userId);
    }
    if (!userIds && !groupIds) {
        for (const u of allUsers) targetUserIds.add(u.identifier);
    }

    let sentCount = 0;
    for (const user of allUsers) {
        if (targetUserIds.size > 0 && !targetUserIds.has(user.identifier)) continue;

        const awaiting = awaitingPerUser.get(user.identifier) ?? { awaitingProvide: [], awaitingApprove: [] };
        const userTransitions = transitionsPerUser.get(user.identifier) ?? [];

        const notifyProvide = await getUserBooleanConfig(db, user.identifier, config.cfgNotifyProvide);
        const notifyApprove = await getUserBooleanConfig(db, user.identifier, config.cfgNotifyApprove);
        const notifyImporting = await getUserBooleanConfig(db, user.identifier, config.cfgNotifyImporting);
        const notifyDone = await getUserBooleanConfig(db, user.identifier, config.cfgNotifyDone);
        const notifyCancelled = await getUserBooleanConfig(db, user.identifier, config.cfgNotifyCancelled);

        const filteredAwaitingProvide = notifyProvide ? awaiting.awaitingProvide : [];
        const filteredAwaitingApprove = notifyApprove ? awaiting.awaitingApprove : [];
        const filteredTransitions = userTransitions.filter((t) => {
            switch (t.newStatus) {
                case "importing": return notifyImporting;
                case "done": return notifyDone;
                case "cancelled": return notifyCancelled;
                default: return false;
            }
        });

        const hasWriteOrApprove = filteredAwaitingProvide.length > 0 || filteredAwaitingApprove.length > 0;
        const hasAnyItems = hasWriteOrApprove || filteredTransitions.length > 0;
        if (!hasAnyItems || !hasWriteOrApprove) continue;
        if (!user.email) continue;

        const awaitingHtml = buildAwaitingTable(filteredAwaitingProvide, filteredAwaitingApprove, baseURL);
        const transitionsHtml = buildTransitionsTable(filteredTransitions, baseURL);

        let body = emailTemplate
            .replace(/\{User\.Firstname\}/g, user.firstName)
            .replace(/\{User\.Lastname\}/g, user.lastName)
            .replace(/\{awaiting\}/g, awaitingHtml)
            .replace(/\{transitions\}/g, transitionsHtml);

        const userSubject = subject
            .replace(/\{User\.Firstname\}/g, user.firstName)
            .replace(/\{User\.Lastname\}/g, user.lastName);

        try {
            await sendEmail(effectiveFrom, user.email, userSubject, body, db);
            sentCount++;
        } catch (e) {
            if (devMode) console.warn(`[notifications] Failed to send to ${user.email}:`, e);
        }
    }

    return sentCount;
}

export async function simulateEmail(
    db: DBClient,
    userId?: string,
    groupId?: string,
): Promise<{ html: string; subject: string; simulatedFor: { type: string; identifier: string; name: string } } | { error: string }> {
    const subject = await getGlobalStringConfig(db, config.cfgSubject);
    const emailTemplate = await getGlobalStringConfig(db, config.cfgEmailTemplate);
    const baseURL = await getGlobalStringConfig(db, config.cfgBaseURL);

    const lastDigestAt = await getGlobalStringConfig(db, config.cfgLastDigestAt);
    const transitions = lastDigestAt
        ? await getTransitionedProductRequests(db, lastDigestAt)
        : [];
    const transitionsPerUser = transitions.length > 0
        ? await getTransitionsPerUser(db, transitions)
        : new Map<string, TransitionItem[]>();
    const awaitingPerUser = await getAwaitingPerUser(db);

    let simUserId: string;
    let simFirstName: string;
    let simLastName: string;
    let simType: string;
    let simName: string;

    if (userId) {
        const { User } = await import("@/schema/UserSchema.ts");
        const { eq } = await import("drizzle-orm");
        const userRows = await db.select().from(User).where(eq(User.identifier, userId)).limit(1);
        if (userRows.length === 0) return { error: "User not found" };
        simUserId = userId;
        simFirstName = userRows[0]!.firstName;
        simLastName = userRows[0]!.lastName;
        simType = "user";
        simName = `${simFirstName} ${simLastName}`;
    } else if (groupId) {
        const { Group } = await import("@/schema/UserSchema.ts");
        const { eq } = await import("drizzle-orm");
        const groupRows = await db.select().from(Group).where(eq(Group.identifier, groupId)).limit(1);
        if (groupRows.length === 0) return { error: "Group not found" };
        simUserId = `group:${groupId}`;
        simFirstName = `Member of ${groupRows[0]!.groupName}`;
        simLastName = "";
        simType = "group";
        simName = groupRows[0]!.groupName;
    } else {
        return { error: "Either userId or groupId must be provided" };
    }

    const awaiting = awaitingPerUser.get(simUserId) ?? { awaitingProvide: [], awaitingApprove: [] };
    const userTransitions = transitionsPerUser.get(simUserId) ?? [];

    let notifyProvide = true, notifyApprove = true, notifyImporting = true, notifyDone = true, notifyCancelled = true;
    if (userId) {
        notifyProvide = await getUserBooleanConfig(db, userId, config.cfgNotifyProvide);
        notifyApprove = await getUserBooleanConfig(db, userId, config.cfgNotifyApprove);
        notifyImporting = await getUserBooleanConfig(db, userId, config.cfgNotifyImporting);
        notifyDone = await getUserBooleanConfig(db, userId, config.cfgNotifyDone);
        notifyCancelled = await getUserBooleanConfig(db, userId, config.cfgNotifyCancelled);
    }

    const filteredAwaitingProvide = notifyProvide ? awaiting.awaitingProvide : [];
    const filteredAwaitingApprove = notifyApprove ? awaiting.awaitingApprove : [];
    const filteredTransitions = userTransitions.filter((t) => {
        switch (t.newStatus) {
            case "importing": return notifyImporting;
            case "done": return notifyDone;
            case "cancelled": return notifyCancelled;
            default: return false;
        }
    });

    const awaitingHtml = buildAwaitingTable(filteredAwaitingProvide, filteredAwaitingApprove, baseURL);
    const transitionsHtml = buildTransitionsTable(filteredTransitions, baseURL);

    const body = emailTemplate
        .replace(/\{User\.Firstname\}/g, simFirstName)
        .replace(/\{User\.Lastname\}/g, simLastName)
        .replace(/\{awaiting\}/g, awaitingHtml)
        .replace(/\{transitions\}/g, transitionsHtml);

    const userSubject = subject
        .replace(/\{User\.Firstname\}/g, simFirstName)
        .replace(/\{User\.Lastname\}/g, simLastName);

    return {
        html: body,
        subject: userSubject,
        simulatedFor: {
            type: simType,
            identifier: userId || groupId!,
            name: simName,
        },
    };
}

export async function init(db: DBClient) {
    for (const entry of Object.values(config)) {
        const existing = await getConfigEntriesByKey(db, entry.domain, entry.key, { limit: 1 });
        if (existing.length < 1) await upsertConfigEntry(db, entry);
    }

    const { enabled, cronExpr } = await readConfig(db);
    if (!enabled || !cronExpr) {
        if (devMode) console.log("[notifications] Not started: disabled or missing schedule");
        return;
    }

    try {
        new Cron(cronExpr, () => {
            void sendDigest(db);
        }, { name: "Notification digest" });
        if (devMode) console.log(`[notifications] Started with schedule: ${cronExpr}`);
    } catch (e) {
        if (devMode) console.warn("[notifications] Invalid CRON expression:", e);
    }
}
