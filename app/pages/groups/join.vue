<script setup lang="ts">
import type { MemberRole, JoinGroupRequest, JoinGroupResponse } from '~/types/group'

definePageMeta({
  middleware: 'auth',
})

useHead({
  title: '加入小组 - 打卡契约',
})

const form = reactive<JoinGroupRequest>({
  inviteCode: '',
  role: 'CHALLENGER' as MemberRole,
})

const errors = reactive({
  inviteCode: '',
  role: '',
  general: '',
})

const isSubmitting = ref(false)

function validateInviteCode(): boolean {
  if (!form.inviteCode.trim()) {
    errors.inviteCode = '请输入邀请码'
    return false
  }
  errors.inviteCode = ''
  return true
}

function validateRole(): boolean {
  if (!form.role) {
    errors.role = '请选择角色'
    return false
  }
  errors.role = ''
  return true
}

function validateForm(): boolean {
  const isInviteCodeValid = validateInviteCode()
  const isRoleValid = validateRole()
  return isInviteCodeValid && isRoleValid
}

async function handleSubmit() {
  errors.general = ''

  if (!validateForm()) {
    return
  }

  isSubmitting.value = true

  try {
    const inviteCode = form.inviteCode.trim().toUpperCase()
    const result = await $fetch<JoinGroupResponse>('/api/groups/join', {
      method: 'POST',
      body: {
        inviteCode,
        role: form.role,
      },
    })
    await navigateTo(`/groups/${result.group.id}`)
  } catch (error: any) {
    errors.general = error.data?.message || '加入失败，请稍后重试'
  } finally {
    isSubmitting.value = false
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
        <h1 class="text-xl font-bold text-foreground">加入小组</h1>
      </div>
    </header>

    <main class="max-w-4xl mx-auto px-4 py-8">
      <div class="bg-white rounded-2xl shadow-lg p-8">
        <form @submit.prevent="handleSubmit" class="space-y-6">
          <div v-if="errors.general" class="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm">
            {{ errors.general }}
          </div>

          <div>
            <label for="inviteCode" class="block text-sm font-medium text-foreground mb-2">
              邀请码 <span class="text-red-500">*</span>
            </label>
            <input
              id="inviteCode"
              v-model="form.inviteCode"
              type="text"
              class="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-colors uppercase tracking-widest text-center font-mono text-lg"
              :class="{ 'border-red-400 focus:border-red-400 focus:ring-red-400/20': errors.inviteCode }"
              placeholder="请输入邀请码"
              @blur="validateInviteCode"
            />
            <p v-if="errors.inviteCode" class="mt-2 text-sm text-red-500">
              {{ errors.inviteCode }}
            </p>
          </div>

          <div>
            <label class="block text-sm font-medium text-foreground mb-3">
              选择角色 <span class="text-red-500">*</span>
            </label>
            <div class="grid grid-cols-2 gap-4">
              <label
                class="relative flex flex-col p-4 border-2 rounded-xl cursor-pointer transition-all"
                :class="form.role === 'CHALLENGER' ? 'border-primary bg-primary/5' : 'border-gray-200 hover:border-gray-300'"
              >
                <input
                  v-model="form.role"
                  type="radio"
                  value="CHALLENGER"
                  class="sr-only"
                />
                <span class="text-lg font-semibold" :class="form.role === 'CHALLENGER' ? 'text-primary' : 'text-foreground'">
                  挑战者
                </span>
                <span class="mt-1 text-sm text-gray-600">
                  参与打卡挑战，完成每日目标
                </span>
                <span
                  v-if="form.role === 'CHALLENGER'"
                  class="absolute top-3 right-3 w-5 h-5 bg-primary rounded-full flex items-center justify-center"
                >
                  <svg class="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                  </svg>
                </span>
              </label>

              <label
                class="relative flex flex-col p-4 border-2 rounded-xl cursor-pointer transition-all"
                :class="form.role === 'SUPERVISOR' ? 'border-cta bg-cta/5' : 'border-gray-200 hover:border-gray-300'"
              >
                <input
                  v-model="form.role"
                  type="radio"
                  value="SUPERVISOR"
                  class="sr-only"
                />
                <span class="text-lg font-semibold" :class="form.role === 'SUPERVISOR' ? 'text-cta' : 'text-foreground'">
                  监督者
                </span>
                <span class="mt-1 text-sm text-gray-600">
                  监督挑战者打卡，不参与挑战
                </span>
                <span
                  v-if="form.role === 'SUPERVISOR'"
                  class="absolute top-3 right-3 w-5 h-5 bg-cta rounded-full flex items-center justify-center"
                >
                  <svg class="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                  </svg>
                </span>
              </label>
            </div>
            <p v-if="errors.role" class="mt-2 text-sm text-red-500">
              {{ errors.role }}
            </p>
          </div>

          <button
            type="submit"
            :disabled="isSubmitting"
            class="w-full py-3 px-4 bg-primary text-white font-medium rounded-lg hover:bg-secondary transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span v-if="isSubmitting">加入中...</span>
            <span v-else>加入小组</span>
          </button>
        </form>
      </div>
    </main>
  </div>
</template>
