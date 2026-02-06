<script setup lang="ts">
import type { CreateGoalRequest, DurationLimitResponse, GoalResponse } from '~/types/goal'
import type { GroupDetailResponse } from '~/types/group'
import { getTimezoneLabel } from '~/utils/timezones'

definePageMeta({
  middleware: 'auth',
})

const route = useRoute()
const groupId = Number(route.params.id)

// 获取小组信息（包含时区）
const { data: group } = await useFetch<GroupDetailResponse>(`/api/groups/${groupId}`)

// 获取指定时区的今天日期字符串 (YYYY-MM-DD)
function getTodayInTimezone(timezone: string): string {
  const now = new Date()
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return formatter.format(now)
}

// 获取指定时区的明天日期字符串 (YYYY-MM-DD)
function getTomorrowInTimezone(timezone: string): string {
  const todayStr = getTodayInTimezone(timezone)
  const parts = todayStr.split('-')
  const year = Number(parts[0])
  const month = Number(parts[1])
  const day = Number(parts[2])
  const tomorrow = new Date(Date.UTC(year, month - 1, day + 1))
  return tomorrow.toISOString().split('T')[0]!
}

useHead({
  title: '创建目标 - 打卡契约',
})

const form = reactive<Omit<CreateGoalRequest, 'groupId'>>({
  name: '',
  category: '',
  targetValue: 0,
  unit: '',
  startDate: '',
  endDate: '',
  rewardPunishment: '',
  evidenceRequirement: '',
})

const errors = reactive({
  name: '',
  category: '',
  targetValue: '',
  unit: '',
  startDate: '',
  endDate: '',
  rewardPunishment: '',
  evidenceRequirement: '',
  general: '',
})

const isSubmitting = ref(false)
const durationLimit = ref<DurationLimitResponse | null>(null)
const isLoadingLimit = ref(false)

// 获取时长限制
async function fetchDurationLimit() {
  if (!form.category.trim()) {
    durationLimit.value = null
    return
  }

  isLoadingLimit.value = true
  try {
    durationLimit.value = await $fetch<DurationLimitResponse>(`/api/groups/${groupId}/duration-limit`, {
      query: { category: form.category.trim() },
    })
  } catch {
    durationLimit.value = null
  } finally {
    isLoadingLimit.value = false
  }
}

// 防抖获取时长限制
let categoryDebounceTimer: ReturnType<typeof setTimeout> | null = null
watch(() => form.category, () => {
  if (categoryDebounceTimer) {
    clearTimeout(categoryDebounceTimer)
  }
  categoryDebounceTimer = setTimeout(() => {
    fetchDurationLimit()
  }, 500)
})

// 计算最大允许结束日期
const maxEndDate = computed(() => {
  if (!form.startDate || !durationLimit.value) return ''

  const startDate = new Date(form.startDate)
  const maxMonths = durationLimit.value.maxAllowedMonths
  const endDate = new Date(startDate)
  endDate.setMonth(endDate.getMonth() + maxMonths)
  endDate.setDate(endDate.getDate() - 1) // 结束日期是开始日期 + N个月 - 1天

  return endDate.toISOString().split('T')[0]
})

// 计算最小开始日期（小组时区的明天）
const minStartDate = computed(() => {
  if (!group.value) return ''
  return getTomorrowInTimezone(group.value.timezone)
})

// 计算目标周期天数
const goalDurationDays = computed(() => {
  if (!form.startDate || !form.endDate) return 0

  const start = new Date(form.startDate)
  const end = new Date(form.endDate)
  const diffTime = end.getTime() - start.getTime()
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1
})

// 格式化显示目标周期
const goalDurationText = computed(() => {
  const days = goalDurationDays.value
  if (days <= 0) return ''

  if (days < 14) {
    return `${days} 天`
  } else if (days < 30) {
    const weeks = Math.round(days / 7)
    return `约 ${weeks} 周`
  } else {
    const months = Math.round(days / 30)
    return `约 ${months} 个月`
  }
})

// 计算目标周期月数（用于时长阶梯校验）
const goalDurationMonths = computed(() => {
  return Math.ceil(goalDurationDays.value / 30)
})

