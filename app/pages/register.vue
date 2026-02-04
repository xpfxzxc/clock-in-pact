<script setup lang="ts">
definePageMeta({
  middleware: 'guest',
})

useHead({
  title: '注册 - 打卡契约',
})

const form = reactive({
  username: '',
  password: '',
  nickname: '',
})

const errors = reactive({
  username: '',
  password: '',
  nickname: '',
  general: '',
})

const isSubmitting = ref(false)
const { fetch: refreshSession } = useUserSession()

const usernameRules = {
  pattern: /^[a-zA-Z0-9]{3,20}$/,
  message: '用户名需为3-20位英文或数字',
}

const passwordRules = {
  min: 8,
  max: 20,
  message: '密码需为8-20位',
}

const nicknameRules = {
  minUnits: 1,
  maxUnits: 10,
  message: '昵称需为1-10字符（中文=1，英文/数字=0.5）',
}

function calculateNicknameLengthUnits(nickname: string): number {
  let units = 0
  for (const char of nickname) {
    units += /[A-Za-z0-9]/.test(char) ? 0.5 : 1
  }
  return units
}

function validateUsername(): boolean {
  if (!form.username) {
    errors.username = '请输入用户名'
    return false
  }
  if (!usernameRules.pattern.test(form.username)) {
    errors.username = usernameRules.message
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
  if (form.password.length < passwordRules.min || form.password.length > passwordRules.max) {
    errors.password = passwordRules.message
    return false
  }
  errors.password = ''
  return true
}

function validateNickname(): boolean {
  if (!form.nickname) {
    errors.nickname = '请输入昵称'
    return false
  }
  const units = calculateNicknameLengthUnits(form.nickname)
  if (units < nicknameRules.minUnits || units > nicknameRules.maxUnits) {
    errors.nickname = nicknameRules.message
    return false
  }
  errors.nickname = ''
  return true
}

function validateForm(): boolean {
  const isUsernameValid = validateUsername()
  const isPasswordValid = validatePassword()
  const isNicknameValid = validateNickname()
  return isUsernameValid && isPasswordValid && isNicknameValid
}

async function handleSubmit() {
  errors.general = ''

  if (!validateForm()) {
    return
  }

  isSubmitting.value = true

  try {
    await $fetch('/api/auth/register', {
      method: 'POST',
      body: {
        username: form.username,
        password: form.password,
        nickname: form.nickname,
      },
    })
    await refreshSession()
    await navigateTo('/')
  } catch (error: any) {
    const message = error.data?.message || '注册失败，请稍后重试'
    if (message.includes('用户名')) {
      errors.username = message
    } else if (message.includes('昵称')) {
      errors.nickname = message
    } else {
      errors.general = message
    }
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
          创建账号
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
              placeholder="3-20位英文字母或数字"
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
              autocomplete="new-password"
              class="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-colors"
              :class="{ 'border-red-400 focus:border-red-400 focus:ring-red-400/20': errors.password }"
              placeholder="8-20位字符"
              @blur="validatePassword"
            />
            <p v-if="errors.password" class="mt-2 text-sm text-red-500">
              {{ errors.password }}
            </p>
          </div>

          <div>
            <label for="nickname" class="block text-sm font-medium text-foreground mb-2">
              昵称
            </label>
            <input
              id="nickname"
              v-model="form.nickname"
              type="text"
              autocomplete="nickname"
              class="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-colors"
              :class="{ 'border-red-400 focus:border-red-400 focus:ring-red-400/20': errors.nickname }"
              placeholder="1-10字符（中文=1，英文/数字=0.5）"
              @blur="validateNickname"
            />
            <p v-if="errors.nickname" class="mt-2 text-sm text-red-500">
              {{ errors.nickname }}
            </p>
          </div>

          <button
            type="submit"
            :disabled="isSubmitting"
            class="w-full py-3 px-4 bg-primary text-white font-medium rounded-lg hover:bg-secondary transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span v-if="isSubmitting">注册中...</span>
            <span v-else>注册</span>
          </button>
        </form>

        <p class="mt-6 text-center text-sm text-gray-600">
          已有账号？
          <NuxtLink to="/login" class="text-primary hover:text-secondary font-medium cursor-pointer">
            立即登录
          </NuxtLink>
        </p>
      </div>
    </div>
  </div>
</template>
