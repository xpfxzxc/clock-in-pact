export type GoalChangeRequestType = "MODIFY" | "CANCEL";
export type GoalChangeRequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED" | "VOIDED";

export interface GoalProposedChanges {
  name?: string;
  category?: string;
  targetValue?: number;
  unit?: string;
  startDate?: string;
  endDate?: string;
  rewardPunishment?: string;
  evidenceRequirement?: string;
}

export interface GoalChangeVoteInfo {
  memberId: number;
  userId: number;
  nickname: string;
  role: string;
  status: string;
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
  myVoteStatus?: string;
  createdAt: string;
}

export interface VoteGoalChangeRequestResponse {
  requestId: number;
  voteStatus: string;
  requestStatus: GoalChangeRequestStatus;
}
