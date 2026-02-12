<script setup lang="ts">
import type { FeedListResponse } from '~/types/feed'
import type { GroupDetailResponse } from '~/types/group'

definePageMeta({
  middleware: 'auth',
})

const route = useRoute()
const groupId = Number(route.params.id)

const { data: group } = await useFetch<GroupDetailResponse>(`/api/groups/${groupId}`)

useHead({
  title: computed(() => group.value ? `动态 - ${group.value.name} - 打卡契约` : '动态 - 打卡契约'),
})

const timezone = computed(() => group.value?.timezone ?? 'Asia/Shanghai')

const { data: feedData, status } = await useFetch<FeedListResponse>(
  `/api/groups/${groupId}/feed`,
  { query: { limit: 20 } },
)

const events = ref(feedData.value?.events ?? [])
const nextCursor = ref(feedData.value?.nextCursor ?? null)
const loadingMore = ref(false)

watch(feedData, (val) => {
  if (val) {
    events.value = val.events
    nextCursor.value = val.nextCursor
  }
})

async function loadMore() {
  if (!nextCursor.value || loadingMore.value) return
  loadingMore.value = true
  try {
    const data = await $fetch<FeedListResponse>(`/api/groups/${groupId}/feed`, {
      query: { cursor: nextCursor.value, limit: 20 },
    })
    events.value.push(...data.events)
    nextCursor.value = data.nextCursor
  } catch {
    // silently fail, user can retry
  } finally {
    loadingMore.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-background">
    <header class="bg-white shadow-sm">
      <div class="max-w-4xl mx-auto px-4 py-4 flex items-center">
        <NuxtLink
          :to="`/groups/${groupId}`"
          class="text-gray-500 hover:text-primary transition-colors cursor-pointer mr-4"
        >
          <Icon name="lucide:arrow-left" class="w-6 h-6" />
        </NuxtLink>
        <div>
          <h1 class="text-xl font-bold text-foreground">小组动态</h1>
          <p v-if="group" class="text-sm text-gray-500">{{ group.name }}</p>
        </div>
      </div>
    </header>

    <main class="max-w-4xl mx-auto px-4 py-8">
      <!-- Loading -->
      <div v-if="status === 'pending'" class="bg-white rounded-2xl shadow-lg p-8 text-center">
        <p class="text-gray-500">加载中...</p>
      </div>

      <!-- Content -->
      <div v-else-if="events.length > 0" class="bg-white rounded-2xl shadow-lg p-6">
        <div class="divide-y divide-gray-100">
          <BusinessFeedItem
            v-for="event in events"
            :key="event.id"
            :event="event"
            :group-id="groupId"
            :timezone="timezone"
          />
        </div>

        <!-- Load more -->
        <div v-if="nextCursor" class="mt-4 text-center">
          <button
            :disabled="loadingMore"
            class="px-6 py-2 text-sm font-medium text-primary bg-teal-50 rounded-lg hover:bg-teal-100 transition-colors cursor-pointer disabled:opacity-50"
            @click="loadMore"
          >
            {{ loadingMore ? '加载中...' : '加载更多' }}
          </button>
        </div>
      </div>

      <!-- Empty -->
      <div v-else class="bg-white rounded-2xl shadow-lg p-8 text-center">
        <Icon name="lucide:activity" class="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p class="text-gray-500">暂无动态</p>
      </div>
    </main>
  </div>
</template>
