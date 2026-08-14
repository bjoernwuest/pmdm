// noinspection JSUnusedGlobalSymbols
import { syncServerSentEventExpressions } from "@/ui/api/index.ts";
import type { Tag, TagExpression, PubSubMessage } from "../types/PubSubType";
import { expressionMatches } from "../services/PubSub";

type Subscriber = (message: PubSubMessage) => void;
type Token = string;

/**
 * Canonical serialization of a TagExpression for structural comparison: object
 * keys are sorted before stringification so two semantically identical
 * expressions compare equal regardless of property order.
 */
function canonicalizeExpression(expression: TagExpression): string {
    const canonicalize = (value: unknown): unknown => {
        if (Array.isArray(value)) return value.map(canonicalize);
        if (value && typeof value === "object") {
            const obj = value as Record<string, unknown>;
            return Object.keys(obj).sort().reduce<Record<string, unknown>>((acc, key) => {
                acc[key] = canonicalize(obj[key]);
                return acc;
            }, {});
        }
        return value;
    };
    return JSON.stringify(canonicalize(expression));
}

interface SubscriptionEntry {
    expression: TagExpression;
    token: Token;
    func: Subscriber;
}

class ClientPubSubImpl {
    private subscriptions: SubscriptionEntry[] = [];
    private lastUid = -1;
    private readonly ALL_SUBSCRIBING_MSG = "*";
    private syncTimer: ReturnType<typeof setTimeout> | null = null;
    private syncInFlight: Promise<void> | null = null;
    private syncPending = false;

    publish(tags: Tag[], data?: unknown): boolean {
        return this.doPublish(tags, data, false);
    }

    publishSync(tags: Tag[], data?: unknown): boolean {
        return this.doPublish(tags, data, true);
    }

    subscribe(expression: TagExpression, func: Subscriber): Token | false {
        if (typeof func !== "function") return false;

        const token = `uid_${++this.lastUid}`;
        this.subscriptions.push({ expression, token, func });
        this.scheduleServerExpressionSync();
        return token;
    }

    subscribeAll(func: Subscriber): Token | false {
        if (typeof func !== "function") return false;
        return this.subscribe(this.ALL_SUBSCRIBING_MSG, func);
    }

    subscribeOnce(expression: TagExpression, func: Subscriber): Token | false {
        const token = this.subscribe(expression, (msg: PubSubMessage) => {
            if (typeof token === "string") this.unsubscribe(token);
            func(msg);
        });
        return token;
    }

    unsubscribe(value: Token | Subscriber | TagExpression): boolean | void {
        const isToken = typeof value === "string";
        const isFunction = typeof value === "function";

        if (isToken) {
            const idx = this.subscriptions.findIndex((s) => s.token === value);
            if (idx >= 0) {
                this.subscriptions.splice(idx, 1);
                this.scheduleServerExpressionSync();
                return true;
            }
            return false;
        }

        if (isFunction) {
            const before = this.subscriptions.length;
            this.subscriptions = this.subscriptions.filter((s) => s.func !== value);
            const changed = before !== this.subscriptions.length;
            if (changed) this.scheduleServerExpressionSync();
            return changed;
        }

        // value is a TagExpression
        this.clearSubscriptions(value);
        this.scheduleServerExpressionSync();
    }

    clearAllSubscriptions(): void {
        this.subscriptions = [];
        this.scheduleServerExpressionSync();
    }

    clearSubscriptions(expression: TagExpression): void {
        const exprStr = canonicalizeExpression(expression);
        this.subscriptions = this.subscriptions.filter(
            (s) => canonicalizeExpression(s.expression) !== exprStr,
        );
    }

    getServerExpressions(): (TagExpression | string)[] {
        // If there are any subscribeAll subscribers, return ["*"] to signal wildcard
        if (this.subscriptions.some((s) => typeof s.expression === "string" && s.expression === this.ALL_SUBSCRIBING_MSG)) {
            return [this.ALL_SUBSCRIBING_MSG];
        }

        // Deduplicate by JSON serialization
        const seen = new Set<string>();
        const result: TagExpression[] = [];
        for (const sub of this.subscriptions) {
            const key = canonicalizeExpression(sub.expression);
            if (!seen.has(key) && sub.expression !== this.ALL_SUBSCRIBING_MSG) {
                seen.add(key);
                result.push(sub.expression);
            }
        }

        return result;
    }

    getActiveServerExpressions(): (TagExpression | string)[] {
        return this.getServerExpressions();
    }

    private doPublish(tags: Tag[], data: unknown, sync: boolean): boolean {
        const message: PubSubMessage = {
            tags,
            data,
            timestamp: new Date().toISOString(),
        };

        const deliver = () => {
            const tagSet = new Set(tags);
            for (const sub of this.subscriptions) {
                if (this.expressionMatchesEntry(sub.expression, tagSet)) {
                    try {
                        sub.func(message);
                    } catch (error) {
                        setTimeout(() => {
                            throw error;
                        }, 0);
                    }
                }
            }
        };

        if (this.subscriptions.length === 0) return false;

        if (sync) {
            deliver();
        } else {
            setTimeout(deliver, 0);
        }

        return true;
    }

    private expressionMatchesEntry(expr: TagExpression, tagSet: Set<Tag>): boolean {
        if (typeof expr === "string" && expr === this.ALL_SUBSCRIBING_MSG) return true;
        return expressionMatches(expr, tagSet);
    }

    private scheduleServerExpressionSync(): void {
        if (this.syncTimer !== null) clearTimeout(this.syncTimer);
        this.syncTimer = setTimeout(() => {
            this.syncTimer = null;
            const expressions = this.getServerExpressions();
            if (this.syncInFlight) {
                this.syncPending = true;
                return;
            }

            this.syncInFlight = syncServerSentEventExpressions(expressions)
                .catch(() => undefined)
                .finally(() => {
                    this.syncInFlight = null;
                    if (this.syncPending) {
                        this.syncPending = false;
                        this.scheduleServerExpressionSync();
                    }
                });
        }, 50);
    }
}

const ClientPubSub = new ClientPubSubImpl();

export function publish(tags: Tag[], data?: unknown): boolean {
    return ClientPubSub.publish(tags, data);
}

export function publishSync(tags: Tag[], data?: unknown): boolean {
    return ClientPubSub.publishSync(tags, data);
}

export function subscribe(expression: TagExpression, func: Subscriber): Token | false {
    return ClientPubSub.subscribe(expression, func);
}

export function subscribeAll(func: Subscriber): Token | false {
    return ClientPubSub.subscribeAll(func);
}

export function subscribeOnce(expression: TagExpression, func: Subscriber): Token | false {
    return ClientPubSub.subscribeOnce(expression, func);
}

export function unsubscribe(value: Token | Subscriber | TagExpression): boolean | void {
    return ClientPubSub.unsubscribe(value);
}

export function clearAllSubscriptions(): void {
    ClientPubSub.clearAllSubscriptions();
}

export function getActiveServerExpressions(): (TagExpression | string)[] {
    return ClientPubSub.getActiveServerExpressions();
}
