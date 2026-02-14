export interface ChallengerSettlementResult {
  memberId: number
  userId: number
  nickname: string
  completedValue: number
  percentage: number
  achieved: boolean
  unlockedMaxMonths?: number
}

export interface SettlementConfirmationInfo {
  memberId: number
  userId: number
  nickname: string
  confirmed: boolean
  confirmedAt?: string
}

export interface SettlementResultResponse {
  goal: {
    id: number
    name: string
    category: string
    targetValue: number
    unit: string
    startDate: string
    endDate: string
    rewardPunishment: string
    status: string
  }
  results: ChallengerSettlementResult[]
  settlementProgress: {
    confirmed: number
    total: number
    confirmations: SettlementConfirmationInfo[]
  }
  hasPendingCheckins: boolean
}
