/** 单个挑战者的进度统计 */
export interface ChallengerProgress {
  memberId: number;
  userId: number;
  nickname: string;
  completedValue: number;
  percentage: number;
  remainingValue: number;
  pendingReviewCount: number;
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
  date: string;
  confirmedValue: number;
  pendingValue: number;
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
    startDate: string;
    endDate: string;
    status: string;
  };
  remainingDays: number;
  totalPendingReviewCount: number;
  totalDisputedCount: number;
  myRole: "CHALLENGER" | "SUPERVISOR";
  myMemberId: number;
  myProgress: ChallengerProgress | null;
  leaderboard: LeaderboardEntry[];
  contributions: ChallengerContribution[];
}
