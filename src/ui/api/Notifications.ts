import { apiGet, apiPut, apiPost } from "./index.ts";
import type { ApiError } from "./errors.ts";

export interface NotificationConfigEntry {
    domain: string;
    key: string;
    description: string | null;
    type: string;
    value: unknown;
    inputFormat: string;
    outputFormat: string;
    userProfile: boolean;
    updatedAt: string;
}

export interface SimulateResult {
    html: string;
    subject: string;
    simulatedFor: {
        type: string;
        identifier: string;
        name: string;
    };
}

export async function getNotificationConfig(): Promise<NotificationConfigEntry[]> {
    return apiGet<NotificationConfigEntry[]>("/api/notifications/config");
}

export async function updateNotificationConfig(
    key: string,
    value: unknown,
    knownUpdatedAt: string,
): Promise<NotificationConfigEntry> {
    return apiPut<NotificationConfigEntry>(
        `/api/notifications/config/${encodeURIComponent(key)}`,
        { value, knownUpdatedAt },
    );
}

export async function sendNotifications(userIds?: string[], groupIds?: string[]): Promise<{ sentTo: number }> {
    return apiPost<{ sentTo: number }>("/api/notifications/send", { userIds, groupIds });
}

export async function simulateNotification(userId?: string, groupId?: string): Promise<SimulateResult | { error: string }> {
    return apiPost<SimulateResult | { error: string }>("/api/notifications/simulate", { userId, groupId });
}

export async function fetchUsers(): Promise<{ identifier: string; firstName: string; lastName: string; email: string | null }[]> {
    return apiGet<{ identifier: string; firstName: string; lastName: string; email: string | null }[]>("/api/notifications/users");
}

export async function fetchGroups(): Promise<{ identifier: string; groupName: string }[]> {
    return apiGet<{ identifier: string; groupName: string }[]>("/api/notifications/groups");
}
