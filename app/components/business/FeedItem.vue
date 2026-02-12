<script setup lang="ts">
import type { FeedEventResponse, FeedEventType } from '~/types/feed'

interface Props {
  event: FeedEventResponse
  groupId: number
  timezone: string
}

const props = defineProps<Props>()

const meta = computed(() => props.event.metadata)

// ── Icon & color config per event type ──

interface EventStyle {
  icon: string
  bgColor: string
  iconColor: string
}

const eventStyleMap: Record<FeedEventType, EventStyle> = {
  GROUP_CREATED: { icon: 'lucide:users', bgColor: 'bg-teal-100', iconColor: 'text-primary' },
  MEMBER_JOINED: { icon: 'lucide:user-plus', bgColor: 'bg-blue-100', iconColor: 'text-blue-600' },
  GOAL_CREATED: { icon: 'lucide:target', bgColor: 'bg-purple-100', iconColor: 'text-purple-600' },
  GOAL_CONFIRMED: { icon: 'lucide:check-circle', bgColor: 'bg-green-100', iconColor: 'text-green-600' },
  CHANGE_REQUEST_INITIATED: { icon: 'lucide:file-edit', bgColor: 'bg-amber-100', iconColor: 'text-amber-600' },
  CHANGE_REQUEST_CONFIRMED: { icon: 'lucide:check-check', bgColor: 'bg-indigo-100', iconColor: 'text-indigo-600' },
  CHECKIN_SUBMITTED: { icon: 'lucide:clipboard-check', bgColor: 'bg-teal-100', iconColor: 'text-primary' },
  REVIEW_SUBMITTED: { icon: 'lucide:eye', bgColor: 'bg-blue-100', iconColor: 'text-blue-600' },
  SETTLEMENT_CONFIRMED: { icon: 'lucide:badge-check', bgColor: 'bg-green-100', iconColor: 'text-green-600' },
  GOAL_STATUS_CHANGED: { icon: 'lucide:arrow-right-left', bgColor: 'bg-gray-100', iconColor: 'text-gray-600' },
  GOAL_AUTO_APPROVED: { icon: 'lucide:shield-check', bgColor: 'bg-indigo-100', iconColor: 'text-indigo-600' },
  CHANGE_REQUEST_AUTO_APPROVED: { icon: 'lucide:bot', bgColor: 'bg-indigo-100', iconColor: 'text-indigo-600' },
  CHALLENGER_AUTO_ENROLLED: { icon: 'lucide:user-check', bgColor: 'bg-teal-100', iconColor: 'text-primary' },
  GOAL_CONFIRMATION_RESET: { icon: 'lucide:rotate-ccw', bgColor: 'bg-amber-100', iconColor: 'text-amber-600' },
  CHANGE_REQUEST_RESULT: { icon: 'lucide:vote', bgColor: 'bg-gray-100', iconColor: 'text-gray-600' },
  CHECKIN_CONFIRMED: { icon: 'lucide:circle-check-big', bgColor: 'bg-green-100', iconColor: 'text-green-600' },
  CHECKIN_AUTO_APPROVED: { icon: 'lucide:timer', bgColor: 'bg-amber-100', iconColor: 'text-amber-600' },
  SETTLEMENT_COMPLETED: { icon: 'lucide:trophy', bgColor: 'bg-orange-100', iconColor: 'text-cta' },
}

const style = computed(() => eventStyleMap[props.event.eventType])

// ── Status label mapping ──

const goalStatusLabel: Record<string, string> = {
  PENDING: '待确认',
  UPCOMING: '待开始',
  ACTIVE: '进行中',
  SETTLING: '待结算',
  ARCHIVED: '已归档',
  VOIDED: '已作废',
  CANCELLED: '已取消',
}

const changeRequestResultLabel: Record<string, string> = {
  APPROVED: '通过',
  REJECTED: '拒绝',
  EXPIRED: '过期',
  VOIDED: '作废',
}

// ── Time formatting ──

const formattedTime = computed(() => {
  const date = new Date(props.event.createdAt)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHour = Math.floor(diffMs / 3600000)
  const diffDay = Math.floor(diffMs / 86400000)

  if (diffMin < 1) return '刚刚'
  if (diffMin < 60) return `${diffMin} 分钟前`
  if (diffHour < 24) return `${diffHour} 小时前`
  if (diffDay < 7) return `${diffDay} 天前`

  return new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: props.timezone,
  }).format(date)
})
</script>

