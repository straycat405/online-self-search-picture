type TurnstileResponse = {
  success?: unknown;
  action?: unknown;
  hostname?: unknown;
  "error-codes"?: unknown;
};

export async function verifyTurnstileToken(
  secret: string,
  token: string,
  fetcher: typeof fetch = fetch,
) {
  if (!secret.trim() || !token.trim()) return false;
  try {
    const body = new URLSearchParams({ secret, response: token });
    const response = await fetcher(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body,
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!response.ok) return false;
    const result = (await response.json()) as TurnstileResponse;
    const verified = result.success === true && result.action === "privacy-scan";
    if (!verified) {
      console.warn("Turnstile verification rejected", {
        action: result.action,
        hostname: result.hostname,
        errorCodes: result["error-codes"],
      });
    }
    return verified;
  } catch {
    return false;
  }
}
