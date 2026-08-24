# online-self-search-picture

대한민국 성인이 본인 사진 한 장으로 공개 인터넷의 동일·부분 일치 이미지를 확인하는 저가형 자동 셀프검색 MVP입니다.

Supabase의 비공개 업로드·자동 삭제 흐름과 Google Cloud Vision Web Detection 공급자 어댑터가 구현되어 있습니다. API 키가 없거나 `SEARCH_PROVIDER=mock`이면 mock 데모로 실행됩니다.

## 시작하기

```bash
pnpm install
pnpm dev
```

브라우저에서 `http://localhost:3000`을 엽니다.

## 검증 명령

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## 현재 범위

- 모바일 중심 랜딩 페이지
- 본인·성인 확인
- 로컬 사진 선택과 미리보기
- Google Web Detection 또는 mock 검색 공급자
- 검색 진행 상태
- 동일·크롭·부분 일치 후보 결과
- 사용자 결과 관련성 판정
- 검색 범위와 한계 안내

Google 공급자는 완전 일치, 부분 일치, 일치 이미지가 포함된 웹페이지만 결과로 사용합니다. 시각적으로 비슷한 이미지는 오탐 방지를 위해 제외합니다. 검색 사진은 비공개 Storage에서 서버 메모리로 읽어 공급자에게 전달하고 검색 직후 삭제합니다.

```dotenv
SEARCH_PROVIDER=google-web
GOOGLE_CLOUD_VISION_API_KEY=server_only_api_key
```

API 키는 서버 환경변수로만 설정하며 `NEXT_PUBLIC_` 접두사를 사용하지 않습니다.

## 다음 단계

1. Google Web Detection 한국 웹 커버리지 벤치마크
2. Google Cloud 프로젝트별 월 사용량·예산 알림 설정
3. CAPTCHA와 공개 베타 횟수 제한
4. 토스페이먼츠 테스트 결제
5. 비공개 베타 전 개인정보 처리 문구 검토

## 관련 문서

- `개인_온라인_사진_셀프검색_서비스_기획서_v0.3.md`
- `온라인_사진_셀프검색_MVP_설계_v0.1.md`
- `모두의_창업_신청서_초안_v0.2.md`
