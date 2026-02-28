<script setup lang="ts">
const config = useRuntimeConfig()

const isVisible = computed(() => {
  const showIcp = config.public.showIcpFiling === true
  const icpText = config.public.icpFilingText?.trim()
  return showIcp && Boolean(icpText)
})

const icpLink = computed(() => {
  const link = config.public.icpFilingLink?.trim()
  return link || "https://beian.miit.gov.cn/"
})
</script>

<template>
  <footer v-if="isVisible" class="py-5 text-center">
    <a
      :href="icpLink"
      target="_blank"
      rel="noopener noreferrer"
      class="text-[11px] text-gray-400/80 hover:text-gray-500 transition-colors tracking-wide"
    >
      {{ config.public.icpFilingText }}
    </a>
  </footer>
</template>