function validateName(): boolean {
  const name = form.name.trim()
  if (!name) {
    errors.name = '请输入目标名称'
    return false
  }
  if (name.length > 50) {
    errors.name = '目标名称不能超过50字符'
    return false
  }
  errors.name = ''
  return true
}

function validateCategory(): boolean {
  const category = form.category.trim()
  if (!category) {
    errors.category = '请输入目标类别'
    return false
  }
  if (category.length > 20) {
    errors.category = '目标类别不能超过20字符'
    return false
  }
  errors.category = ''
  return true
}

function validateTargetValue(): boolean {
  if (!form.targetValue || form.targetValue <= 0) {
    errors.targetValue = '请输入有效的达标数值'
    return false
  }
  errors.targetValue = ''
  return true
}

function validateUnit(): boolean {
  const unit = form.unit.trim()
  if (!unit) {
    errors.unit = '请输入单位'
    return false
  }
  if (unit.length > 10) {
    errors.unit = '单位不能超过10字符'
    return false
  }
  errors.unit = ''
  return true
}

function validateStartDate(): boolean {
  if (!form.startDate) {
    errors.startDate = '请选择开始日期'
    return false
  }
  if (!group.value) {
    errors.startDate = '无法获取小组信息'
    return false
  }
  // 基于小组时区判断：开始日期必须是小组时区的未来日期
  const todayInGroupTz = getTodayInTimezone(group.value.timezone)
  if (form.startDate <= todayInGroupTz) {
    errors.startDate = '开始日期必须是未来日期'
    return false
  }
  errors.startDate = ''
  return true
}

function validateEndDate(): boolean {
  if (!form.endDate) {
    errors.endDate = '请选择结束日期'
    return false
  }
  if (form.startDate && form.endDate < form.startDate) {
    errors.endDate = '结束日期不能早于开始日期'
    return false
  }
  if (maxEndDate.value && form.endDate > maxEndDate.value) {
    errors.endDate = `结束日期不能超过 ${maxEndDate.value}（最长 ${durationLimit.value?.maxAllowedMonths} 个月）`
    return false
  }
  errors.endDate = ''
  return true
}

function validateRewardPunishment(): boolean {
  const text = form.rewardPunishment.trim()
  if (!text) {
    errors.rewardPunishment = '请输入奖惩规则'
    return false
  }
  if (text.length > 200) {
    errors.rewardPunishment = '奖惩规则不能超过200字符'
    return false
  }
  errors.rewardPunishment = ''
  return true
}

function validateEvidenceRequirement(): boolean {
  const text = form.evidenceRequirement.trim()
  if (!text) {
    errors.evidenceRequirement = '请输入证据要求'
    return false
  }
  if (text.length > 200) {
    errors.evidenceRequirement = '证据要求不能超过200字符'
    return false
  }
  errors.evidenceRequirement = ''
  return true
}

function validateForm(): boolean {
  const results = [
    validateName(),
    validateCategory(),
    validateTargetValue(),
    validateUnit(),
    validateStartDate(),
    validateEndDate(),
    validateRewardPunishment(),
    validateEvidenceRequirement(),
  ]
  return results.every(Boolean)
}

