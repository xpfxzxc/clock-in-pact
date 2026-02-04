<script setup lang="ts">
definePageMeta({
  middleware: 'guest',
})

useHead({
  title: '登录 - 打卡契约',
})

const form = reactive({
  username: '',
  password: '',
  rememberMe: false,
})

const errors = reactive({
  username: '',
  password: '',
  general: '',
})

const isSubmitting = ref(false)
const { fetch: refreshSession } = useUserSession()

function validateUsername(): boolean {
  if (!form.username) {
    errors.username = '请输入用户名'
    return false
  }
  errors.username = ''
  return true
}

function validatePassword(): boolean {
  if (!form.password) {
    errors.password = '请输入密码'
    return false
  }
  errors.password = ''
  return true
}

function validateForm(): boolean {
  const isUsernameValid = validateUsername()
  const isPasswordValid = validatePassword()
  return isUsernameValid && isPasswordValid
}

async function handleSubmit() {
  errors.general = ''

  if (!validateForm()) {
    return
  }

  isSubmitting.value = true

  try {
    await $fetch('/api/auth/login', {
      method: 'POST',
      body: {
        username: form.username,
        password: form.password,
        rememberMe: form.rememberMe,
      },
    })
    await refreshSession()
    await navigateTo('/')
  } catch (error: any) {
    errors.general = error.data?.message || '登录失败，请稍后重试'
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-background flex items-center justify-center px-4">
    <div class="w-full max-w-md">
      <div class="bg-white rounded-2xl shadow-lg p-8">
        <h1 class="text-2xl font-bold text-foreground text-center mb-8">
          登录
        </h1>

        <form @submit.prevent="handleSubmit" class="space-y-6">
          <div v-if="errors.general" class="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm">
            {{ errors.general }}
          </div>

          <div>
            <label for="username" class="block text-sm font-medium text-foreground mb-2">
              用户名
            </label>
            <input
              id="username"
              v-model="form.username"
              type="text"
              autocomplete="username"
              class="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-colors"
              :class="{ 'border-red-400 focus:border-red-400 focus:ring-red-400/20': errors.username }"
              placeholder="请输入用户名"
              @blur="validateUsername"
            />
            <p v-if="errors.username" class="mt-2 text-sm text-red-500">
              {{ errors.username }}
            </p>
          </div>

          <div>
            <label for="password" class="block text-sm font-medium text-foreground mb-2">
              密码
            </label>
            <input
              id="password"
              v-model="form.password"
              type="password"
              autocomplete="current-password"
              class="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-colors"
              :class="{ 'border-red-400 focus:border-red-400 focus:ring-red-400/20': errors.password }"
              placeholder="请输入密码"
              @blur="validatePassword"
            />
            <p v-if="errors.password" class="mt-2 text-sm text-red-500">
              {{ errors.password }}
            </p>
          </div>

          <div class="flex items-center">
            <input
              id="rememberMe"
              v-model="form.rememberMe"
              type="checkbox"
              class="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary cursor-pointer"
            />
            <label for="rememberMe" class="ml-2 text-sm text-gray-600 cursor-pointer">
              记住我（7天内免登录）
            </label>
          </div>

          <button
            type="submit"
            :disabled="isSubmitting"
            class="w-full py-3 px-4 bg-primary text-white font-medium rounded-lg hover:bg-secondary transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span v-if="isSubmitting">登录中...</span>
            <span v-else>登录</span>
          </button>
        </form>

        <p class="mt-6 text-center text-sm text-gray-600">
          还没有账号？
          <NuxtLink to="/register" class="text-primary hover:text-secondary font-medium cursor-pointer">
            立即注册
          </NuxtLink>
        </p>
      </div>
    </div>
  </div>
</template>
