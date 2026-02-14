<script setup lang="ts">
import confetti from 'canvas-confetti'
import type { ProgressResponse } from '~/types/progress'
import type { SettlementResultResponse } from '~/types/settlement'

definePageMeta({
  middleware: 'auth',
})

const { user } = useUserSession()
const route = useRoute()
const groupId = Number(route.params.id)
const goalId = Number(route.params.goalId)

const { data: settlement, error: settlementError, refresh: refreshSettlement } = await useFetch<SettlementResultResponse>(
  `/api/goals/${goalId}/settlement`,
)

const { data: progress, error: progressError } = await useFetch<ProgressResponse>(
  `/api/goals/${goalId}/progress`,
)

useHead({
  title: computed(() =>
    settlement.value ? `${settlement.value.goal.name} 结算 - 打卡契约` : '结算 - 打卡契约',
  ),
})

const isArchived = computed(() => settlement.value?.goal.status === 'ARCHIVED')
const isSettling = computed(() => settlement.value?.goal.status === 'SETTLING')
const isSupervisor = computed(() => progress.value?.myRole === 'SUPERVISOR')
const settlementPageTitle = computed(() => {
  if (isArchived.value) return '结算结果'
  return isSupervisor.value ? '结算确认' : '结算进度'
})
const myResult = computed(() =>
  settlement.value?.results.find(r => r.userId === user.value?.id),
)
const myAchieved = computed(() => myResult.value?.achieved === true)

// Celebration confetti for achieved users
onMounted(() => {
  if (isArchived.value && myAchieved.value) {
    setTimeout(() => {
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.6 },
        colors: ['#22c55e', '#0D9488', '#14B8A6', '#F97316', '#eab308'],
      })
    }, 500)
  }
})

async function handleSettlementConfirmed() {
  await refreshSettlement()
}
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
          <h1 class="text-xl font-bold text-foreground">
            {{ settlementPageTitle }}
          </h1>
          <p v-if="settlement" class="text-sm text-gray-500">{{ settlement.goal.name }}</p>
        </div>
      </div>
    </header>

    <main class="max-w-4xl mx-auto px-4 py-8">
      <!-- Error -->
      <div v-if="settlementError" class="bg-white rounded-2xl shadow-lg p-8 text-center">
        <Icon name="lucide:alert-circle" class="w-12 h-12 text-red-400 mx-auto mb-3" />
        <p class="text-red-500">{{ settlementError.data?.message || '加载失败' }}</p>
        <NuxtLink
          :to="`/groups/${groupId}/goals/${goalId}`"
          class="mt-4 inline-block text-primary hover:underline"
        >
          返回目标详情
        </NuxtLink>
      </div>

      <div v-else-if="settlement" class="space-y-6">
        <!-- SETTLING: Settlement confirmation panel -->
        <BusinessSettlementPanel
          v-if="isSettling"
          :goal-id="goalId"
          :has-pending-checkins="settlement.hasPendingCheckins"
          :confirmations="settlement.settlementProgress.confirmations"
          :confirmed-count="settlement.settlementProgress.confirmed"
          :total-count="settlement.settlementProgress.total"
          :is-supervisor="isSupervisor"
          :my-member-id="progress?.myMemberId ?? 0"
          @confirmed="handleSettlementConfirmed"
        />

        <!-- Goal summary hero -->
        <div class="bg-white rounded-2xl shadow-lg p-6">
          <div class="flex items-center justify-between mb-4">
            <div>
              <h2 class="text-xl font-bold text-foreground">{{ settlement.goal.name }}</h2>
              <p class="text-sm text-gray-500 mt-1">
                {{ settlement.goal.startDate }} ~ {{ settlement.goal.endDate }}
              </p>
            </div>
            <span
              :class="[
                'px-3 py-1 rounded-full text-sm font-medium',
                isArchived ? 'bg-gray-100 text-gray-600' : 'bg-blue-100 text-blue-800',
              ]"
            >
              {{ isArchived ? '已归档' : '待结算' }}
            </span>
          </div>
          <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <p class="text-xs text-gray-400">达标条件</p>
              <p class="text-lg font-bold text-foreground">
                {{ settlement.goal.targetValue }}
                <span class="text-sm font-normal text-gray-400">{{ settlement.goal.unit }}</span>
              </p>
            </div>
            <div>
              <p class="text-xs text-gray-400">达标人数</p>
              <p class="text-lg font-bold text-emerald-500">
                {{ settlement.results.filter(r => r.achieved).length }}
                <span class="text-sm font-normal text-gray-400">/ {{ settlement.results.length }}</span>
              </p>
            </div>
            <div>
              <p class="text-xs text-gray-400">目标类别</p>
              <p class="text-lg font-bold text-foreground">{{ settlement.goal.category }}</p>
            </div>
          </div>
        </div>

        <!-- Challenger results -->
        <div class="space-y-3">
          <h3 class="text-lg font-semibold text-foreground flex items-center gap-1.5">
            <Icon name="lucide:users" class="w-5 h-5 text-primary" />
            挑战者成绩
          </h3>
          <BusinessSettlementResultCard
            v-for="result in settlement.results"
            :key="result.memberId"
            :result="result"
            :target-value="settlement.goal.targetValue"
            :unit="settlement.goal.unit"
            :category="settlement.goal.category"
            :is-current-user="result.userId === (user?.id ?? 0)"
          />
        </div>

        <!-- Reward/punishment reminder -->
        <div class="bg-white rounded-2xl shadow-lg p-6">
          <h3 class="text-lg font-semibold text-foreground flex items-center gap-1.5 mb-3">
            <Icon name="lucide:gift" class="w-5 h-5 text-cta" />
            奖惩规则
          </h3>
          <p class="text-sm text-foreground/80 leading-relaxed">
            {{ settlement.goal.rewardPunishment }}
          </p>
        </div>

        <!-- Reuse leaderboard and contribution graph from progress -->
        <template v-if="progress">
          <BusinessProgressLeaderboard
            :entries="progress.leaderboard"
            :unit="progress.goal.unit"
            :current-user-id="user?.id ?? 0"
          />
          <BusinessContributionGraph
            :contributions="progress.contributions"
            :start-date="progress.goal.startDate"
            :end-date="progress.goal.endDate"
            :unit="progress.goal.unit"
            :my-role="progress.myRole"
            :my-member-id="progress.myMemberId"
            :target-value="progress.goal.targetValue"
          />
        </template>
      </div>

      <!-- Loading -->
      <div v-else class="bg-white rounded-2xl shadow-lg p-8 text-center">
        <p class="text-gray-500">加载中...</p>
      </div>
    </main>
  </div>
</template>
