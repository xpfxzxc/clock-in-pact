export type GoalStatus =
  | "PENDING"
  | "UPCOMING"
  | "ACTIVE"
  | "SETTLING"
  | "ARCHIVED"
  | "VOIDED"
  | "CANCELLED";

export type ConfirmationStatus = "PENDING" | "APPROVED" | "REJECTED";

export type MemberRole = "CHALLENGER" | "SUPERVISOR";

import type { GoalChangeRequestResponse } from "./goal-change-request";

export interface CreateGoalRequest {
  groupId: number;
  name: string;
  category: string;
  targetValue: number;
  unit: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  rewardPunishment: string;
  evidenceRequirement: string;
}

export interface GoalResponse {
  id: number;
  groupId: number;
  name: string;
  category: string;
  targetValue: number;
  unit: string;
  startDate: string;
  endDate: string;
  rewardPunishment: string;
  evidenceRequirement: string;
  status: GoalStatus;
  createdById: number;
  createdAt: string;
}

export interface GoalDetailResponse extends GoalResponse {
  createdBy: {
    id: number;
    nickname: string;
  };
  confirmations: GoalConfirmationInfo[];
  participants: GoalParticipantInfo[];
  myConfirmationStatus?: ConfirmationStatus;
  isParticipant?: boolean;
  myRole?: MemberRole;
  activeChangeRequest?: GoalChangeRequestResponse | null;
}

export interface GoalConfirmationInfo {
  memberId: number;
  userId: number;
  nickname: string;
  role: string;
  status: ConfirmationStatus;
  updatedAt: string;
}

export interface GoalParticipantInfo {
  memberId: number;
  userId: number;
  nickname: string;
}

export interface ConfirmGoalRequest {
  goalId: number;
  status: "APPROVED" | "REJECTED";
}

export interface ConfirmGoalResponse {
  goalId: number;
  status: ConfirmationStatus;
  goalStatus: GoalStatus;
}

export interface DurationLimitResponse {
  groupId: number;
  category: string;
  maxAllowedMonths: number;
  challengerLimits: {
    userId: number;
    nickname: string;
    completionCount: number;
    maxAllowedMonths: number;
  }[];
}
