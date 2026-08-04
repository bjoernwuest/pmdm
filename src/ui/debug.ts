let _enabled = false;

export function setDebugFrontend(enabled: boolean): void {
    _enabled = enabled;
}

export function debugLog(module: string, ...args: unknown[]): void {
    if (_enabled) console.log(`[DEBUG:${module}]`, ...args);
}