<template>
  <div class="flex gap-3 py-3">
    <!-- Icon -->
    <div
      class="w-9 h-9 rounded-full flex items-center justify-center shrink-0 mt-0.5"
      :class="style.bgColor"
    >
      <Icon :name="style.icon" class="w-4.5 h-4.5" :class="style.iconColor" />
    </div>

    <!-- Content -->
    <div class="flex-1 min-w-0">
      <p class="text-sm text-foreground leading-relaxed">
        <!-- GROUP_CREATED -->
        <template v-if="event.eventType === 'GROUP_CREATED'">
          <span class="font-semibold">{{ event.actorNickname }}</span>
          创建了小组
        </template>

        <!-- MEMBER_JOINED -->
        <template v-else-if="event.eventType === 'MEMBER_JOINED'">
          <span class="font-semibold">{{ event.actorNickname }}</span>
          以{{ (meta.role as string) === 'CHALLENGER' ? '挑战者' : '监督者' }}身份加入了小组
          <span class="text-gray-400 text-xs ml-1">邀请码 {{ meta.inviteCode }}</span>
        </template>

        <!-- GOAL_CREATED -->
        <template v-else-if="event.eventType === 'GOAL_CREATED'">
          <span class="font-semibold">{{ event.actorNickname }}</span>
          创建了目标
          <NuxtLink
            :to="`/groups/${groupId}/goals/${meta.goalId}`"
            class="font-medium text-primary hover:underline cursor-pointer"
          >{{ meta.goalName }}#{{ meta.goalId }}</NuxtLink>
        </template>

        <!-- GOAL_CONFIRMED -->
        <template v-else-if="event.eventType === 'GOAL_CONFIRMED'">
          <span class="font-semibold">{{ event.actorNickname }}</span>
          {{ (meta.status as string) === 'APPROVED' ? '同意' : '拒绝' }}了目标
          <NuxtLink
            :to="`/groups/${groupId}/goals/${meta.goalId}`"
            class="font-medium text-primary hover:underline cursor-pointer"
          >{{ meta.goalName }}#{{ meta.goalId }}</NuxtLink>
        </template>

        <!-- CHANGE_REQUEST_INITIATED -->
        <template v-else-if="event.eventType === 'CHANGE_REQUEST_INITIATED'">
          <span class="font-semibold">{{ event.actorNickname }}</span>
          发起了目标{{ (meta.type as string) === 'MODIFY' ? '修改' : '取消' }}请求#{{ meta.requestId }}
          <NuxtLink
            :to="`/groups/${groupId}/goals/${meta.goalId}`"
            class="font-medium text-primary hover:underline cursor-pointer"
          >{{ meta.goalName }}#{{ meta.goalId }}</NuxtLink>
        </template>

        <!-- CHECKIN_SUBMITTED -->
        <template v-else-if="event.eventType === 'CHANGE_REQUEST_CONFIRMED'">
          <span class="font-semibold">{{ event.actorNickname }}</span>
          {{ (meta.status as string) === 'APPROVED' ? '同意' : '拒绝' }}了目标{{ (meta.type as string) === 'MODIFY' ? '修改' : '取消' }}请求#{{ meta.requestId }}
          <NuxtLink
            :to="`/groups/${groupId}/goals/${meta.goalId}`"
            class="font-medium text-primary hover:underline cursor-pointer"
          >{{ meta.goalName }}#{{ meta.goalId }}</NuxtLink>
        </template>

        <!-- CHECKIN_SUBMITTED -->
        <template v-else-if="event.eventType === 'CHECKIN_SUBMITTED'">
          <span class="font-semibold">{{ event.actorNickname }}</span>
          提交了打卡#{{ meta.checkinId }}
          <span v-if="meta.checkinDate || meta.evidenceCount !== undefined" class="text-gray-500">
            （
            <span v-if="meta.checkinDate">打卡日期 {{ meta.checkinDate }}</span>
            <span v-if="meta.checkinDate && meta.evidenceCount !== undefined">，</span>
            <span v-if="meta.evidenceCount !== undefined">截图 {{ meta.evidenceCount }} 张</span>
            ）
          </span>
          <NuxtLink
            :to="`/groups/${groupId}/goals/${meta.goalId}`"
            class="font-medium text-primary hover:underline cursor-pointer"
          >{{ meta.goalName }}#{{ meta.goalId }}</NuxtLink>
          <span class="ml-1 px-1.5 py-0.5 text-xs font-semibold bg-teal-100 text-primary rounded">
            {{ meta.value }} {{ meta.unit }}
          </span>
        </template>

        <!-- REVIEW_SUBMITTED -->
        <template v-else-if="event.eventType === 'REVIEW_SUBMITTED'">
          <span class="font-semibold">{{ event.actorNickname }}</span>
          {{ (meta.action as string) === 'CONFIRMED' ? '确认' : '质疑' }}了
          <span class="font-semibold">{{ meta.checkinOwnerNickname }}</span>
          的打卡#{{ meta.checkinId }}
          <span
            v-if="meta.checkinDate || meta.evidenceCount !== undefined"
            class="text-gray-500"
          >
            （
            <span v-if="meta.checkinDate">打卡日期 {{ meta.checkinDate }}</span>
            <span v-if="meta.checkinDate && meta.evidenceCount !== undefined">，</span>
            <span v-if="meta.evidenceCount !== undefined">截图 {{ meta.evidenceCount }} 张</span>
            ）
          </span>
          <NuxtLink
            :to="`/groups/${groupId}/goals/${meta.goalId}`"
            class="font-medium text-primary hover:underline cursor-pointer"
          >{{ meta.goalName }}#{{ meta.goalId }}</NuxtLink>
          <span
            v-if="meta.value !== undefined"
            class="ml-1 px-1.5 py-0.5 text-xs font-semibold bg-blue-100 text-blue-700 rounded"
          >
            {{ meta.value }} {{ meta.unit }}
          </span>
        </template>

        <!-- SETTLEMENT_CONFIRMED -->
        <template v-else-if="event.eventType === 'SETTLEMENT_CONFIRMED'">
          <span class="font-semibold">{{ event.actorNickname }}</span>
          确认了结算
          <NuxtLink
            :to="`/groups/${groupId}/goals/${meta.goalId}`"
            class="font-medium text-primary hover:underline cursor-pointer"
          >{{ meta.goalName }}#{{ meta.goalId }}</NuxtLink>
        </template>

        <!-- GOAL_STATUS_CHANGED (system) -->
        <template v-else-if="event.eventType === 'GOAL_STATUS_CHANGED'">
          目标
          <NuxtLink
            :to="`/groups/${groupId}/goals/${meta.goalId}`"
            class="font-medium text-primary hover:underline cursor-pointer"
          >{{ meta.goalName }}#{{ meta.goalId }}</NuxtLink>
          状态变更为
          <span class="font-medium">{{ goalStatusLabel[meta.toStatus as string] || meta.toStatus }}</span>
        </template>

        <!-- CHANGE_REQUEST_AUTO_APPROVED (system) -->
        <template v-else-if="event.eventType === 'CHANGE_REQUEST_AUTO_APPROVED'">
          发起人已自动同意目标{{ (meta.type as string) === 'MODIFY' ? '修改' : '取消' }}请求#{{ meta.requestId }}
          <NuxtLink
            :to="`/groups/${groupId}/goals/${meta.goalId}`"
            class="font-medium text-primary hover:underline cursor-pointer"
          >{{ meta.goalName }}#{{ meta.goalId }}</NuxtLink>
        </template>

        <!-- GOAL_AUTO_APPROVED (system) -->
        <template v-else-if="event.eventType === 'GOAL_AUTO_APPROVED'">
          创建者已自动同意目标
          <NuxtLink
            :to="`/groups/${groupId}/goals/${meta.goalId}`"
            class="font-medium text-primary hover:underline cursor-pointer"
          >{{ meta.goalName }}#{{ meta.goalId }}</NuxtLink>
        </template>

        <!-- CHALLENGER_AUTO_ENROLLED (system) -->
        <template v-else-if="event.eventType === 'CHALLENGER_AUTO_ENROLLED'">
          <span class="font-semibold">{{ meta.challengerNickname }}</span>
          已自动参与目标
          <NuxtLink
            :to="`/groups/${groupId}/goals/${meta.goalId}`"
            class="font-medium text-primary hover:underline cursor-pointer"
          >{{ meta.goalName }}#{{ meta.goalId }}</NuxtLink>
        </template>

        <!-- GOAL_CONFIRMATION_RESET (system) -->
        <template v-else-if="event.eventType === 'GOAL_CONFIRMATION_RESET'">
          目标
          <NuxtLink
            :to="`/groups/${groupId}/goals/${meta.goalId}`"
            class="font-medium text-primary hover:underline cursor-pointer"
          >{{ meta.goalName }}#{{ meta.goalId }}</NuxtLink>
          的确认状态已重置（请求#{{ meta.requestId }}）
        </template>

        <!-- CHANGE_REQUEST_RESULT (system) -->
        <template v-else-if="event.eventType === 'CHANGE_REQUEST_RESULT'">
          目标{{ (meta.type as string) === 'MODIFY' ? '修改' : '取消' }}请求#{{ meta.requestId }}
          已{{ changeRequestResultLabel[meta.result as string] || meta.result }}
          <NuxtLink
            :to="`/groups/${groupId}/goals/${meta.goalId}`"
            class="font-medium text-primary hover:underline cursor-pointer"
          >{{ meta.goalName }}#{{ meta.goalId }}</NuxtLink>
        </template>

        <!-- CHECKIN_CONFIRMED (system) -->
        <template v-else-if="event.eventType === 'CHECKIN_CONFIRMED'">
          <span class="font-semibold">{{ meta.checkinOwnerNickname || '挑战者' }}</span>
          的打卡#{{ meta.checkinId }} 已确认
          <span v-if="meta.checkinOwnerNickname || meta.checkinDate" class="text-gray-500">
            （
            <span v-if="meta.checkinDate">打卡日期 {{ meta.checkinDate }}</span>
            <span v-if="meta.checkinDate && meta.evidenceCount !== undefined">，</span>
            <span v-if="meta.evidenceCount !== undefined">截图 {{ meta.evidenceCount }} 张</span>
            ）
          </span>
          <NuxtLink
            :to="`/groups/${groupId}/goals/${meta.goalId}`"
            class="font-medium text-primary hover:underline cursor-pointer"
          >{{ meta.goalName }}#{{ meta.goalId }}</NuxtLink>
          <span class="ml-1 px-1.5 py-0.5 text-xs font-semibold bg-green-100 text-green-700 rounded">
            {{ meta.value }} {{ meta.unit }}
          </span>
        </template>

        <!-- CHECKIN_AUTO_APPROVED (system) -->
        <template v-else-if="event.eventType === 'CHECKIN_AUTO_APPROVED'">
          <span class="font-semibold">{{ meta.checkinOwnerNickname || '挑战者' }}</span>
          的打卡#{{ meta.checkinId }} 已自动通过
          <span v-if="meta.checkinOwnerNickname || meta.checkinDate" class="text-gray-500">
            （
            <span v-if="meta.checkinDate">打卡日期 {{ meta.checkinDate }}</span>
            <span v-if="meta.checkinDate && meta.evidenceCount !== undefined">，</span>
            <span v-if="meta.evidenceCount !== undefined">截图 {{ meta.evidenceCount }} 张</span>
            ）
          </span>
          <NuxtLink
            :to="`/groups/${groupId}/goals/${meta.goalId}`"
            class="font-medium text-primary hover:underline cursor-pointer"
          >{{ meta.goalName }}#{{ meta.goalId }}</NuxtLink>
          <span class="ml-1 px-1.5 py-0.5 text-xs font-semibold bg-amber-100 text-amber-700 rounded">
            {{ meta.value }} {{ meta.unit }}
          </span>
        </template>

        <!-- SETTLEMENT_COMPLETED (system) -->
        <template v-else-if="event.eventType === 'SETTLEMENT_COMPLETED'">
          目标
          <NuxtLink
            :to="`/groups/${groupId}/goals/${meta.goalId}`"
            class="font-medium text-primary hover:underline cursor-pointer"
          >{{ meta.goalName }}#{{ meta.goalId }}</NuxtLink>
          已完成结算
        </template>
      </p>

      <!-- Time -->
      <p class="text-xs text-gray-400 mt-1">{{ formattedTime }}</p>
    </div>
  </div>
</template>
