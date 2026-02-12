<script setup lang="ts">
import type { GroupDetailResponse } from '~/types/group'
import type { GoalResponse } from '~/types/goal'
import { getTimezoneLabel } from '~/utils/timezones'

definePageMeta({
  middleware: 'auth',
})

const route = useRoute()
const groupId = Number(route.params.id)

const { data: group, status, error } = await useFetch<GroupDetailResponse>(`/api/groups/${groupId}`)
const { data: goals } = await useFetch<GoalResponse[]>(`/api/groups/${groupId}/goals`)

useHead({
  title: computed(() => group.value ? `${group.value.name} - 打卡契约` : '小组详情 - 打卡契约'),
})

const showCopiedToast = ref(false)

function getRoleLabel(role: string) {
  return role === 'CHALLENGER' ? '挑战者' : '监督者'
}

function getRoleClass(role: string) {
  return role === 'CHALLENGER' ? 'bg-primary/10 text-primary' : 'bg-cta/10 text-cta'
}

async function copyInviteCode(code: string) {
  try {
    await navigator.clipboard.writeText(code)
    showCopiedToast.value = true
    setTimeout(() => {
      showCopiedToast.value = false
    }, 2000)
  } catch {
    const textArea = document.createElement('textarea')
    textArea.value = code
    document.body.appendChild(textArea)
    textArea.select()
    document.execCommand('copy')
    document.body.removeChild(textArea)
    showCopiedToast.value = true
    setTimeout(() => {
      showCopiedToast.value = false
    }, 2000)
  }
}

