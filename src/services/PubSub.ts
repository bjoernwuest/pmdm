/**
 * Tag-based PubSub system with boolean expression matching.
 *
 * Publishing uses tag arrays; subscriptions use TagExpression objects
 * (and/or/not) to declare interest. Matching is order-independent.
 *
 * Compatible with browser and server environments.
 */
import type { Tag, TagExpression, PubSubMessage } from "../types/PubSubType";

type Subscriber = (message: PubSubMessage) => void;
type Token = string;

/**
 * Evaluate a TagExpression against a set of published tags.
 * Short-circuits: 'or' stops at first match; 'and' stops at first non-match.
 */
export function expressionMatches(expr: TagExpression, tags: Set<Tag>): boolean {
    if (typeof expr === "string") return tags.has(expr);
    if ("and" in expr) return (expr.and as TagExpression[]).every((e) => expressionMatches(e, tags));
    if ("or" in expr) return (expr.or as TagExpression[]).some((e) => expressionMatches(e, tags));
    if ("not" in expr) return !expressionMatches(expr.not, tags);
    return false;
}

interface SubscriptionEntry {
    expression: TagExpression;
    token: Token;
    func: Subscriber;
}

class PubSubImpl {
    private subscriptions: SubscriptionEntry[] = [];
    private lastUid = -1;
    private readonly ALL_SUBSCRIBING_MSG = "*";
    public immediateExceptions = false;

    /**
     * Publishes a message asynchronously, delivering to all matching subscribers.
     */
    publish(tags: Tag[], data?: any): boolean {
        return this.doPublish(tags, data, false, this.immediateExceptions);
    }

    /**
     * Publishes a message synchronously, delivering to all matching subscribers.
     */
    publishSync(tags: Tag[], data?: any): boolean {
        return this.doPublish(tags, data, true, this.immediateExceptions);
    }

    /**
     * Subscribes a function to messages matching a TagExpression.
     * Returns a unique token for unsubscribing, or false if func is not a function.
     */
    subscribe(expression: TagExpression, func: Subscriber): Token | false {
        if (typeof func !== "function") {
            return false;
        }

        const token = `uid_${++this.lastUid}`;
        this.subscriptions.push({ expression, token, func });
        return token;
    }

    /**
     * Subscribes to all messages regardless of tags.
     */
    subscribeAll(func: Subscriber): Token | false {
        if (typeof func !== "function") return false;
        return this.subscribe(this.ALL_SUBSCRIBING_MSG, func);
    }

    /**
     * Subscribes to a message once, then auto-unsubscribes after the first match.
     */
    subscribeOnce(expression: TagExpression, func: Subscriber): this {
        const token = this.subscribe(expression, (msg: PubSubMessage) => {
            this.unsubscribe(token as Token);
            func(msg);
        });
        return this;
    }

    /**
     * Unsubscribes by token, function reference, or TagExpression.
     */
    unsubscribe(value: Token | Subscriber | TagExpression): boolean | void {
        const isToken = typeof value === "string";
        const isFunction = typeof value === "function";

        if (isToken) {
            const idx = this.subscriptions.findIndex((s) => s.token === value);
            if (idx >= 0) {
                this.subscriptions.splice(idx, 1);
                return true;
            }
            return false;
        }

        if (isFunction) {
            const before = this.subscriptions.length;
            this.subscriptions = this.subscriptions.filter((s) => s.func !== value);
            return before !== this.subscriptions.length;
        }

        // value is a TagExpression
        this.clearSubscriptions(value);
    }

    /**
     * Clears all subscriptions.
     */
    clearAllSubscriptions(): void {
        this.subscriptions = [];
    }

    /**
     * Clears subscriptions matching the given TagExpression.
     * Uses structural comparison (JSON.stringify) for deep equality.
     */
    clearSubscriptions(expression: TagExpression): void {
        const exprStr = JSON.stringify(expression);
        this.subscriptions = this.subscriptions.filter(
            (s) => JSON.stringify(s.expression) !== exprStr,
        );
    }

    /**
     * Counts subscriptions for a given TagExpression.
     */
    countSubscriptions(expression: TagExpression): number {
        const exprStr = JSON.stringify(expression);
        return this.subscriptions.filter((s) => JSON.stringify(s.expression) === exprStr).length;
    }

    /**
     * Gets all subscription expressions matching a given expression.
     * Uses structural comparison for deep equality.
     */
    getSubscriptions(expression: TagExpression): TagExpression[] {
        const exprStr = JSON.stringify(expression);
        return this.subscriptions
            .filter((s) => JSON.stringify(s.expression) === exprStr)
            .map((s) => s.expression);
    }

    // Private helper methods

    private doPublish(
        tags: Tag[],
        data: any,
        sync: boolean,
        immediateExceptions: boolean,
    ): boolean {
        const message: PubSubMessage = {
            tags,
            data,
            timestamp: new Date().toISOString(),
        };

        const deliver = () => {
            const tagSet = new Set(tags);
            for (const sub of this.subscriptions) {
                if (this.expressionMatchesEntry(sub.expression, tagSet)) {
                    if (immediateExceptions) {
                        sub.func(message);
                    } else {
                        try {
                            sub.func(message);
                        } catch (ex) {
                            setTimeout(() => {
                                throw ex;
                            }, 0);
                        }
                    }
                }
            }
        };

        const hasSubscribers = this.subscriptions.length > 0;
        if (!hasSubscribers) return false;

        if (sync) {
            deliver();
        } else {
            setTimeout(deliver, 0);
        }

        return true;
    }

    private expressionMatchesEntry(expr: TagExpression, tagSet: Set<Tag>): boolean {
        // Special case: ALL_SUBSCRIBING_MSG matches everything
        if (typeof expr === "string" && expr === this.ALL_SUBSCRIBING_MSG) return true;
        return expressionMatches(expr, tagSet);
    }
}

// Create singleton instance
const PubSub = new PubSubImpl();

// Export for both ESM and CommonJS compatibility
export default PubSub;
export { PubSub };
