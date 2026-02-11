<script setup lang="ts">
import type { ConfirmGoalResponse, GoalDetailResponse } from '~/types/goal'
import type { GoalChangeRequestResponse, VoteGoalChangeRequestResponse } from '~/types/goal-change-request'
import type { CheckinListResponse, ReviewCheckinResponse } from '~/types/checkin'

definePageMeta({
  middleware: 'auth',
})

const route = useRoute()
const groupId = Number(route.params.id)
const goalId = Number(route.params.goalId)

const { data: goal, refresh, error } = await useFetch<GoalDetailResponse>(`/api/goals/${goalId}`)

const { data: checkinList, refresh: refreshCheckins } = await useFetch<CheckinListResponse>(
  `/api/goals/${goalId}/checkins`,
  { default: () => ({ checkins: [], total: 0 }) },
)

useHead({
  title: computed(() => goal.value ? `${goal.value.name} - 打卡契约` : '目标详情 - 打卡契约'),
})

const isConfirming = ref(false)
const confirmError = ref('')

async function handleConfirm(status: 'APPROVED' | 'REJECTED') {
  isConfirming.value = true
  confirmError.value = ''

  try {
    const result = await $fetch<ConfirmGoalResponse>(`/api/goals/${goalId}/confirm`, {
      method: 'POST',
      body: { status },
    })

    await refresh()

    if (result.goalStatus === 'VOIDED') {
      confirmError.value = '目标已作废（有成员拒绝）'
    }
  } catch (err: any) {
    confirmError.value = err.data?.message || '操作失败，请稍后重试'
  } finally {
    isConfirming.value = false
  }
}

// --- 修改/取消请求相关 ---
const showModifyForm = ref(false)
const isSubmittingChangeRequest = ref(false)
const changeRequestError = ref('')
const isVoting = ref(false)
const voteError = ref('')

const modifyForm = ref({
  name: '',
  category: '',
  targetValue: 0,
  unit: '',
  startDate: '',
  endDate: '',
  rewardPunishment: '',
  evidenceRequirement: '',
})

function initModifyForm() {
  if (!goal.value) return
  modifyForm.value = {
    name: goal.value.name,
    category: goal.value.category,
    targetValue: goal.value.targetValue,
    unit: goal.value.unit,
    startDate: goal.value.startDate,
    endDate: goal.value.endDate,
    rewardPunishment: goal.value.rewardPunishment,
    evidenceRequirement: goal.value.evidenceRequirement,
  }
  showModifyForm.value = true
  changeRequestError.value = ''
}

function getProposedChanges() {
  if (!goal.value) return {}
  const changes: Record<string, unknown> = {}
  if (modifyForm.value.name !== goal.value.name) changes.name = modifyForm.value.name
  if (modifyForm.value.category !== goal.value.category) changes.category = modifyForm.value.category
  if (modifyForm.value.targetValue !== goal.value.targetValue) changes.targetValue = modifyForm.value.targetValue
  if (modifyForm.value.unit !== goal.value.unit) changes.unit = modifyForm.value.unit
  if (modifyForm.value.startDate !== goal.value.startDate) changes.startDate = modifyForm.value.startDate
  if (modifyForm.value.endDate !== goal.value.endDate) changes.endDate = modifyForm.value.endDate
  if (modifyForm.value.rewardPunishment !== goal.value.rewardPunishment) changes.rewardPunishment = modifyForm.value.rewardPunishment
  if (modifyForm.value.evidenceRequirement !== goal.value.evidenceRequirement) changes.evidenceRequirement = modifyForm.value.evidenceRequirement
  return changes
}

async function submitModifyRequest() {
  const proposedChanges = getProposedChanges()
  if (Object.keys(proposedChanges).length === 0) {
    changeRequestError.value = '请至少修改一项内容'
    return
  }

  isSubmittingChangeRequest.value = true
  changeRequestError.value = ''

  try {
    await $fetch<GoalChangeRequestResponse>(`/api/goals/${goalId}/change-requests`, {
      method: 'POST',
      body: { type: 'MODIFY', proposedChanges },
    })
    showModifyForm.value = false
    await refresh()
  } catch (err: any) {
    changeRequestError.value = err.data?.message || '提交失败，请稍后重试'
  } finally {
    isSubmittingChangeRequest.value = false
  }
}