// 目标状态相关
function getGoalStatusText(status: string) {
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

function getGoalStatusClass(status: string) {
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

// 分类目标
const activeGoals = computed(() => goals.value?.filter(g => g.status === 'ACTIVE') || [])
const upcomingGoals = computed(() => goals.value?.filter(g => g.status === 'UPCOMING') || [])
const pendingGoals = computed(() => goals.value?.filter(g => g.status === 'PENDING') || [])
const otherGoals = computed(() => goals.value?.filter(g => !['ACTIVE', 'UPCOMING', 'PENDING'].includes(g.status)) || [])

// 是否可以创建目标（没有进行中、待开始或待确认的目标）
const canCreateGoal = computed(() => {
  return activeGoals.value.length === 0 && upcomingGoals.value.length === 0 && pendingGoals.value.length === 0
})
</script>

<template>
  <div class="min-h-screen bg-background">
    <header class="bg-white shadow-sm">
      <div class="max-w-4xl mx-auto px-4 py-4 flex items-center">
        <NuxtLink to="/" class="text-gray-500 hover:text-primary transition-colors cursor-pointer mr-4">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
        </NuxtLink>
        <h1 class="text-xl font-bold text-foreground truncate">{{ group?.name || '小组详情' }}</h1>
      </div>
    </header>

    <main class="max-w-4xl mx-auto px-4 py-8">
      <div v-if="status === 'pending'" class="bg-white rounded-2xl shadow-lg p-8 text-center">
        <p class="text-gray-500">加载中...</p>
      </div>

      <div v-else-if="error" class="bg-white rounded-2xl shadow-lg p-8 text-center">
        <p class="text-red-500">{{ error.data?.message || '加载失败' }}</p>
        <NuxtLink to="/" class="mt-4 inline-block text-primary hover:underline cursor-pointer">
          返回首页
        </NuxtLink>
      </div>

      <template v-else-if="group">
        <div class="space-y-6">
          <!-- Group Info -->
          <div class="bg-white rounded-2xl shadow-lg p-6">
            <div class="flex items-start justify-between">
              <div class="flex-1 min-w-0">
                <h2 class="text-2xl font-bold text-foreground">{{ group.name }}</h2>
                <p v-if="group.description" class="mt-2 text-gray-600">
                  {{ group.description }}
                </p>
                <p class="mt-2 text-sm text-gray-500">
                  <span class="inline-flex items-center gap-1">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    时区：{{ getTimezoneLabel(group.timezone) }}
                  </span>
                </p>
              </div>
              <span
                class="ml-4 px-3 py-1 text-sm font-medium rounded-full shrink-0"
                :class="getRoleClass(group.myRole!)"
              >
                {{ getRoleLabel(group.myRole!) }}
              </span>
            </div>
          </div>

          <!-- Quick Actions -->
          <div class="flex gap-3">
            <NuxtLink
              :to="`/groups/${groupId}/feed`"
              class="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-white rounded-2xl shadow-lg text-foreground font-medium hover:bg-gray-50 transition-colors cursor-pointer"
            >
              <Icon name="lucide:activity" class="w-5 h-5 text-primary" />
              <span>小组动态</span>
            </NuxtLink>
          </div>

          <!-- Goals Section -->
          <div class="bg-white rounded-2xl shadow-lg p-6">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-lg font-semibold text-foreground">目标</h3>
              <NuxtLink
                v-if="canCreateGoal"
                :to="`/groups/${groupId}/goals/create`"
                class="px-4 py-2 bg-cta text-white font-medium rounded-lg hover:opacity-90 transition-opacity cursor-pointer text-sm"
              >
                创建目标
              </NuxtLink>
            </div>

            <!-- 进行中的目标 -->
            <div v-if="activeGoals.length > 0" class="mb-6">
              <h4 class="text-sm font-medium text-gray-500 mb-3">进行中</h4>
              <div class="space-y-3">
                <NuxtLink
                  v-for="goal in activeGoals"
                  :key="goal.id"
                  :to="`/groups/${groupId}/goals/${goal.id}`"
                  class="block p-4 bg-green-50 rounded-lg hover:bg-green-100 transition-colors cursor-pointer"
                >
                  <div class="flex items-center justify-between">
                    <div>
                      <p class="font-medium text-foreground">{{ goal.name }}</p>
                      <p class="text-sm text-gray-500 mt-1">{{ goal.category }} · {{ goal.targetValue }} {{ goal.unit }}</p>
                    </div>
                    <span :class="['px-2 py-1 text-xs font-medium rounded-full', getGoalStatusClass(goal.status)]">
                      {{ getGoalStatusText(goal.status) }}
                    </span>
                  </div>
                </NuxtLink>
              </div>
            </div>

            <!-- 待开始的目标 -->
            <div v-if="upcomingGoals.length > 0" class="mb-6">
              <h4 class="text-sm font-medium text-gray-500 mb-3">待开始</h4>
              <div class="space-y-3">
                <NuxtLink
                  v-for="goal in upcomingGoals"
                  :key="goal.id"
                  :to="`/groups/${groupId}/goals/${goal.id}`"
                  class="block p-4 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors cursor-pointer"
                >
                  <div class="flex items-center justify-between">
                    <div>
                      <p class="font-medium text-foreground">{{ goal.name }}</p>
                      <p class="text-sm text-gray-500 mt-1">{{ goal.category }} · {{ goal.targetValue }} {{ goal.unit }}</p>
                    </div>
                    <span :class="['px-2 py-1 text-xs font-medium rounded-full', getGoalStatusClass(goal.status)]">
                      {{ getGoalStatusText(goal.status) }}
                    </span>
                  </div>
                </NuxtLink>
              </div>
            </div>

            <!-- 待确认的目标 -->
            <div v-if="pendingGoals.length > 0" class="mb-6">
              <h4 class="text-sm font-medium text-gray-500 mb-3">待确认</h4>
              <div class="space-y-3">
                <NuxtLink
                  v-for="goal in pendingGoals"
                  :key="goal.id"
                  :to="`/groups/${groupId}/goals/${goal.id}`"
                  class="block p-4 bg-yellow-50 rounded-lg hover:bg-yellow-100 transition-colors cursor-pointer"
                >
                  <div class="flex items-center justify-between">
                    <div>
                      <p class="font-medium text-foreground">{{ goal.name }}</p>
                      <p class="text-sm text-gray-500 mt-1">{{ goal.category }} · {{ goal.targetValue }} {{ goal.unit }}</p>
                    </div>
                    <span :class="['px-2 py-1 text-xs font-medium rounded-full', getGoalStatusClass(goal.status)]">
                      {{ getGoalStatusText(goal.status) }}
                    </span>
                  </div>
                </NuxtLink>
              </div>
            </div>

            <!-- 历史目标 -->
            <div v-if="otherGoals.length > 0">
              <h4 class="text-sm font-medium text-gray-500 mb-3">历史目标</h4>
              <div class="space-y-3">
                <NuxtLink
                  v-for="goal in otherGoals"
                  :key="goal.id"
                  :to="`/groups/${groupId}/goals/${goal.id}`"
                  class="block p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
                >
                  <div class="flex items-center justify-between">
                    <div>
                      <p class="font-medium text-foreground">{{ goal.name }}</p>
                      <p class="text-sm text-gray-500 mt-1">{{ goal.category }} · {{ goal.targetValue }} {{ goal.unit }}</p>
                    </div>
                    <span :class="['px-2 py-1 text-xs font-medium rounded-full', getGoalStatusClass(goal.status)]">
                      {{ getGoalStatusText(goal.status) }}
                    </span>
                  </div>
                </NuxtLink>
              </div>
            </div>

            <!-- 无目标提示 -->
            <div v-if="!goals || goals.length === 0" class="text-center py-8">
              <p class="text-gray-500 mb-4">暂无目标</p>
              <NuxtLink
                v-if="canCreateGoal"
                :to="`/groups/${groupId}/goals/create`"
                class="inline-block px-6 py-3 bg-cta text-white font-medium rounded-lg hover:opacity-90 transition-opacity cursor-pointer"
              >
                创建第一个目标
              </NuxtLink>
            </div>
          </div>

          <!-- Invite Codes -->
          <div class="bg-white rounded-2xl shadow-lg p-6">
            <h3 class="text-lg font-semibold text-foreground mb-4">
              邀请码 ({{ group.inviteCodes.length }} 个可用)
            </h3>
            <div v-if="group.inviteCodes.length > 0" class="space-y-3">
              <div
                v-for="code in group.inviteCodes"
                :key="code"
                class="flex items-center gap-3"
              >
                <div class="flex-1 bg-gray-50 rounded-lg px-4 py-2 font-mono text-lg tracking-widest">
                  {{ code }}
                </div>
                <button
                  @click="copyInviteCode(code)"
                  class="px-4 py-2 bg-primary text-white font-medium rounded-lg hover:bg-secondary transition-colors cursor-pointer"
                >
                  复制
                </button>
              </div>
            </div>
            <div v-else class="bg-gray-50 rounded-lg px-4 py-3 text-center text-gray-500">
              暂无可用邀请码
            </div>
            <p class="mt-4 text-sm text-gray-500">
              分享邀请码给朋友，让他们加入小组。每个邀请码只能使用一次。
            </p>
          </div>

          <!-- Members -->
          <div class="bg-white rounded-2xl shadow-lg p-6">
            <h3 class="text-lg font-semibold text-foreground mb-4">
              成员列表 ({{ group.memberCount }}/6)
            </h3>
            <div class="divide-y divide-gray-100">
              <div
                v-for="member in group.members"
                :key="member.id"
                class="flex items-center justify-between py-3 first:pt-0 last:pb-0"
              >
                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                    <span class="text-lg font-medium text-gray-600">
                      {{ member.nickname.charAt(0) }}
                    </span>
                  </div>
                  <span class="font-medium text-foreground">{{ member.nickname }}</span>
                </div>
                <span
                  class="px-2 py-1 text-xs font-medium rounded-full"
                  :class="getRoleClass(member.role)"
                >
                  {{ getRoleLabel(member.role) }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </template>
    </main>

    <!-- Toast -->
    <Transition
      enter-active-class="transition-opacity duration-200"
      leave-active-class="transition-opacity duration-200"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <div
        v-if="showCopiedToast"
        class="fixed bottom-8 left-1/2 -translate-x-1/2 bg-gray-800 text-white px-4 py-2 rounded-lg shadow-lg"
      >
        邀请码已复制
      </div>
    </Transition>
  </div>
</template>
