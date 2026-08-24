type TurnstileResponse = {
  success?: unknown;
  action?: unknown;
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
    return result.success === true && result.action === "privacy-scan";
  } catch {
    return false;
  }
}