async function submitCancelRequest() {
  isSubmittingChangeRequest.value = true
  changeRequestError.value = ''

  try {
    await $fetch<GoalChangeRequestResponse>(`/api/goals/${goalId}/change-requests`, {
      method: 'POST',
      body: { type: 'CANCEL' },
    })
    await refresh()
  } catch (err: any) {
    changeRequestError.value = err.data?.message || '提交失败，请稍后重试'
  } finally {
    isSubmittingChangeRequest.value = false
  }
}

async function handleVote(requestId: number, status: 'APPROVED' | 'REJECTED') {
  isVoting.value = true
  voteError.value = ''

  try {
    await $fetch<VoteGoalChangeRequestResponse>(`/api/goal-change-requests/${requestId}/vote`, {
      method: 'POST',
      body: { status },
    })
    await refresh()
  } catch (err: any) {
    voteError.value = err.data?.message || '投票失败，请稍后重试'
  } finally {
    isVoting.value = false
  }
}

// 是否可以发起修改/取消请求
const canRequestChange = computed(() => {
  if (!goal.value) return false
  return ['PENDING', 'UPCOMING', 'ACTIVE'].includes(goal.value.status) && !goal.value.activeChangeRequest
})

// 是否 ACTIVE 状态（禁用开始日期修改）
const isActive = computed(() => goal.value?.status === 'ACTIVE')

// 倒计时
const remainingTime = ref('')
let countdownTimer: ReturnType<typeof setInterval> | null = null
let stopCountdownWatch: (() => void) | null = null

function updateCountdown() {
  if (!goal.value?.activeChangeRequest) {
    remainingTime.value = ''
    return
  }
  const activeRequest = goal.value.activeChangeRequest
  const countdownDeadline = activeRequest.effectiveExpiresAt || activeRequest.expiresAt
  const expiresAt = new Date(countdownDeadline).getTime()
  const now = Date.now()
  const diff = expiresAt - now

  if (diff <= 0) {
    remainingTime.value = '已过期'
    if (countdownTimer) {
      clearInterval(countdownTimer)
      countdownTimer = null
    }
    return
  }

  const hours = Math.floor(diff / (1000 * 60 * 60))
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
  const seconds = Math.floor((diff % (1000 * 60)) / 1000)

  const proposedChanges = activeRequest.proposedChanges
  const isEarlyExpiry = activeRequest.type === 'MODIFY' && Boolean(
    proposedChanges?.startDate || proposedChanges?.endDate,
  )

  if (isEarlyExpiry) {
    remainingTime.value = `距自动过期 ${hours}h ${minutes}m ${seconds}s`
    return
  }

  remainingTime.value = `剩余 ${hours}h ${minutes}m ${seconds}s`
}

onMounted(() => {
  stopCountdownWatch = watch(() => goal.value?.activeChangeRequest, (req) => {
    if (countdownTimer) {
      clearInterval(countdownTimer)
      countdownTimer = null
    }
    if (req) {
      updateCountdown()
      countdownTimer = setInterval(updateCountdown, 1000)
    }
  }, { immediate: true })
})

onUnmounted(() => {
  if (countdownTimer) clearInterval(countdownTimer)
  stopCountdownWatch?.()
})

