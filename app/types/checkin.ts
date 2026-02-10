export type CheckinStatus = "PENDING_REVIEW" | "CONFIRMED" | "DISPUTED" | "AUTO_APPROVED";

export interface CheckinEvidenceResponse {
  id: number;
  filePath: string;
  fileSize: number;
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
  createdByNickname: string;
  createdAt: string;
}

export interface CheckinListResponse {
  checkins: CheckinResponse[];
  total: number;
}
