import { GoogleWebSearchProvider } from "@/lib/search/providers/google-web-provider";
import { MockSearchProvider } from "@/lib/search/providers/mock-provider";
import type { SearchProvider } from "@/lib/search/types";

export function createSearchProvider(): SearchProvider {
  const selectedProvider = process.env.SEARCH_PROVIDER?.trim() || "mock";

  if (selectedProvider === "mock") return new MockSearchProvider();
  if (selectedProvider === "google-web") {
    return new GoogleWebSearchProvider(
      process.env.GOOGLE_CLOUD_VISION_API_KEY?.trim() ?? "",
    );
  }

  throw new Error(`Unsupported search provider: ${selectedProvider}`);
}