// 格式化日期
function formatDate(dateStr: string) {
  const date = new Date(dateStr)
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

// 获取状态显示文本
function getStatusText(status: string) {
  const statusMap: Record<string, string> = {
    PENDING: '待确认',
    UPCOMING: '待开始',
    ACTIVE: '进行中',
    SETTLING: '待结算',
    ARCHIVED: '已归档',
    VOIDED: '已作废',
    CANCELLED: '已取消',
  }
  return statusMap[status] || status
}

// 获取状态样式
function getStatusClass(status: string) {
  const classMap: Record<string, string> = {
    PENDING: 'bg-yellow-100 text-yellow-800',
    UPCOMING: 'bg-purple-100 text-purple-800',
    ACTIVE: 'bg-green-100 text-green-800',
    SETTLING: 'bg-blue-100 text-blue-800',
    ARCHIVED: 'bg-gray-100 text-gray-800',
    VOIDED: 'bg-red-100 text-red-800',
    CANCELLED: 'bg-gray-100 text-gray-800',
  }
  return classMap[status] || 'bg-gray-100 text-gray-800'
}

// 获取确认状态显示
function getConfirmationStatusText(status: string) {
  const statusMap: Record<string, string> = {
    PENDING: '待确认',
    APPROVED: '已同意',
    REJECTED: '已拒绝',
  }
  return statusMap[status] || status
}

function getConfirmationStatusClass(status: string) {
  const classMap: Record<string, string> = {
    PENDING: 'text-yellow-600',
    APPROVED: 'text-green-600',
    REJECTED: 'text-red-600',
  }
  return classMap[status] || 'text-gray-600'
}

// 计算确认进度
const confirmationProgress = computed(() => {
  if (!goal.value) return { approved: 0, total: 0, pending: 0, rejected: 0 }

  const confirmations = goal.value.confirmations
  return {
    approved: confirmations.filter(c => c.status === 'APPROVED').length,
    pending: confirmations.filter(c => c.status === 'PENDING').length,
    rejected: confirmations.filter(c => c.status === 'REJECTED').length,
    total: confirmations.length,
  }
})

// 是否可以确认
const canConfirm = computed(() => {
  if (!goal.value) return false
  return goal.value.status === 'PENDING' && goal.value.myConfirmationStatus === 'PENDING'
})

const canCheckin = computed(() => {
  if (!goal.value) return false
  return goal.value.status === 'ACTIVE' && goal.value.isParticipant
})

function getCheckinStatusText(status: string) {
  const statusMap: Record<string, string> = {
    PENDING_REVIEW: '待审核',
    CONFIRMED: '已确认',
    DISPUTED: '质疑',
    AUTO_APPROVED: '自动通过',
  }
  return statusMap[status] || status
}

function getCheckinStatusClass(status: string) {
  const classMap: Record<string, string> = {
    PENDING_REVIEW: 'bg-yellow-100 text-yellow-800',
    CONFIRMED: 'bg-green-100 text-green-800',
    DISPUTED: 'bg-red-100 text-red-800',
    AUTO_APPROVED: 'bg-blue-100 text-blue-800',
  }
  return classMap[status] || 'bg-gray-100 text-gray-800'
}

// --- 打卡审核相关 ---
const isSupervisor = computed(() => goal.value?.myRole === 'SUPERVISOR')

const isReviewing = ref(false)
const reviewError = ref('')
const disputeCheckinId = ref<number | null>(null)
const disputeReason = ref('')

function canReviewCheckin(checkin: CheckinListResponse['checkins'][number]) {
  return isSupervisor.value && checkin.status === 'PENDING_REVIEW' && checkin.myReviewAction === null
}

async function handleReviewConfirm(checkinId: number) {
  isReviewing.value = true
  reviewError.value = ''

  try {
    await $fetch<ReviewCheckinResponse>(`/api/checkins/${checkinId}/review`, {
      method: 'POST',
      body: { action: 'CONFIRMED' },
    })
    await refreshCheckins()
  } catch (err: any) {
    reviewError.value = err.data?.message || '审核失败，请稍后重试'
  } finally {
    isReviewing.value = false
  }
}

function openDisputeForm(checkinId: number) {
  disputeCheckinId.value = checkinId
  disputeReason.value = ''
  reviewError.value = ''
}

function closeDisputeForm() {
  disputeCheckinId.value = null
  disputeReason.value = ''
}

async function handleReviewDispute() {
  if (!disputeCheckinId.value) return
  if (!disputeReason.value.trim()) {
    reviewError.value = '请填写质疑理由'
    return
  }

  isReviewing.value = true
  reviewError.value = ''

  try {
    await $fetch<ReviewCheckinResponse>(`/api/checkins/${disputeCheckinId.value}/review`, {
      method: 'POST',
      body: { action: 'DISPUTED', reason: disputeReason.value.trim() },
    })
    closeDisputeForm()
    await refreshCheckins()
  } catch (err: any) {
    reviewError.value = err.data?.message || '审核失败，请稍后重试'
  } finally {
    isReviewing.value = false
  }
}

function getReviewActionText(action: string) {
  return action === 'CONFIRMED' ? '已确认' : '质疑'
}

function getReviewActionClass(action: string) {
  return action === 'CONFIRMED' ? 'text-green-600' : 'text-red-600'
}

</script>

<template>
  <div class="min-h-screen bg-background">
    <header class="bg-white shadow-sm">
      <div class="max-w-4xl mx-auto px-4 py-4 flex items-center">
        <NuxtLink :to="`/groups/${groupId}`" class="text-gray-500 hover:text-primary transition-colors cursor-pointer mr-4">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
        </NuxtLink>
        <h1 class="text-xl font-bold text-foreground">目标详情</h1>
      </div>
    </header>

    <main class="max-w-4xl mx-auto px-4 py-8">
      <!-- 加载错误 -->
      <div v-if="error" class="bg-white rounded-2xl shadow-lg p-8 text-center">
        <p class="text-red-500">{{ error.data?.message || '加载失败' }}</p>
        <NuxtLink :to="`/groups/${groupId}`" class="mt-4 inline-block text-primary hover:underline">
          返回小组
        </NuxtLink>
      </div>

      <!-- 目标详情 -->
      <div v-else-if="goal" class="space-y-6">
        <!-- 基本信息卡片 -->
        <div class="bg-white rounded-2xl shadow-lg p-6">
          <div class="flex items-start justify-between mb-4">
            <div>
              <h2 class="text-2xl font-bold text-foreground">{{ goal.name }}</h2>
              <p class="text-gray-500 mt-1">{{ goal.category }}</p>
            </div>
            <span :class="['px-3 py-1 rounded-full text-sm font-medium', getStatusClass(goal.status)]">
              {{ getStatusText(goal.status) }}
            </span>
          </div>

          <div class="grid grid-cols-2 gap-4 mt-6">
            <div>
              <p class="text-sm text-gray-500">达标条件</p>
              <p class="text-lg font-semibold text-foreground">{{ goal.targetValue }} {{ goal.unit }}</p>
            </div>
            <div>
              <p class="text-sm text-gray-500">创建者</p>
              <p class="text-lg font-semibold text-foreground">{{ goal.createdBy.nickname }}</p>
            </div>
            <div>
              <p class="text-sm text-gray-500">开始日期</p>
              <p class="text-lg font-semibold text-foreground">{{ formatDate(goal.startDate) }}</p>
            </div>
            <div>
              <p class="text-sm text-gray-500">结束日期</p>
              <p class="text-lg font-semibold text-foreground">{{ formatDate(goal.endDate) }}</p>
            </div>
          </div>
        </div>

        <!-- 奖惩规则 -->
        <div class="bg-white rounded-2xl shadow-lg p-6">
          <h3 class="text-lg font-semibold text-foreground mb-3">奖惩规则</h3>
          <p class="text-gray-700 whitespace-pre-wrap">{{ goal.rewardPunishment }}</p>
        </div>

        <!-- 证据要求 -->
        <div class="bg-white rounded-2xl shadow-lg p-6">
          <h3 class="text-lg font-semibold text-foreground mb-3">证据要求</h3>
          <p class="text-gray-700 whitespace-pre-wrap">{{ goal.evidenceRequirement }}</p>
        </div>

        <!-- 确认状态 -->
        <div v-if="goal.status === 'PENDING'" class="bg-white rounded-2xl shadow-lg p-6">
          <h3 class="text-lg font-semibold text-foreground mb-4">确认状态</h3>

          <!-- 进度条 -->
          <div class="mb-4">
            <div class="flex justify-between text-sm text-gray-500 mb-2">
              <span>已同意 {{ confirmationProgress.approved }}/{{ confirmationProgress.total }}</span>
              <span v-if="confirmationProgress.rejected > 0" class="text-red-500">
                {{ confirmationProgress.rejected }} 人拒绝
              </span>
            </div>
            <div class="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                class="h-full bg-green-500 transition-all duration-300"
                :style="{ width: `${(confirmationProgress.approved / confirmationProgress.total) * 100}%` }"
              />
            </div>
          </div>

          <!-- 成员确认列表 -->
          <div class="space-y-3">
            <div
              v-for="confirmation in goal.confirmations"
              :key="confirmation.memberId"
              class="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
            >
              <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <span class="text-sm font-medium text-primary">{{ confirmation.nickname[0] }}</span>
                </div>
                <div>
                  <p class="font-medium text-foreground">{{ confirmation.nickname }}</p>
                  <p class="text-xs text-gray-500">{{ confirmation.role === 'CHALLENGER' ? '挑战者' : '监督者' }}</p>
                </div>
              </div>
              <span :class="['text-sm font-medium', getConfirmationStatusClass(confirmation.status)]">
                {{ getConfirmationStatusText(confirmation.status) }}
              </span>
            </div>
          </div>

          <!-- 确认操作 -->
          <div v-if="canConfirm" class="mt-6 pt-6 border-t border-gray-200">
            <p class="text-sm text-gray-600 mb-4">请确认是否同意此目标：</p>
            <div v-if="confirmError" class="mb-4 bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm">
              {{ confirmError }}
            </div>
            <div class="flex gap-4">
              <button
                :disabled="isConfirming"
                class="flex-1 py-3 px-4 bg-green-500 text-white font-medium rounded-lg hover:bg-green-600 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                @click="handleConfirm('APPROVED')"
              >
                {{ isConfirming ? '处理中...' : '同意' }}
              </button>
              <button
                :disabled="isConfirming"
                class="flex-1 py-3 px-4 bg-red-500 text-white font-medium rounded-lg hover:bg-red-600 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                @click="handleConfirm('REJECTED')"
              >
                {{ isConfirming ? '处理中...' : '拒绝' }}
              </button>
            </div>
          </div>
        </div>

        <!-- 参与者列表（待开始或进行中的目标） -->
        <div v-if="['UPCOMING', 'ACTIVE'].includes(goal.status) && goal.participants.length > 0" class="bg-white rounded-2xl shadow-lg p-6">
          <h3 class="text-lg font-semibold text-foreground mb-4">参与者</h3>
          <div class="flex flex-wrap gap-3">
            <div
              v-for="participant in goal.participants"
              :key="participant.memberId"
              class="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg"
            >
              <div class="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                <span class="text-xs font-medium text-primary">{{ participant.nickname[0] }}</span>
              </div>
              <span class="text-sm text-foreground">{{ participant.nickname }}</span>
            </div>
          </div>
        </div>

        <!-- 打卡按钮 -->
        <div v-if="canCheckin" class="flex">
          <NuxtLink
            :to="`/groups/${groupId}/goals/${goalId}/checkin`"
            class="flex-1 py-3 px-4 bg-primary text-white font-medium rounded-lg shadow-lg hover:bg-primary/90 transition-colors text-center flex items-center justify-center gap-2"
          >
            <Icon name="lucide:check-circle" class="w-5 h-5" />
            打卡
          </NuxtLink>
        </div>

        <!-- 打卡记录 -->
        <div v-if="['ACTIVE', 'SETTLING', 'ARCHIVED'].includes(goal.status) && checkinList.checkins.length > 0" class="bg-white rounded-2xl shadow-lg p-6">
          <h3 class="text-lg font-semibold text-foreground mb-4">
            打卡记录 ({{ checkinList.total }})
          </h3>
          <div v-if="reviewError" class="mb-4 bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm">
            {{ reviewError }}
          </div>
          <div class="space-y-4">
            <div
              v-for="checkin in checkinList.checkins"
              :key="checkin.id"
              class="border-b border-gray-100 last:border-0 pb-4 last:pb-0"
            >
              <div class="flex items-center justify-between mb-2">
                <div class="flex items-center gap-2">
                  <div class="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                    <span class="text-xs font-medium text-primary">{{ checkin.createdByNickname[0] }}</span>
                  </div>
                  <span class="text-sm font-medium text-foreground">{{ checkin.createdByNickname }}</span>
                </div>
                <span :class="['px-2 py-0.5 rounded-full text-xs font-medium', getCheckinStatusClass(checkin.status)]">
                  {{ getCheckinStatusText(checkin.status) }}
                </span>
              </div>
              <div class="ml-9">
                <p class="text-sm text-foreground">
                  <span class="font-semibold">{{ checkin.value }}</span> {{ goal.unit }}
                  <span class="text-gray-400 ml-2">{{ checkin.checkinDate }}</span>
                </p>
                <p v-if="checkin.note" class="text-sm text-gray-500 mt-1">{{ checkin.note }}</p>
                <div v-if="checkin.evidence.length > 0" class="flex flex-wrap gap-2 mt-2">
                  <div v-viewer="{ navbar: false }" class="flex flex-wrap gap-2">
                    <img
                      v-for="ev in checkin.evidence"
                      :key="ev.id"
                      :src="ev.filePath"
                      alt="证据截图"
                      class="w-16 h-16 rounded-lg object-cover bg-gray-100 cursor-pointer hover:opacity-80 transition-opacity"
                    />
                  </div>
                </div>
                <p class="text-xs text-gray-400 mt-1">{{ new Date(checkin.createdAt).toLocaleString('zh-CN') }}</p>

                <!-- 审核详情 -->
                <div v-if="checkin.reviews && checkin.reviews.length > 0" class="mt-3 space-y-1.5">
                  <p class="text-xs font-medium text-gray-500">审核记录：</p>
                  <div
                    v-for="review in checkin.reviews"
                    :key="review.memberId"
                    class="flex items-center gap-2 text-xs"
                  >
                    <span class="text-gray-600">{{ review.reviewerNickname }}</span>
                    <span :class="getReviewActionClass(review.action)">{{ getReviewActionText(review.action) }}</span>
                    <span v-if="review.reason" class="text-gray-400">— {{ review.reason }}</span>
                  </div>
                </div>

                <!-- 审核操作 -->
                <div v-if="canReviewCheckin(checkin)" class="mt-3">
                  <!-- 质疑表单 -->
                  <div v-if="disputeCheckinId === checkin.id" class="space-y-2">
                    <textarea
                      v-model="disputeReason"
                      rows="2"
                      placeholder="请填写质疑理由（必填）"
                      class="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                    <div class="flex gap-2">
                      <button
                        :disabled="isReviewing"
                        class="px-3 py-1.5 text-xs bg-red-500 text-white font-medium rounded-lg hover:bg-red-600 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        @click="handleReviewDispute"
                      >
                        {{ isReviewing ? '提交中...' : '提交质疑' }}
                      </button>
                      <button
                        :disabled="isReviewing"
                        class="px-3 py-1.5 text-xs bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 transition-colors cursor-pointer"
                        @click="closeDisputeForm"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                  <!-- 确认/质疑按钮 -->
                  <div v-else class="flex gap-2">
                    <button
                      :disabled="isReviewing"
                      class="px-3 py-1.5 text-xs bg-green-500 text-white font-medium rounded-lg hover:bg-green-600 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                      @click="handleReviewConfirm(checkin.id)"
                    >
                      <Icon name="lucide:check" class="w-3.5 h-3.5" />
                      确认
                    </button>
                    <button
                      :disabled="isReviewing"
                      class="px-3 py-1.5 text-xs bg-red-500 text-white font-medium rounded-lg hover:bg-red-600 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                      @click="openDisputeForm(checkin.id)"
                    >
                      <Icon name="lucide:alert-triangle" class="w-3.5 h-3.5" />
                      质疑
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 活跃的修改/取消请求 -->
        <div v-if="goal.activeChangeRequest" class="bg-white rounded-2xl shadow-lg p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-semibold text-foreground">
              {{ goal.activeChangeRequest.type === 'MODIFY' ? '修改请求' : '取消请求' }}
            </h3>
            <div class="flex items-center gap-2 text-sm text-gray-500">
              <Icon name="lucide:clock" class="w-4 h-4" />
              <span>{{ remainingTime }}</span>
            </div>
          </div>

          <p class="text-sm text-gray-600 mb-4">
            由 <span class="font-medium text-foreground">{{ goal.activeChangeRequest.initiatorNickname }}</span> 发起
          </p>

          <!-- 修改内容展示 -->
          <div v-if="goal.activeChangeRequest.type === 'MODIFY' && goal.activeChangeRequest.proposedChanges" class="mb-4 bg-gray-50 rounded-lg p-4">
            <p class="text-sm font-medium text-gray-700 mb-2">修改内容：</p>
            <div class="space-y-1 text-sm">
              <p v-if="goal.activeChangeRequest.proposedChanges.name">
                <span class="text-gray-500">名称：</span>{{ goal.activeChangeRequest.proposedChanges.name }}
              </p>
              <p v-if="goal.activeChangeRequest.proposedChanges.category">
                <span class="text-gray-500">类别：</span>{{ goal.activeChangeRequest.proposedChanges.category }}
              </p>
              <p v-if="goal.activeChangeRequest.proposedChanges.targetValue">
                <span class="text-gray-500">目标值：</span>{{ goal.activeChangeRequest.proposedChanges.targetValue }} {{ goal.activeChangeRequest.proposedChanges.unit || goal.unit }}
              </p>
              <p v-if="goal.activeChangeRequest.proposedChanges.unit">
                <span class="text-gray-500">单位：</span>{{ goal.activeChangeRequest.proposedChanges.unit }}
              </p>
              <p v-if="goal.activeChangeRequest.proposedChanges.startDate">
                <span class="text-gray-500">开始日期：</span>{{ formatDate(goal.activeChangeRequest.proposedChanges.startDate) }}
              </p>
              <p v-if="goal.activeChangeRequest.proposedChanges.endDate">
                <span class="text-gray-500">结束日期：</span>{{ formatDate(goal.activeChangeRequest.proposedChanges.endDate) }}
              </p>
              <p v-if="goal.activeChangeRequest.proposedChanges.rewardPunishment">
                <span class="text-gray-500">奖惩规则：</span>{{ goal.activeChangeRequest.proposedChanges.rewardPunishment }}
              </p>
              <p v-if="goal.activeChangeRequest.proposedChanges.evidenceRequirement">
                <span class="text-gray-500">证据要求：</span>{{ goal.activeChangeRequest.proposedChanges.evidenceRequirement }}
              </p>
            </div>
          </div>

          <!-- 投票进度 -->
          <div class="mb-4">
            <div class="flex justify-between text-sm text-gray-500 mb-2">
              <span>已同意 {{ goal.activeChangeRequest.votes.filter(v => v.status === 'APPROVED').length }}/{{ goal.activeChangeRequest.votes.length }}</span>
            </div>
            <div class="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                class="h-full bg-green-500 transition-all duration-300"
                :style="{ width: `${(goal.activeChangeRequest.votes.filter(v => v.status === 'APPROVED').length / goal.activeChangeRequest.votes.length) * 100}%` }"
              />
            </div>
          </div>

          <!-- 成员投票列表 -->
          <div class="space-y-3 mb-4">
            <div
              v-for="vote in goal.activeChangeRequest.votes"
              :key="vote.memberId"
              class="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
            >
              <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <span class="text-sm font-medium text-primary">{{ vote.nickname[0] }}</span>
                </div>
                <div>
                  <p class="font-medium text-foreground">{{ vote.nickname }}</p>
                  <p class="text-xs text-gray-500">{{ vote.role === 'CHALLENGER' ? '挑战者' : '监督者' }}</p>
                </div>
              </div>
              <span :class="['text-sm font-medium', getConfirmationStatusClass(vote.status)]">
                {{ getConfirmationStatusText(vote.status) }}
              </span>
            </div>
          </div>

          <!-- 投票操作 -->
          <div v-if="goal.activeChangeRequest.myVoteStatus === 'PENDING'" class="pt-4 border-t border-gray-200">
            <p class="text-sm text-gray-600 mb-4">
              {{ goal.activeChangeRequest.type === 'MODIFY' ? '是否同意此修改？' : '是否同意取消此目标？' }}
            </p>
            <div v-if="voteError" class="mb-4 bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm">
              {{ voteError }}
            </div>
            <div class="flex gap-4">
              <button
                :disabled="isVoting"
                class="flex-1 py-3 px-4 bg-green-500 text-white font-medium rounded-lg hover:bg-green-600 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                @click="handleVote(goal.activeChangeRequest!.id, 'APPROVED')"
              >
                {{ isVoting ? '处理中...' : '同意' }}
              </button>
              <button
                :disabled="isVoting"
                class="flex-1 py-3 px-4 bg-red-500 text-white font-medium rounded-lg hover:bg-red-600 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                @click="handleVote(goal.activeChangeRequest!.id, 'REJECTED')"
              >
                {{ isVoting ? '处理中...' : '拒绝' }}
              </button>
            </div>
          </div>
        </div>

        <!-- 修改目标表单 -->
        <div v-if="showModifyForm" class="bg-white rounded-2xl shadow-lg p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-semibold text-foreground">修改目标</h3>
            <button class="text-gray-400 hover:text-gray-600 cursor-pointer" @click="showModifyForm = false">
              <Icon name="lucide:x" class="w-5 h-5" />
            </button>
          </div>

          <div v-if="changeRequestError" class="mb-4 bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm">
            {{ changeRequestError }}
          </div>

          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">目标名称</label>
              <input v-model="modifyForm.name" type="text" class="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">类别</label>
              <input v-model="modifyForm.category" type="text" class="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">目标数值</label>
                <input v-model.number="modifyForm.targetValue" type="number" step="0.01" class="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">单位</label>
                <input v-model="modifyForm.unit" type="text" class="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">开始日期</label>
                <input v-model="modifyForm.startDate" type="date" :disabled="isActive" :class="['w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50', isActive ? 'bg-gray-100 cursor-not-allowed' : '']" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">结束日期</label>
                <input v-model="modifyForm.endDate" type="date" class="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">奖惩规则</label>
              <textarea v-model="modifyForm.rewardPunishment" rows="2" class="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">证据要求</label>
              <textarea v-model="modifyForm.evidenceRequirement" rows="2" class="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
          </div>

          <div class="flex gap-4 mt-6">
            <button
              :disabled="isSubmittingChangeRequest"
              class="flex-1 py-3 px-4 bg-primary text-white font-medium rounded-lg hover:bg-primary/90 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              @click="submitModifyRequest"
            >
              {{ isSubmittingChangeRequest ? '提交中...' : '提交修改请求' }}
            </button>
            <button
              :disabled="isSubmittingChangeRequest"
              class="px-6 py-3 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 transition-colors cursor-pointer"
              @click="showModifyForm = false"
            >
              取消
            </button>
          </div>
        </div>

        <!-- 操作按钮 -->
        <div v-if="canRequestChange && !showModifyForm" class="flex gap-4">
          <button
            :disabled="isSubmittingChangeRequest"
            class="flex-1 py-3 px-4 bg-white text-primary font-medium rounded-lg shadow-lg hover:bg-gray-50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            @click="initModifyForm"
          >
            <Icon name="lucide:pencil" class="w-4 h-4" />
            修改目标
          </button>
          <button
            :disabled="isSubmittingChangeRequest"
            class="flex-1 py-3 px-4 bg-white text-red-500 font-medium rounded-lg shadow-lg hover:bg-red-50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            @click="submitCancelRequest"
          >
            <Icon name="lucide:x-circle" class="w-4 h-4" />
            {{ isSubmittingChangeRequest ? '提交中...' : '取消目标' }}
          </button>
        </div>

        <!-- 变更请求错误提示（非表单内） -->
        <div v-if="changeRequestError && !showModifyForm" class="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm">
          {{ changeRequestError }}
        </div>
      </div>

      <!-- 加载中 -->
      <div v-else class="bg-white rounded-2xl shadow-lg p-8 text-center">
        <p class="text-gray-500">加载中...</p>
      </div>
    </main>
  </div>
</template>
