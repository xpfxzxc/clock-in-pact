import { fileURLToPath } from 'node:url'

// https://nuxt.com/docs/api/configuration/nuxt-config
const nodeCronTraceEntries = [
  fileURLToPath(new URL('./node_modules/node-cron/dist/cjs/node-cron.js', import.meta.url)),
  fileURLToPath(new URL('./node_modules/node-cron/dist/esm/node-cron.js', import.meta.url)),
]

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  app: {
    head: {
      link: [
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32x32.png' },
        { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/favicon-16x16.png' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
        { rel: 'manifest', href: '/site.webmanifest' },
      ],
      meta: [
        { name: 'theme-color', content: '#0D9488' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'default' },
        { name: 'apple-mobile-web-app-title', content: 'ClockInPact' },
        { name: 'mobile-web-app-capable', content: 'yes' },
      ],
    },
  },

  nitro: {
    rollupConfig: {
      output: {
        // Node 22 no longer accepts legacy `assert` import attributes for JSON modules.
        importAttributesKey: 'with',
      },
    },
    experimental: {
      legacyExternals: true,
    },
    externals: {
      external: ['node-cron'],
      traceInclude: nodeCronTraceEntries,
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
