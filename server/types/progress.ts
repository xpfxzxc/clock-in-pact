import type { CheckinStatus } from "@prisma/client";

/** 单个挑战者的进度统计 */
export interface ChallengerProgress {
  memberId: number;
  userId: number;
  nickname: string;
  /** 累计完成数值（只计 CONFIRMED + AUTO_APPROVED） */
  completedValue: number;
  /** 目标达成百分比（允许超过 100） */
  percentage: number;
  /** 剩余数值（超额完成时为 0） */
  remainingValue: number;
  /** 自己的待审核数量 */
  pendingReviewCount: number;
  /** 自己的质疑数量 */
  disputedCount: number;
}

/** 排行榜条目 */
export interface LeaderboardEntry {
  rank: number;
  memberId: number;
  userId: number;
  nickname: string;
  completedValue: number;
  percentage: number;
}

/** 贡献图中每天的数据 */
export interface ContributionDay {
  date: string; // YYYY-MM-DD
  /** 已确认 + 自动通过的数值 */
  confirmedValue: number;
  /** 待审核的数值 */
  pendingValue: number;
  /** 质疑的数值 */
  disputedValue: number;
}

/** 单个挑战者的贡献图数据 */
export interface ChallengerContribution {
  memberId: number;
  userId: number;
  nickname: string;
  days: ContributionDay[];
}

/** 进度 API 完整响应 */
export interface ProgressResponse {
  goal: {
    id: number;
    name: string;
    category: string;
    targetValue: number;
    unit: string;
    startDate: string; // YYYY-MM-DD
    endDate: string; // YYYY-MM-DD
    status: string;
  };
  /** 剩余天数（以小组时区判定，从当天到结束日期） */
  remainingDays: number;
  /** 全员待审核数量 */
  totalPendingReviewCount: number;
  /** 全员质疑数量 */
  totalDisputedCount: number;
  /** 当前用户角色 */
  myRole: "CHALLENGER" | "SUPERVISOR";
  /** 当前用户的 memberId */
  myMemberId: number;
  /** 当前用户的进度（仅挑战者有值） */
  myProgress: ChallengerProgress | null;
  /** 排行榜 */
  leaderboard: LeaderboardEntry[];
  /** 所有挑战者的贡献图数据 */
  contributions: ChallengerContribution[];
}
