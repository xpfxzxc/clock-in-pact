import type { CheckinStatus } from "@prisma/client";

export interface CreateCheckinInput {
  goalId: number;
  checkinDate: string; // YYYY-MM-DD
  value: number;
  note?: string;
}

export interface ReviewCheckinInput {
  action: "CONFIRMED" | "DISPUTED";
  reason?: string;
}

export interface CheckinEvidenceResponse {
  id: number;
  filePath: string;
  fileSize: number;
}

export interface CheckinReviewInfo {
  memberId: number;
  reviewerNickname: string;
  action: "CONFIRMED" | "DISPUTED";
  reason: string | null;
  createdAt: string;
}

export interface CheckinResponse {
  id: number;
  goalId: number;
  memberId: number;
  checkinDate: string;
  value: number;
  note: string | null;
  status: CheckinStatus;
  evidence: CheckinEvidenceResponse[];
  reviews: CheckinReviewInfo[];
  myReviewAction?: "CONFIRMED" | "DISPUTED" | null;
  createdByNickname: string;
  createdAt: string;
}

export interface ReviewCheckinResponse {
  checkinId: number;
  action: "CONFIRMED" | "DISPUTED";
  checkinStatus: CheckinStatus;
}

export interface CheckinListResponse {
  checkins: CheckinResponse[];
  total: number;
}
