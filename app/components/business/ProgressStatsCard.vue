<script setup lang="ts">
import type { ChallengerProgress } from '~/types/progress'

interface Props {
  progress: ChallengerProgress
  targetValue: number
  unit: string
  remainingDays: number
  totalPendingReviewCount: number
  totalDisputedCount: number
  isSupervisor?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  isSupervisor: false,
})

function getPercentageColor(pct: number): string {
  if (pct === 0) return 'text-gray-400'
  if (pct < 50) return 'text-amber-500'
  if (pct < 100) return 'text-blue-500'
  return 'text-emerald-500'
}

function getPercentageBgColor(pct: number): string {
  if (pct === 0) return 'stroke-gray-200'
  if (pct < 50) return 'stroke-amber-500'
  if (pct < 100) return 'stroke-blue-500'
  return 'stroke-emerald-500'
}

function getRemainingDaysColor(days: number): string {
  if (days <= 3) return 'text-red-500'
  if (days <= 7) return 'text-amber-500'
  return 'text-foreground'
}

const displayPercentage = computed(() => Math.round(props.progress.percentage))
const ringPercent = computed(() => Math.min(props.progress.percentage, 100))
const circumference = 2 * Math.PI * 40
const strokeDashoffset = computed(() =>
  circumference - (ringPercent.value / 100) * circumference,
)
</script>

<template>
  <div class="bg-white rounded-2xl shadow-lg p-6">
    <h3 class="text-lg font-semibold text-foreground mb-5">我的进度</h3>

    <div class="flex items-center gap-6">
      <!-- 环形进度 -->
      <div class="relative flex-shrink-0">
        <svg width="100" height="100" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="40" fill="none" stroke-width="8" class="stroke-gray-100" />
          <circle
            cx="50" cy="50" r="40" fill="none" stroke-width="8" stroke-linecap="round"
            :class="getPercentageBgColor(progress.percentage)"
            :stroke-dasharray="circumference"
            :stroke-dashoffset="strokeDashoffset"
            transform="rotate(-90 50 50)"
            style="transition: stroke-dashoffset 0.6s ease"
          />
        </svg>
        <div class="absolute inset-0 flex items-center justify-center">
          <span :class="['text-xl font-bold', getPercentageColor(progress.percentage)]">
            {{ displayPercentage }}%
          </span>
        </div>
      </div>

      <!-- 数值统计 -->
      <div class="flex-1 grid grid-cols-2 gap-3">
        <div>
          <p class="text-xs text-gray-400">累计完成</p>
          <p class="text-lg font-bold text-foreground">
            {{ progress.completedValue }}
            <span class="text-sm font-normal text-gray-400">{{ unit }}</span>
          </p>
        </div>
        <div>
          <p class="text-xs text-gray-400">剩余数值</p>
          <p class="text-lg font-bold text-foreground">
            {{ progress.remainingValue }}
            <span class="text-sm font-normal text-gray-400">{{ unit }}</span>
          </p>
        </div>
        <div>
          <p class="text-xs text-gray-400">剩余天数</p>
          <p :class="['text-lg font-bold', getRemainingDaysColor(remainingDays)]">
            {{ remainingDays }}
            <span class="text-sm font-normal text-gray-400">天</span>
          </p>
        </div>
        <div>
          <p class="text-xs text-gray-400">目标</p>
          <p class="text-lg font-bold text-foreground">
            {{ targetValue }}
            <span class="text-sm font-normal text-gray-400">{{ unit }}</span>
          </p>
        </div>
      </div>
    </div>

    <!-- 审核状态统计 -->
    <div class="mt-5 pt-4 border-t border-gray-100 grid grid-cols-2 gap-3">
      <template v-if="!isSupervisor">
        <div class="flex items-center gap-2 px-3 py-2 bg-amber-50 rounded-lg">
          <Icon name="lucide:clock" class="w-4 h-4 text-amber-500" />
          <div>
            <p class="text-xs text-gray-500">我的待审核</p>
            <p class="text-sm font-semibold text-amber-600">{{ progress.pendingReviewCount }}</p>
          </div>
        </div>
        <div class="flex items-center gap-2 px-3 py-2 bg-red-50 rounded-lg">
          <Icon name="lucide:alert-triangle" class="w-4 h-4 text-red-500" />
          <div>
            <p class="text-xs text-gray-500">我的质疑</p>
            <p class="text-sm font-semibold text-red-600">{{ progress.disputedCount }}</p>
          </div>
        </div>
      </template>
      <div class="flex items-center gap-2 px-3 py-2 bg-amber-50 rounded-lg">
        <Icon name="lucide:clock" class="w-4 h-4 text-amber-500" />
        <div>
          <p class="text-xs text-gray-500">全员待审核</p>
          <p class="text-sm font-semibold text-amber-600">{{ totalPendingReviewCount }}</p>
        </div>
      </div>
      <div class="flex items-center gap-2 px-3 py-2 bg-red-50 rounded-lg">
        <Icon name="lucide:alert-triangle" class="w-4 h-4 text-red-500" />
        <div>
          <p class="text-xs text-gray-500">全员质疑</p>
          <p class="text-sm font-semibold text-red-600">{{ totalDisputedCount }}</p>
        </div>
      </div>
    </div>
  </div>
</template>
