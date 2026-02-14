export type FeedEventType =
  | "GROUP_CREATED"
  | "MEMBER_JOINED"
  | "GOAL_CREATED"
  | "GOAL_CONFIRMED"
  | "CHANGE_REQUEST_INITIATED"
  | "CHANGE_REQUEST_CONFIRMED"
  | "CHECKIN_SUBMITTED"
  | "REVIEW_SUBMITTED"
  | "SETTLEMENT_CONFIRMED"
  | "GOAL_STATUS_CHANGED"
  | "GOAL_AUTO_APPROVED"
  | "CHANGE_REQUEST_AUTO_APPROVED"
  | "CHALLENGER_AUTO_ENROLLED"
  | "GOAL_CONFIRMATION_RESET"
  | "CHANGE_REQUEST_RESULT"
  | "CHECKIN_CONFIRMED"
  | "CHECKIN_AUTO_APPROVED"
  | "SETTLEMENT_COMPLETED"
  | "DURATION_UNLOCKED";

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
