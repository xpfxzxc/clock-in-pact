import type { FeedEventType } from "@prisma/client";

// ── Metadata interfaces for each event type ──

export interface GroupCreatedMeta {
  groupName: string;
}

export interface MemberJoinedMeta {
  role: "CHALLENGER" | "SUPERVISOR";
  inviteCode: string;
}

export interface GoalCreatedMeta {
  goalId: number;
  goalName: string;
}

export interface GoalConfirmedMeta {
  goalId: number;
  goalName: string;
  status: "APPROVED" | "REJECTED";
}

export interface ChangeRequestInitiatedMeta {
  requestId: number;
  goalId: number;
  goalName: string;
  type: "MODIFY" | "CANCEL";
}

export interface ChangeRequestConfirmedMeta {
  requestId: number;
  goalId: number;
  goalName: string;
  type: "MODIFY" | "CANCEL";
  status: "APPROVED" | "REJECTED";
}

export interface CheckinSubmittedMeta {
  checkinId: number;
  checkinDate: string;
  goalId: number;
  goalName: string;
  value: number;
  unit: string;
  evidenceCount: number;
}

export interface ReviewSubmittedMeta {
  checkinId: number;
  checkinDate: string;
  goalId: number;
  goalName: string;
  checkinOwnerNickname: string;
  value: number;
  unit: string;
  evidenceCount: number;
  action: "CONFIRMED" | "DISPUTED";
}

export interface SettlementConfirmedMeta {
  goalId: number;
  goalName: string;
}

export interface GoalStatusChangedMeta {
  goalId: number;
  goalName: string;
  fromStatus: string;
  toStatus: string;
}

export interface GoalAutoApprovedMeta {
  goalId: number;
  goalName: string;
}

export interface ChangeRequestAutoApprovedMeta {
  requestId: number;
  goalId: number;
  goalName: string;
  type: "MODIFY" | "CANCEL";
}

export interface ChallengerAutoEnrolledMeta {
  goalId: number;
  goalName: string;
  challengerNickname: string;
}

export interface GoalConfirmationResetMeta {
  goalId: number;
  goalName: string;
  requestId: number;
}

export interface ChangeRequestResultMeta {
  requestId: number;
  goalId: number;
  goalName: string;
  type: "MODIFY" | "CANCEL";
  result: "APPROVED" | "REJECTED" | "EXPIRED" | "VOIDED";
}

export interface CheckinConfirmedMeta {
  checkinId: number;
  checkinDate: string;
  checkinOwnerNickname: string;
  evidenceCount: number;
  goalId: number;
  goalName: string;
  value: number;
  unit: string;
}

export interface CheckinAutoApprovedMeta {
  checkinId: number;
  checkinDate: string;
  checkinOwnerNickname: string;
  evidenceCount: number;
  goalId: number;
  goalName: string;
  value: number;
  unit: string;
}

export interface SettlementCompletedMeta {
  goalId: number;
  goalName: string;
}

export interface DurationUnlockedMeta {
  goalId: number;
  goalName: string;
  userId: number;
  challengerNickname: string;
  category: string;
  fromMaxMonths: number;
  toMaxMonths: number;
}

// ── Union type for all metadata ──

export type FeedEventMeta =
  | GroupCreatedMeta
  | MemberJoinedMeta
  | GoalCreatedMeta
  | GoalConfirmedMeta
  | ChangeRequestInitiatedMeta
  | ChangeRequestConfirmedMeta
  | CheckinSubmittedMeta
  | ReviewSubmittedMeta
  | SettlementConfirmedMeta
  | GoalStatusChangedMeta
  | GoalAutoApprovedMeta
  | ChangeRequestAutoApprovedMeta
  | ChallengerAutoEnrolledMeta
  | GoalConfirmationResetMeta
  | ChangeRequestResultMeta
  | CheckinConfirmedMeta
  | CheckinAutoApprovedMeta
  | SettlementCompletedMeta
  | DurationUnlockedMeta;

// ── API types ──

export interface FeedEventResponse {
  id: number;
  eventType: FeedEventType;
  actorNickname: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface FeedListResponse {
  events: FeedEventResponse[];
  nextCursor: number | null;
}

export interface CreateFeedEventInput {
  groupId: number;
  eventType: FeedEventType;
  actorId?: number;
  metadata: FeedEventMeta;
}
