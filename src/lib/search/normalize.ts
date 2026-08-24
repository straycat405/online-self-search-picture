import type { SearchCandidate } from "@/lib/search/types";

export function normalizeSourceUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";

  const removableParams = [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "fbclid",
    "gclid",
  ];

  removableParams.forEach((param) => url.searchParams.delete(param));
  url.hostname = url.hostname.toLowerCase();

  if (url.pathname !== "/") {
    url.pathname = url.pathname.replace(/\/+$/, "");
  }

  return url.toString();
}

export function deduplicateCandidates(
  candidates: SearchCandidate[],
): SearchCandidate[] {
  const seen = new Set<string>();

  return candidates.filter((candidate) => {
    const key = normalizeSourceUrl(candidate.sourceUrl);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
