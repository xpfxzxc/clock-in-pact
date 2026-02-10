<script setup lang="ts">
import type { GoalDetailResponse } from '~/types/goal'
import type { GroupDetailResponse } from '~/types/group'
import type { CheckinResponse } from '~/types/checkin'

definePageMeta({
  middleware: 'auth',
})

const route = useRoute()
const groupId = Number(route.params.id)
const goalId = Number(route.params.goalId)

const { data: goal } = await useFetch<GoalDetailResponse>(`/api/goals/${goalId}`)
const { data: group } = await useFetch<GroupDetailResponse>(`/api/groups/${groupId}`)

useHead({
  title: computed(() => goal.value ? `打卡 - ${goal.value.name}` : '打卡 - 打卡契约'),
})

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

const timezone = computed(() => group.value?.timezone ?? 'Asia/Shanghai')
const todayStr = computed(() => getTodayInTimezone(timezone.value))

const form = reactive({
  checkinDate: '',
  value: 0,
  note: '',
})

const isDateEdited = ref(false)

watch(todayStr, (today) => {
  if (isDateEdited.value)
    return
  form.checkinDate = today
}, { immediate: true })

const files = ref<File[]>([])
const isSubmitting = ref(false)
const submitError = ref('')

function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  if (!input.files) return

  const newFiles = Array.from(input.files)
  const combined = [...files.value, ...newFiles]

  if (combined.length > 5) {
    submitError.value = '最多上传5张图片'
    input.value = ''
    return
  }

  for (const file of newFiles) {
    if (file.size > 5 * 1024 * 1024) {
      submitError.value = `图片 ${file.name} 超过5MB`
      input.value = ''
      return
    }
  }

  submitError.value = ''
  files.value = combined
  input.value = ''
}

function removeFile(index: number) {
  files.value = files.value.filter((_, i) => i !== index)
}

function getFilePreviewUrl(file: File): string {
  return URL.createObjectURL(file)
}

const canSubmit = computed(() => {
  if (!goal.value) return false
  if (form.value <= 0) return false
  if (files.value.length < 1 || files.value.length > 5) return false
  if (!form.checkinDate) return false
  if (form.checkinDate < goal.value.startDate) return false
  if (form.checkinDate > goal.value.endDate) return false
  if (form.checkinDate > todayStr.value) return false
  return true
})

function handleDateChange() {
  isDateEdited.value = true
}

async function handleSubmit() {
  if (!canSubmit.value || isSubmitting.value) return

  isSubmitting.value = true
  submitError.value = ''

  try {
    const formData = new FormData()
    formData.append('goalId', String(goalId))
    formData.append('checkinDate', form.checkinDate)
    formData.append('value', String(form.value))
    if (form.note) {
      formData.append('note', form.note)
    }
    for (const file of files.value) {
      formData.append('evidence', file)
    }

    await $fetch<CheckinResponse>('/api/checkins', {
      method: 'POST',
      body: formData,
    })

    await navigateTo(`/groups/${groupId}/goals/${goalId}`)
  } catch (err: any) {
    submitError.value = err.data?.message || '提交失败，请稍后重试'
  } finally {
    isSubmitting.value = false
  }
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
        <h1 class="text-xl font-bold text-foreground">打卡</h1>
      </div>
    </header>

    <main class="max-w-4xl mx-auto px-4 py-8">
      <div v-if="!goal || !group" class="bg-white rounded-2xl shadow-lg p-8 text-center">
        <p class="text-gray-500">加载中...</p>
      </div>

      <div v-else class="space-y-6">
        <!-- 目标信息 -->
        <div class="bg-white rounded-2xl shadow-lg p-6">
          <h2 class="text-lg font-semibold text-foreground">{{ goal.name }}</h2>
          <p class="text-sm text-gray-500 mt-1">
            目标：{{ goal.targetValue }} {{ goal.unit }} | {{ goal.startDate }} ~ {{ goal.endDate }}
          </p>
        </div>

        <!-- 打卡表单 -->
        <div class="bg-white rounded-2xl shadow-lg p-6">
          <h3 class="text-lg font-semibold text-foreground mb-4">填写打卡信息</h3>

          <div v-if="submitError" class="mb-4 bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm">
            {{ submitError }}
          </div>

          <div class="space-y-4">
            <!-- 打卡日期 -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">打卡日期</label>
              <input
                v-model="form.checkinDate"
                type="date"
                :min="goal.startDate"
                :max="todayStr"
                class="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                @change="handleDateChange"
              />
              <p class="text-xs text-gray-400 mt-1">可补打 {{ goal.startDate }} 至今的卡</p>
            </div>

            <!-- 数值 -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                数值 ({{ goal.unit }})
              </label>
              <input
                v-model.number="form.value"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="请输入数值"
                class="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>

            <!-- 证据截图 -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                证据截图 ({{ files.length }}/5)
              </label>
              <div v-if="files.length > 0" class="mb-3">
                <div v-viewer="{ navbar: false }" class="flex flex-wrap gap-3">
                  <div
                    v-for="(file, index) in files"
                    :key="index"
                    class="relative w-20 h-20 rounded-lg overflow-hidden bg-gray-100"
                  >
                    <img
                      :src="getFilePreviewUrl(file)"
                      :alt="file.name"
                      class="w-full h-full object-cover cursor-pointer hover:opacity-80 transition-opacity"
                    />
                    <button
                      type="button"
                      class="absolute top-0.5 right-0.5 w-5 h-5 bg-black/50 rounded-full flex items-center justify-center cursor-pointer"
                      @click.stop="removeFile(index)"
                    >
                      <Icon name="lucide:x" class="w-3 h-3 text-white" />
                    </button>
                  </div>
                </div>
              </div>
              <label
                v-if="files.length < 5"
                class="inline-flex items-center gap-2 px-4 py-2 bg-gray-50 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
              >
                <Icon name="lucide:image-plus" class="w-5 h-5" />
                <span class="text-sm">选择图片</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  class="hidden"
                  @change="handleFileChange"
                />
              </label>
              <p class="text-xs text-gray-400 mt-1">1-5张，每张不超过5MB</p>
            </div>

            <!-- 备注 -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">备注（选填）</label>
              <textarea
                v-model="form.note"
                rows="2"
                maxlength="500"
                placeholder="记录一下今天的感受..."
                class="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
              />
            </div>
          </div>

          <!-- 提交按钮 -->
          <button
            :disabled="!canSubmit || isSubmitting"
            class="w-full mt-6 py-3 px-4 bg-primary text-white font-medium rounded-lg hover:bg-primary/90 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            @click="handleSubmit"
          >
            {{ isSubmitting ? '提交中...' : '提交打卡' }}
          </button>
        </div>
      </div>
    </main>
  </div>
</template>
