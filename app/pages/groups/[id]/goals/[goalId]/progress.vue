<script setup lang="ts">
import type { ProgressResponse } from '~/types/progress'

definePageMeta({
  middleware: 'auth',
})

const { user } = useUserSession()
const route = useRoute()
const groupId = Number(route.params.id)
const goalId = Number(route.params.goalId)

const { data: progress, error, refresh } = await useFetch<ProgressResponse>(
  `/api/goals/${goalId}/progress`,
)

useHead({
  title: computed(() =>
    progress.value ? `${progress.value.goal.name} 进度 - 打卡契约` : '进度 - 打卡契约',
  ),
})

const isSupervisor = computed(() => progress.value?.myRole === 'SUPERVISOR')

// 监督者没有个人进度，展示全员概览
const supervisorSummary = computed(() => {
  if (!progress.value || !isSupervisor.value) return null
  const lb = progress.value.leaderboard
  if (lb.length === 0) return null
  const avgPct = Math.round(lb.reduce((sum, e) => sum + e.percentage, 0) / lb.length)
  const totalCompleted = lb.reduce((sum, e) => sum + e.completedValue, 0)
  return { avgPct, totalCompleted, challengerCount: lb.length }
})
</script>

<template>
  <div class="min-h-screen bg-background">
    <header class="bg-white shadow-sm">
      <div class="max-w-4xl mx-auto px-4 py-4 flex items-center">
        <NuxtLink
          :to="`/groups/${groupId}/goals/${goalId}`"
          class="text-gray-500 hover:text-primary transition-colors cursor-pointer mr-4"
        >
          <Icon name="lucide:arrow-left" class="w-6 h-6" />
        </NuxtLink>
        <div>
          <h1 class="text-xl font-bold text-foreground">进度总览</h1>
          <p v-if="progress" class="text-sm text-gray-500">{{ progress.goal.name }}</p>
        </div>
      </div>
    </header>

    <main class="max-w-4xl mx-auto px-4 py-8">
      <!-- 加载错误 -->
      <div v-if="error" class="bg-white rounded-2xl shadow-lg p-8 text-center">
        <Icon name="lucide:alert-circle" class="w-12 h-12 text-red-400 mx-auto mb-3" />
        <p class="text-red-500">{{ error.data?.message || '加载失败' }}</p>
        <NuxtLink
          :to="`/groups/${groupId}/goals/${goalId}`"
          class="mt-4 inline-block text-primary hover:underline"
        >
          返回目标详情
        </NuxtLink>
      </div>

      <div v-else-if="progress" class="space-y-6">
        <!-- 挑战者：个人进度卡片 -->
        <BusinessProgressStatsCard
          v-if="progress.myProgress"
          :progress="progress.myProgress"
          :target-value="progress.goal.targetValue"
          :unit="progress.goal.unit"
          :remaining-days="progress.remainingDays"
          :total-pending-review-count="progress.totalPendingReviewCount"
          :total-disputed-count="progress.totalDisputedCount"
          :is-supervisor="false"
        />

        <!-- 监督者：全员概览 -->
        <div v-else-if="isSupervisor" class="bg-white rounded-2xl shadow-lg p-6">
          <h3 class="text-lg font-semibold text-foreground mb-5">全员概览</h3>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <p class="text-xs text-gray-400">挑战者人数</p>
              <p class="text-2xl font-bold text-foreground">{{ supervisorSummary?.challengerCount ?? 0 }}</p>
            </div>
            <div>
              <p class="text-xs text-gray-400">平均完成度</p>
              <p class="text-2xl font-bold text-primary">{{ supervisorSummary?.avgPct ?? 0 }}%</p>
            </div>
            <div>
              <p class="text-xs text-gray-400">剩余天数</p>
              <p :class="['text-2xl font-bold', progress.remainingDays <= 3 ? 'text-red-500' : progress.remainingDays <= 7 ? 'text-amber-500' : 'text-foreground']">
                {{ progress.remainingDays }} 天
              </p>
            </div>
            <div>
              <p class="text-xs text-gray-400">目标</p>
              <p class="text-2xl font-bold text-foreground">
                {{ progress.goal.targetValue }}
                <span class="text-sm font-normal text-gray-400">{{ progress.goal.unit }}</span>
              </p>
            </div>
          </div>
          <!-- 审核统计 -->
          <div class="mt-5 pt-4 border-t border-gray-100 grid grid-cols-2 gap-3">
            <div class="flex items-center gap-2 px-3 py-2 bg-amber-50 rounded-lg">
              <Icon name="lucide:clock" class="w-4 h-4 text-amber-500" />
              <div>
                <p class="text-xs text-gray-500">全员待审核</p>
                <p class="text-sm font-semibold text-amber-600">{{ progress.totalPendingReviewCount }}</p>
              </div>
            </div>
            <div class="flex items-center gap-2 px-3 py-2 bg-red-50 rounded-lg">
              <Icon name="lucide:alert-triangle" class="w-4 h-4 text-red-500" />
              <div>
                <p class="text-xs text-gray-500">全员质疑</p>
                <p class="text-sm font-semibold text-red-600">{{ progress.totalDisputedCount }}</p>
              </div>
            </div>
          </div>
        </div>

        <!-- 排行榜 -->
        <BusinessProgressLeaderboard
          :entries="progress.leaderboard"
          :unit="progress.goal.unit"
          :current-user-id="user?.id ?? 0"
        />

        <!-- 贡献图 -->
        <BusinessContributionGraph
          :contributions="progress.contributions"
          :start-date="progress.goal.startDate"
          :end-date="progress.goal.endDate"
          :unit="progress.goal.unit"
          :my-role="progress.myRole"
          :my-member-id="progress.myMemberId"
          :target-value="progress.goal.targetValue"
        />
      </div>

      <!-- 加载中 -->
      <div v-else class="bg-white rounded-2xl shadow-lg p-8 text-center">
        <p class="text-gray-500">加载中...</p>
      </div>
    </main>
  </div>
</template>
