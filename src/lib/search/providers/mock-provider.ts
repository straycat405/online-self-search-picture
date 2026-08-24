import type {
  SearchCandidate,
  SearchInput,
  SearchProvider,
} from "@/lib/search/types";

const MOCK_THUMBNAILS = [
  "/mock/profile-blue.svg",
  "/mock/profile-warm.svg",
  "/mock/profile-neutral.svg",
];

export class MockSearchProvider implements SearchProvider {
  readonly name = "mock";
  readonly mode = "mock";
  readonly searchedSources = ["동일 이미지 검색 데모", "크롭·부분 일치 검색 데모"];

  async search(input: SearchInput): Promise<SearchCandidate[]> {
    if (!input.mimeType.startsWith("image/")) {
      throw new Error("이미지 파일만 검색할 수 있습니다.");
    }

    await new Promise((resolve) => setTimeout(resolve, 900));

    return [
      {
        id: "mock-exact-1",
        matchType: "exact",
        tier: "strong",
        sourceUrl: "https://example.com/photo/one",
        sourceDomain: "example.com",
        thumbnailUrl: MOCK_THUMBNAILS[0],
        title: "공개 프로필 이미지",
        foundAt: "2026-08-24T10:00:00.000Z",
      },
      {
        id: "mock-partial-1",
        matchType: "partial",
        tier: "strong",
        sourceUrl: "https://sample.blog/post/two",
        sourceDomain: "sample.blog",
        thumbnailUrl: MOCK_THUMBNAILS[1],
        title: "블로그 게시물의 이미지",
        foundAt: "2026-08-24T10:00:00.000Z",
      },
      {
        id: "mock-partial-2",
        matchType: "partial",
        tier: "review",
        sourceUrl: "https://news.example.org/article/three",
        sourceDomain: "news.example.org",
        thumbnailUrl: MOCK_THUMBNAILS[2],
        title: "확인이 필요한 공개 이미지",
        foundAt: "2026-08-24T10:00:00.000Z",
      },
    ];
  }
}
