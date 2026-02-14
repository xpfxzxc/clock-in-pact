/** 结算确认请求 */
export interface ConfirmSettlementRequest {
  goalId: number;
}

/** 结算确认响应 */
export interface ConfirmSettlementResponse {
  goalId: number;
  /** 是否已完成归档（全体监督者确认 + 无待审核打卡） */
  archived: boolean;
}

/** 单个挑战者的结算结果 */
export interface ChallengerSettlementResult {
  memberId: number;
  userId: number;
  nickname: string;
  /** 累计完成数值（CONFIRMED + AUTO_APPROVED） */
  completedValue: number;
  /** 完成百分比 */
  percentage: number;
  /** 是否达标 */
  achieved: boolean;
  /** 达标后解锁的新最长周期（月），仅达标者有值 */
  unlockedMaxMonths?: number;
}

/** 结算结果响应 */
export interface SettlementResultResponse {
  goal: {
    id: number;
    name: string;
    category: string;
    targetValue: number;
    unit: string;
    startDate: string;
    endDate: string;
    rewardPunishment: string;
    status: string;
  };
  /** 各挑战者的结算结果 */
  results: ChallengerSettlementResult[];
  /** 结算确认进度 */
  settlementProgress: {
    confirmed: number;
    total: number;
    confirmations: SettlementConfirmationInfo[];
  };
  /** 是否还有待审核打卡 */
  hasPendingCheckins: boolean;
}

/** 结算确认信息 */
export interface SettlementConfirmationInfo {
  memberId: number;
  userId: number;
  nickname: string;
  confirmed: boolean;
  confirmedAt?: string;
}
