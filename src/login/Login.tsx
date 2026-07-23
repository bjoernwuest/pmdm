import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import * as React from "react";

export default function Login() {
    const [searchParams] = useSearchParams();
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const returnTo = searchParams.get("returnTo") || "/";
    const errorParam = searchParams.get("error");

    useEffect(() => {
        if (errorParam) {
            const errorMessages: Record<string, string> = {
                auth_start_failed: "Failed to start authentication. Please try again.",
                grant_failed: "Authentication failed. Please try again.",
                missing_cookies: "Session expired. Please try again.",
                no_claims: "Authentication error: missing user information.",
                missing_claims: "Authentication error: required claims not provided by identity provider.",
            };
            setError(errorMessages[errorParam] || `Authentication error: ${errorParam}`);
        }
    }, [errorParam]);

    const handleSubmit: React.ComponentProps<"form">["onSubmit"] = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError(null);

        // Submit the form - this will be handled by the server which redirects to OIDC provider
        e.currentTarget.submit();
    };

    return (
        <div className="login-container">
            <h1>Login</h1>

            {error && (
                <div className="login-error">
                    {error}
                </div>
            )}

            <form
                className="login-form"
                method="post"
                action={`/login${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`}
                onSubmit={handleSubmit}
            >
                <input type="hidden" name="returnTo" value={returnTo} />
                <p className="login-description">
                    Click the button below to sign in with your organization account.
                </p>
                <button
                    type="submit"
                    disabled={isSubmitting}
                    className="login-button"
                >
                    {isSubmitting ? "Redirecting..." : "Sign in with EntraID"}
                </button>
            </form>
        </div>
    );
}