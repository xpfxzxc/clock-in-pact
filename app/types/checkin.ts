export type CheckinStatus = "PENDING_REVIEW" | "CONFIRMED" | "DISPUTED" | "AUTO_APPROVED";

export type CheckinReviewAction = "CONFIRMED" | "DISPUTED";

export interface CheckinEvidenceResponse {
  id: number;
  filePath: string;
  fileSize: number;
}

export interface CheckinReviewInfo {
  memberId: number;
  reviewerNickname: string;
  action: CheckinReviewAction;
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
  myReviewAction?: CheckinReviewAction | null;
  createdByNickname: string;
  createdAt: string;
}

export interface ReviewCheckinResponse {
  checkinId: number;
  action: CheckinReviewAction;
  checkinStatus: CheckinStatus;
}

export interface CheckinListResponse {
  checkins: CheckinResponse[];
  total: number;
}
