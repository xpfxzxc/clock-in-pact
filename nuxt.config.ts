import { fileURLToPath } from 'node:url'

// https://nuxt.com/docs/api/configuration/nuxt-config
const nodeCronTraceEntry = fileURLToPath(new URL('./node_modules/node-cron/dist/cjs/node-cron.js', import.meta.url))

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  nitro: {
    experimental: {
      legacyExternals: true,
    },
    externals: {
      external: ['node-cron'],
      traceInclude: [nodeCronTraceEntry],
    },
  },

  runtimeConfig: {
    session: {
      cookie: {
        secure: process.env.NODE_ENV === 'production',
      },
    },
  },

  modules: [
    '@nuxtjs/tailwindcss',
    '@nuxt/icon',
    'nuxt-auth-utils',
  ],

  css: ['~/assets/css/main.css'],

  future: {
    compatibilityVersion: 4,
  },
})
