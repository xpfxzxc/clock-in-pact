<script setup lang="ts">
import type { SettlementConfirmationInfo } from '~/types/settlement'

interface Props {
  goalId: number
  hasPendingCheckins: boolean
  confirmations: SettlementConfirmationInfo[]
  confirmedCount: number
  totalCount: number
  isSupervisor: boolean
  myMemberId: number
}

const props = defineProps<Props>()
const emit = defineEmits<{
  confirmed: []
}>()

const isConfirming = ref(false)
const confirmError = ref('')

const myConfirmation = computed(() =>
  props.confirmations.find(c => c.memberId === props.myMemberId),
)
const hasConfirmed = computed(() => myConfirmation.value?.confirmed === true)
const canConfirm = computed(() =>
  props.isSupervisor && !hasConfirmed.value && !props.hasPendingCheckins,
)

async function handleConfirm() {
  isConfirming.value = true
  confirmError.value = ''
  try {
    await $fetch(`/api/goals/${props.goalId}/settlement/confirm`, {
      method: 'POST',
    })
    emit('confirmed')
  }
  catch (err: any) {
    confirmError.value = err.data?.message || '确认失败，请稍后重试'
  }
  finally {
    isConfirming.value = false
  }
}
</script>

<template>
  <div class="bg-white rounded-2xl shadow-lg p-6 space-y-4">
    <!-- Header -->
    <div class="flex items-center gap-2">
      <Icon name="lucide:scale" class="w-5 h-5 text-primary" />
      <h3 class="text-lg font-semibold text-foreground">
        {{ isSupervisor ? '结算确认' : '结算进度' }}
      </h3>
    </div>

    <!-- Info banner -->
    <div class="flex items-start gap-3 px-4 py-3 bg-teal-50 rounded-xl">
      <Icon name="lucide:info" class="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
      <p class="text-sm text-foreground/80">
        {{ isSupervisor
          ? '目标周期已结束，进入结算阶段。全体监督者确认结算后，系统将判定达标情况并归档。'
          : '目标周期已结束，进入结算阶段。当前正在等待全体监督者完成结算确认。' }}
      </p>
    </div>

    <!-- Pending checkins warning -->
    <div
      v-if="hasPendingCheckins"
      class="flex items-start gap-3 px-4 py-3 bg-amber-50 rounded-xl"
    >
      <Icon name="lucide:alert-triangle" class="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
      <p class="text-sm text-amber-700">
        仍有待审核的打卡记录，请先完成审核后再确认结算。
      </p>
    </div>

    <!-- Confirmation progress -->
    <div>
      <div class="flex items-center justify-between mb-2">
        <p class="text-sm text-gray-500">确认进度</p>
        <p class="text-sm font-semibold text-foreground">
          {{ confirmedCount }} / {{ totalCount }}
        </p>
      </div>
      <div class="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          class="h-full bg-primary rounded-full transition-all duration-500"
          :style="{ width: totalCount > 0 ? `${(confirmedCount / totalCount) * 100}%` : '0%' }"
        />
      </div>
    </div>

    <!-- Supervisor list -->
    <div class="space-y-2">
      <div
        v-for="conf in confirmations"
        :key="conf.memberId"
        class="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50"
      >
        <div class="flex items-center gap-2">
          <div class="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
            <span class="text-xs font-medium text-primary">{{ conf.nickname[0] }}</span>
          </div>
          <span class="text-sm text-foreground">{{ conf.nickname }}</span>
        </div>
        <span
          v-if="conf.confirmed"
          class="text-xs font-medium text-emerald-600 flex items-center gap-1"
        >
          <Icon name="lucide:check-circle" class="w-3.5 h-3.5" />
          已确认
        </span>
        <span v-else class="text-xs text-gray-400">待确认</span>
      </div>
    </div>

    <!-- Error -->
    <p v-if="confirmError" class="text-sm text-red-500">{{ confirmError }}</p>

    <!-- Confirm button (supervisor only) -->
    <button
      v-if="isSupervisor && !hasConfirmed"
      :disabled="!canConfirm || isConfirming"
      :class="[
        'w-full py-3 rounded-xl text-sm font-semibold transition-colors cursor-pointer',
        canConfirm && !isConfirming
          ? 'bg-primary text-white hover:bg-primary/90'
          : 'bg-gray-200 text-gray-400 cursor-not-allowed',
      ]"
      @click="handleConfirm"
    >
      {{ isConfirming ? '确认中...' : '确认结算' }}
    </button>

    <!-- Already confirmed -->
    <div
      v-if="isSupervisor && hasConfirmed"
      class="flex items-center justify-center gap-2 py-3 bg-emerald-50 rounded-xl"
    >
      <Icon name="lucide:check-circle" class="w-4 h-4 text-emerald-500" />
      <span class="text-sm font-medium text-emerald-700">您已确认结算</span>
    </div>
  </div>
</template>
