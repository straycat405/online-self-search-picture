export type MatchType = "exact" | "partial" | "face";

export type MatchTier = "strong" | "review";

export type SearchCandidate = {
  id: string;
  matchType: MatchType;
  tier: MatchTier;
  sourceUrl: string;
  sourceDomain: string;
  thumbnailUrl: string;
  title: string;
  foundAt: string;
};

export type SearchInput = {
  fileName: string;
  fileSize: number;
  mimeType: string;
  imageBytes?: Uint8Array;
};

export type SearchResponse = {
  jobId: string;
  mode: "mock" | "supabase-mock";
  candidates: SearchCandidate[];
  searchedSources: string[];
  completedAt: string;
};

export type SearchJobCreatedResponse = {
  jobId: string;
  mode: "supabase-pending";
  photoObjectPath: string;
};

export interface SearchProvider {
  readonly name: string;
  search(input: SearchInput): Promise<SearchCandidate[]>;
}
