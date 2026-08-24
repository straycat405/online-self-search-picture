import type { NormalizedRegion } from "@/lib/redaction/geometry";

export type PrivacyCandidateKind =
  | "email"
  | "phone"
  | "url"
  | "account"
  | "address"
  | "identifier"
  | "secret"
  | "text";

export type PrivacyCandidate = {
  id: string;
  kind: PrivacyCandidateKind;
  label: string;
  text: string;
  suggested: boolean;
  region: NormalizedRegion;
};

export type PrivacyScanResponse = {
  candidates: PrivacyCandidate[];
  processedBy: "google-cloud-vision";
  retained: false;
};
