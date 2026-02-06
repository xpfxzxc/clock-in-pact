<script setup lang="ts">
import type { ConfirmGoalResponse, GoalDetailResponse } from '~/types/goal'

definePageMeta({
  middleware: 'auth',
})

const route = useRoute()
const groupId = Number(route.params.id)
const goalId = Number(route.params.goalId)

const { data: goal, refresh, error } = await useFetch<GoalDetailResponse>(`/api/goals/${goalId}`)

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

    // 刷新目标详情
    await refresh()

    // 如果目标状态变为 VOIDED，显示提示
    if (result.goalStatus === 'VOIDED') {
      confirmError.value = '目标已作废（有成员拒绝）'
    }
  } catch (err: any) {
    confirmError.value = err.data?.message || '操作失败，请稍后重试'
  } finally {
    isConfirming.value = false
  }
}

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
      </div>

      <!-- 加载中 -->
      <div v-else class="bg-white rounded-2xl shadow-lg p-8 text-center">
        <p class="text-gray-500">加载中...</p>
      </div>
    </main>
  </div>
</template>
