<script setup lang="ts">
import type { GroupDetailResponse } from '~/types/group'
import { getTimezoneLabel } from '~/utils/timezones'

definePageMeta({
  middleware: 'auth',
})

const route = useRoute()
const groupId = Number(route.params.id)

const { data: group, status, error } = await useFetch<GroupDetailResponse>(`/api/groups/${groupId}`)

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