async function handleSubmit() {
  errors.general = ''

  if (!validateForm()) {
    return
  }

  isSubmitting.value = true

  try {
    const goal = await $fetch<GoalResponse>('/api/goals', {
      method: 'POST',
      body: {
        groupId,
        name: form.name.trim(),
        category: form.category.trim(),
        targetValue: form.targetValue,
        unit: form.unit.trim(),
        startDate: form.startDate,
        endDate: form.endDate,
        rewardPunishment: form.rewardPunishment.trim(),
        evidenceRequirement: form.evidenceRequirement.trim(),
      } satisfies CreateGoalRequest,
    })
    await navigateTo(`/groups/${groupId}/goals/${goal.id}`)
  } catch (error: any) {
    errors.general = error.data?.message || '创建失败，请稍后重试'
  } finally {
    isSubmitting.value = false
  }
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
        <h1 class="text-xl font-bold text-foreground">创建目标</h1>
      </div>
    </header>

    <main class="max-w-4xl mx-auto px-4 py-8">
      <div class="bg-white rounded-2xl shadow-lg p-8">
        <form @submit.prevent="handleSubmit" class="space-y-6">
          <div v-if="errors.general" class="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm">
            {{ errors.general }}
          </div>

          <!-- 目标名称 -->
          <div>
            <label for="name" class="block text-sm font-medium text-foreground mb-2">
              目标名称 <span class="text-red-500">*</span>
            </label>
            <input
              id="name"
              v-model="form.name"
              type="text"
              maxlength="50"
              class="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-colors"
              :class="{ 'border-red-400 focus:border-red-400 focus:ring-red-400/20': errors.name }"
              placeholder="如：12月跑步挑战"
              @blur="validateName"
            />
            <div class="flex justify-between mt-2">
              <p v-if="errors.name" class="text-sm text-red-500">{{ errors.name }}</p>
              <span v-else></span>
              <span class="text-xs text-gray-400">{{ form.name.length }}/50</span>
            </div>
          </div>

          <!-- 目标类别 -->
          <div>
            <label for="category" class="block text-sm font-medium text-foreground mb-2">
              目标类别 <span class="text-red-500">*</span>
            </label>
            <input
              id="category"
              v-model="form.category"
              type="text"
              maxlength="20"
              class="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-colors"
              :class="{ 'border-red-400 focus:border-red-400 focus:ring-red-400/20': errors.category }"
              placeholder="如：跑步、读书"
              @blur="validateCategory"
            />
            <div class="flex justify-between mt-2">
              <p v-if="errors.category" class="text-sm text-red-500">{{ errors.category }}</p>
              <span v-else class="text-xs text-gray-500">同类目标的完成次数会影响可创建的最长周期</span>
              <span class="text-xs text-gray-400">{{ form.category.length }}/20</span>
            </div>
            <!-- 时长限制提示 -->
            <div v-if="isLoadingLimit" class="mt-2 text-sm text-gray-500">
              正在计算可用周期...
            </div>
            <div v-else-if="durationLimit" class="mt-2 p-3 bg-blue-50 rounded-lg">
              <p class="text-sm text-blue-700">
                当前小组最长可创建 <span class="font-semibold">{{ durationLimit.maxAllowedMonths }} 个月</span>的「{{ form.category }}」目标
              </p>
              <div v-if="durationLimit.challengerLimits.length > 0" class="mt-2 text-xs text-blue-600">
                <span>挑战者限制：</span>
                <span v-for="(limit, index) in durationLimit.challengerLimits" :key="limit.userId">
                  {{ limit.nickname }}（{{ limit.completionCount }}次完成，最长{{ limit.maxAllowedMonths }}个月）<span v-if="index < durationLimit.challengerLimits.length - 1">、</span>
                </span>
              </div>
            </div>
          </div>

          <!-- 达标条件 -->
          <div>
            <label class="block text-sm font-medium text-foreground mb-2">
              达标条件 <span class="text-red-500">*</span>
            </label>
            <div class="flex gap-4">
              <div class="flex-1">
                <input
                  id="targetValue"
                  v-model.number="form.targetValue"
                  type="number"
                  min="0.01"
                  step="0.01"
                  class="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-colors"
                  :class="{ 'border-red-400 focus:border-red-400 focus:ring-red-400/20': errors.targetValue }"
                  placeholder="数值"
                  @blur="validateTargetValue"
                />
                <p v-if="errors.targetValue" class="mt-2 text-sm text-red-500">{{ errors.targetValue }}</p>
              </div>
              <div class="w-32">
                <input
                  id="unit"
                  v-model="form.unit"
                  type="text"
                  maxlength="10"
                  class="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-colors"
                  :class="{ 'border-red-400 focus:border-red-400 focus:ring-red-400/20': errors.unit }"
                  placeholder="单位"
                  @blur="validateUnit"
                />
                <p v-if="errors.unit" class="mt-2 text-sm text-red-500">{{ errors.unit }}</p>
              </div>
            </div>
            <p class="mt-2 text-xs text-gray-500">如：60 公里、10 本</p>
          </div>

          <!-- 日期范围 -->
          <div>
            <div v-if="group" class="mb-2 text-xs text-gray-500">
              日期基于小组时区：{{ getTimezoneLabel(group.timezone) }}
            </div>
            <div class="grid grid-cols-2 gap-4">
            <div>
              <label for="startDate" class="block text-sm font-medium text-foreground mb-2">
                开始日期 <span class="text-red-500">*</span>
              </label>
              <input
                id="startDate"
                v-model="form.startDate"
                type="date"
                :min="minStartDate"
                class="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-colors"
                :class="{ 'border-red-400 focus:border-red-400 focus:ring-red-400/20': errors.startDate }"
                @blur="validateStartDate"
                @change="validateEndDate"
              />
              <p v-if="errors.startDate" class="mt-2 text-sm text-red-500">{{ errors.startDate }}</p>
            </div>
            <div>
              <label for="endDate" class="block text-sm font-medium text-foreground mb-2">
                结束日期 <span class="text-red-500">*</span>
              </label>
              <input
                id="endDate"
                v-model="form.endDate"
                type="date"
                :min="form.startDate || minStartDate"
                :max="maxEndDate || undefined"
                class="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-colors"
                :class="{ 'border-red-400 focus:border-red-400 focus:ring-red-400/20': errors.endDate }"
                @blur="validateEndDate"
              />
              <p v-if="errors.endDate" class="mt-2 text-sm text-red-500">{{ errors.endDate }}</p>
              <p v-else-if="goalDurationText" class="mt-2 text-xs text-gray-500">
                {{ goalDurationText }}
              </p>
            </div>
          </div>
          </div>

          <!-- 奖惩规则 -->
          <div>
            <label for="rewardPunishment" class="block text-sm font-medium text-foreground mb-2">
              奖惩规则 <span class="text-red-500">*</span>
            </label>
            <textarea
              id="rewardPunishment"
              v-model="form.rewardPunishment"
              rows="3"
              maxlength="200"
              class="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-colors resize-none"
              :class="{ 'border-red-400 focus:border-red-400 focus:ring-red-400/20': errors.rewardPunishment }"
              placeholder="如：失败者请成功者吃饭"
              @blur="validateRewardPunishment"
            />
            <div class="flex justify-between mt-2">
              <p v-if="errors.rewardPunishment" class="text-sm text-red-500">{{ errors.rewardPunishment }}</p>
              <span v-else></span>
              <span class="text-xs text-gray-400">{{ form.rewardPunishment.length }}/200</span>
            </div>
          </div>

          <!-- 证据要求 -->
          <div>
            <label for="evidenceRequirement" class="block text-sm font-medium text-foreground mb-2">
              证据要求 <span class="text-red-500">*</span>
            </label>
            <textarea
              id="evidenceRequirement"
              v-model="form.evidenceRequirement"
              rows="3"
              maxlength="200"
              class="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-colors resize-none"
              :class="{ 'border-red-400 focus:border-red-400 focus:ring-red-400/20': errors.evidenceRequirement }"
              placeholder="如：跑步APP截图，需显示日期和距离"
              @blur="validateEvidenceRequirement"
            />
            <div class="flex justify-between mt-2">
              <p v-if="errors.evidenceRequirement" class="text-sm text-red-500">{{ errors.evidenceRequirement }}</p>
              <span v-else></span>
              <span class="text-xs text-gray-400">{{ form.evidenceRequirement.length }}/200</span>
            </div>
          </div>

          <!-- 提示信息 -->
          <div class="bg-gray-50 rounded-lg p-4 space-y-2">
            <p class="text-sm text-gray-600">
              创建后，目标将进入「待确认」状态，需要全体成员在开始日期前确认同意。
            </p>
            <p class="text-sm text-gray-600">
              目标生效需要：全员同意 + 至少1位挑战者 + 至少1位监督者。
            </p>
          </div>

          <button
            type="submit"
            :disabled="isSubmitting"
            class="w-full py-3 px-4 bg-cta text-white font-medium rounded-lg hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span v-if="isSubmitting">创建中...</span>
            <span v-else>创建目标</span>
          </button>
        </form>
      </div>
    </main>
  </div>
</template>
