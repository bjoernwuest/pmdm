let loginRedirectInProgress = false;

export function triggerLoginRedirect(): void {
    if (loginRedirectInProgress) return;

    loginRedirectInProgress = true;
    const target = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = `/login?target=${target}`;
}

