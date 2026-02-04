<script setup lang="ts">
import type { GroupResponse } from '~/types/group'

definePageMeta({
  middleware: 'auth',
})

useHead({
  title: '我的小组 - 打卡契约',
})

const { user, clear } = useUserSession()

const { data: groups, status, refresh } = await useFetch<GroupResponse[]>('/api/groups')

async function handleLogout() {
  await clear()
  await navigateTo('/login')
}

function getRoleLabel(role?: string) {
  return role === 'CHALLENGER' ? '挑战者' : '监督者'
}
</script>

<template>
  <div class="min-h-screen bg-background">
    <header class="bg-white shadow-sm">
      <div class="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
        <h1 class="text-xl font-bold text-foreground">打卡契约</h1>
        <div class="flex items-center gap-4">
          <span class="text-sm text-gray-600">{{ user?.nickname }}</span>
          <button
            @click="handleLogout"
            class="text-sm text-gray-500 hover:text-primary transition-colors cursor-pointer"
          >
            退出登录
          </button>
        </div>
      </div>
    </header>

    <main class="max-w-4xl mx-auto px-4 py-8">
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-lg font-semibold text-foreground">我的小组</h2>
        <div class="flex gap-3">
          <NuxtLink
            to="/groups/join"
            class="px-4 py-2 border-2 border-primary text-primary font-medium rounded-lg hover:bg-primary/5 transition-colors cursor-pointer"
          >
            加入小组
          </NuxtLink>
          <NuxtLink
            to="/groups/create"
            class="px-4 py-2 bg-cta text-white font-medium rounded-lg hover:opacity-90 transition-opacity cursor-pointer"
          >
            创建小组
          </NuxtLink>
        </div>
      </div>

      <div v-if="status === 'pending'" class="bg-white rounded-2xl shadow-lg p-8 text-center">
        <p class="text-gray-500">加载中...</p>
      </div>

      <div v-else-if="!groups || groups.length === 0" class="bg-white rounded-2xl shadow-lg p-8 text-center">
        <p class="text-gray-600 mb-4">您还没有加入任何小组</p>
        <p class="text-sm text-gray-500">创建一个新小组或使用邀请码加入现有小组</p>
      </div>

      <div v-else class="space-y-4">
        <NuxtLink
          v-for="group in groups"
          :key="group.id"
          :to="`/groups/${group.id}`"
          class="block bg-white rounded-xl shadow-md p-6 hover:shadow-lg transition-shadow cursor-pointer"
        >
          <div class="flex items-start justify-between">
            <div class="flex-1 min-w-0">
              <h3 class="text-lg font-semibold text-foreground truncate">{{ group.name }}</h3>
              <p v-if="group.description" class="mt-1 text-sm text-gray-600 line-clamp-2">
                {{ group.description }}
              </p>
            </div>
            <span
              class="ml-4 px-3 py-1 text-xs font-medium rounded-full shrink-0"
              :class="group.myRole === 'CHALLENGER' ? 'bg-primary/10 text-primary' : 'bg-cta/10 text-cta'"
            >
              {{ getRoleLabel(group.myRole) }}
            </span>
          </div>
          <div class="mt-4 flex items-center text-sm text-gray-500">
            <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            {{ group.memberCount }} 名成员
          </div>
        </NuxtLink>
      </div>
    </main>
  </div>
</template>
