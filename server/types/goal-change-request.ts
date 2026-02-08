import type { ConfirmationStatus, MemberRole } from "@prisma/client";

export type GoalChangeRequestType = "MODIFY" | "CANCEL";
export type GoalChangeRequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED" | "VOIDED";

export interface GoalProposedChanges {
  name?: string;
  category?: string;
  targetValue?: number;
  unit?: string;
  startDate?: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
  rewardPunishment?: string;
  evidenceRequirement?: string;
}

export interface CreateGoalChangeRequestRequest {
  goalId: number;
  type: "MODIFY" | "CANCEL";
  proposedChanges?: GoalProposedChanges;
}

export interface GoalChangeVoteInfo {
  memberId: number;
  userId: number;
  nickname: string;
  role: MemberRole;
  status: ConfirmationStatus;
  updatedAt: string;
}

export interface GoalChangeRequestResponse {
  id: number;
  goalId: number;
  type: GoalChangeRequestType;
  status: GoalChangeRequestStatus;
  initiatorId: number;
  initiatorNickname: string;
  proposedChanges: GoalProposedChanges | null;
  expiresAt: string;
  effectiveExpiresAt: string;
  votes: GoalChangeVoteInfo[];
  myVoteStatus?: ConfirmationStatus;
  createdAt: string;
}

export interface VoteGoalChangeRequestRequest {
  status: "APPROVED" | "REJECTED";
}

export interface VoteGoalChangeRequestResponse {
  requestId: number;
  voteStatus: ConfirmationStatus;
  requestStatus: GoalChangeRequestStatus;
}
