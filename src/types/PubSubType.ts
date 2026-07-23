// Tag type - simple string identifiers
export type Tag = string;

// Tag-based topic constants
export const TAG_CREATE = "create" as const;
export const TAG_UPDATE = "update" as const;
export const TAG_DELETE = "delete" as const;
export const TAG_GRANT = "grant" as const;
export const TAG_REVOKE = "revoke" as const;
export const TAG_DISABLE = "disable" as const;
export const TAG_ENABLED = "enabled" as const;
export const TAG_LOGIN = "login" as const;
export const TAG_LOGOUT = "logout" as const;
export const TAG_CLEAR = "clear" as const;
export const TAG_UPSERT = "upsert" as const;
export const TAG_BEFORE = "before" as const;
export const TAG_AFTER = "after" as const;

export const TAG_CONFIGENTRY = "ConfigEntry" as const;
export const TAG_USER = "user" as const;
export const TAG_GROUP = "group" as const;
export const TAG_API_KEY = "api_key" as const;
export const TAG_CONFIG = "config" as const;
export const TAG_FUNCTIONAL_PERMISSION = "functional_permission" as const;
export const TAG_AUDIT_ENTRY = "audit_entry" as const;
export const TAG_AUTH_SESSION = "auth_session" as const;
export const TAG_USER_PROFILE_CONFIG = "user_profile_config" as const;

// TagExpression for boolean subscription matching
export type TagExpression =
  | Tag
  | { and: TagExpression[] }
  | { or: TagExpression[] }
  | { not: TagExpression };

// PubSubMessage envelope delivered to subscribers
export interface PubSubMessage {
    tags: Tag[];
    data?: any;
    timestamp: string;
}
