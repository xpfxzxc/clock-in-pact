<script setup lang="ts">
import type { ChallengerSettlementResult } from '~/types/settlement'

interface Props {
  result: ChallengerSettlementResult
  targetValue: number
  unit: string
  category: string
  isCurrentUser: boolean
}

const props = defineProps<Props>()

const ringPercent = computed(() => Math.min(props.result.percentage, 100))
const circumference = 2 * Math.PI * 40
const strokeDashoffset = computed(() =>
  circumference - (ringPercent.value / 100) * circumference,
)

const isOverAchieved = computed(() => props.result.percentage > 110)
const displayPercentage = computed(() => Math.round(props.result.percentage))

function getStrokeClass(): string {
  if (props.result.achieved) return 'stroke-emerald-500'
  return 'stroke-red-400'
}

function getPercentageColor(): string {
  if (isOverAchieved.value) return ''
  if (props.result.achieved) return 'text-emerald-500'
  return 'text-red-500'
}

function getPercentageStyle(): Record<string, string> {
  if (!isOverAchieved.value) return {}
  return {
    background: 'linear-gradient(90deg, #ef4444, #f97316, #eab308, #22c55e, #3b82f6, #a855f7)',
    backgroundClip: 'text',
    WebkitBackgroundClip: 'text',
    color: 'transparent',
    WebkitTextFillColor: 'transparent',
  }
}
</script>

<template>
  <div
    :class="[
      'bg-white rounded-2xl shadow-lg p-5 transition-all',
      isCurrentUser ? 'ring-2 ring-primary/30' : '',
    ]"
  >
    <div class="flex items-center gap-5">
      <!-- Ring progress -->
      <div class="relative flex-shrink-0">
        <svg width="90" height="90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="40" fill="none" stroke-width="8" class="stroke-gray-100" />
          <circle
            cx="50" cy="50" r="40" fill="none" stroke-width="8" stroke-linecap="round"
            :class="getStrokeClass()"
            :stroke-dasharray="circumference"
            :stroke-dashoffset="strokeDashoffset"
            transform="rotate(-90 50 50)"
            style="transition: stroke-dashoffset 0.8s ease"
          />
        </svg>
        <div class="absolute inset-0 flex items-center justify-center">
          <span
            :class="['text-lg font-bold', getPercentageColor()]"
            :style="getPercentageStyle()"
          >
            {{ displayPercentage }}%
          </span>
        </div>
      </div>

      <!-- Info -->
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 mb-1">
          <div class="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <span class="text-xs font-medium text-primary">{{ result.nickname[0] }}</span>
          </div>
          <span :class="['text-sm font-semibold truncate', isCurrentUser ? 'text-primary' : 'text-foreground']">
            {{ result.nickname }}
          </span>
          <!-- Achievement badge -->
          <span
            v-if="result.achieved"
            class="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700"
          >
            <Icon name="lucide:check-circle" class="w-3.5 h-3.5" />
            达标
          </span>
          <span
            v-else
            class="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700"
          >
            <Icon name="lucide:x-circle" class="w-3.5 h-3.5" />
            未达标
          </span>
        </div>

        <div class="grid grid-cols-2 gap-x-4 gap-y-1 mt-2">
          <div>
            <p class="text-xs text-gray-400">累计完成</p>
            <p class="text-sm font-bold text-foreground">
              {{ result.completedValue }}
              <span class="text-xs font-normal text-gray-400">{{ unit }}</span>
            </p>
          </div>
          <div>
            <p class="text-xs text-gray-400">目标</p>
            <p class="text-sm font-bold text-foreground">
              {{ targetValue }}
              <span class="text-xs font-normal text-gray-400">{{ unit }}</span>
            </p>
          </div>
          <div v-if="result.achieved && result.unlockedMaxMonths" class="col-span-2 mt-1">
            <p class="text-xs text-emerald-600 flex items-center gap-1">
              <Icon name="lucide:unlock" class="w-3.5 h-3.5" />
              已解锁「{{ category }}」最长 {{ result.unlockedMaxMonths }} 个月周期
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
