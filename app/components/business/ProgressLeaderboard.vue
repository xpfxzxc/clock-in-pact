<script setup lang="ts">
import type { LeaderboardEntry } from '~/types/progress'

interface Props {
  entries: LeaderboardEntry[]
  unit: string
  currentUserId: number
}

const props = defineProps<Props>()

function getRankDisplay(rank: number): { icon: string; color: string } {
  if (rank === 1) return { icon: 'lucide:crown', color: 'text-amber-500' }
  if (rank === 2) return { icon: 'lucide:medal', color: 'text-gray-400' }
  if (rank === 3) return { icon: 'lucide:medal', color: 'text-amber-700' }
  return { icon: '', color: 'text-gray-400' }
}

function getBarWidth(pct: number, maxPct: number): string {
  if (maxPct === 0) return '0%'
  return `${Math.min((pct / Math.max(maxPct, 100)) * 100, 100)}%`
}

const maxPercentage = computed(() =>
  Math.max(...props.entries.map(e => e.percentage), 100),
)
</script>

<template>
  <div class="bg-white rounded-2xl shadow-lg p-6">
    <h3 class="text-lg font-semibold text-foreground mb-5 flex items-center gap-1.5">
      <Icon name="lucide:trophy" class="w-5 h-5 text-amber-500" />
      排行榜
    </h3>

    <div v-if="entries.length === 0" class="text-center text-gray-400 py-6">
      暂无数据
    </div>

    <div v-else class="space-y-3">
      <div
        v-for="entry in entries"
        :key="entry.memberId"
        :class="[
          'relative flex items-center gap-3 px-4 py-3 rounded-xl transition-colors',
          entry.userId === currentUserId ? 'bg-primary/5 ring-1 ring-primary/20' : 'bg-gray-50',
          entry.rank === 1 ? 'ring-1 ring-amber-200 bg-amber-50/50' : '',
        ]"
      >
        <!-- 排名 -->
        <div class="flex-shrink-0 w-8 flex items-center justify-center">
          <Icon
            v-if="getRankDisplay(entry.rank).icon"
            :name="getRankDisplay(entry.rank).icon"
            :class="['w-5 h-5', getRankDisplay(entry.rank).color]"
          />
          <span v-else class="text-sm font-bold text-gray-400">{{ entry.rank }}</span>
        </div>

        <!-- 头像 + 名称 -->
        <div class="flex items-center gap-2 flex-shrink-0 w-20">
          <div class="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
            <span class="text-xs font-medium text-primary">{{ entry.nickname[0] }}</span>
          </div>
          <span :class="['text-sm font-medium truncate', entry.userId === currentUserId ? 'text-primary' : 'text-foreground']">
            {{ entry.nickname }}
          </span>
        </div>

        <!-- 进度条 -->
        <div class="flex-1 mx-2">
          <div class="h-2.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              :class="[
                'h-full rounded-full transition-all duration-500',
                entry.percentage > 110 ? '' : entry.percentage >= 100 ? 'bg-emerald-500' : entry.percentage >= 50 ? 'bg-blue-500' : 'bg-amber-500',
              ]"
              :style="{
                width: getBarWidth(entry.percentage, maxPercentage),
                ...(entry.percentage > 110 ? { background: 'linear-gradient(90deg, #ef4444, #f97316, #eab308, #22c55e, #3b82f6, #a855f7)' } : {}),
              }"
            />
          </div>
        </div>

        <!-- 数值 -->
        <div class="flex-shrink-0 text-right w-24">
          <p
            :class="['text-sm font-bold', entry.percentage > 110 ? '' : entry.percentage >= 100 ? 'text-emerald-600' : 'text-foreground']"
            :style="entry.percentage > 110 ? { background: 'linear-gradient(90deg, #ef4444, #f97316, #eab308, #22c55e, #3b82f6, #a855f7)', backgroundClip: 'text', WebkitBackgroundClip: 'text', color: 'transparent', WebkitTextFillColor: 'transparent' } : {}"
          >
            {{ Math.round(entry.percentage) }}%
          </p>
          <p class="text-xs text-gray-400">{{ entry.completedValue }} {{ unit }}</p>
        </div>
      </div>
    </div>
  </div>
</template>
