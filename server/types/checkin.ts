import type { CheckinStatus } from "@prisma/client";

export interface CreateCheckinInput {
  goalId: number;
  checkinDate: string; // YYYY-MM-DD
  value: number;
  note?: string;
}

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
