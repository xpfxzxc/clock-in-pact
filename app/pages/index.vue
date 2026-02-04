<script setup lang="ts">
definePageMeta({
  middleware: 'auth',
})

useHead({
  title: '首页 - 打卡契约',
})

const { user, clear } = useUserSession()

async function handleLogout() {
  await clear()
  await navigateTo('/login')
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
      <div class="bg-white rounded-2xl shadow-lg p-8 text-center">
        <p class="text-gray-600">欢迎回来，{{ user?.nickname }}！</p>
      </div>
    </main>
  </div>
</template>
