export default defineNuxtPlugin(() => {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) {
    return
  }

  window.addEventListener('load', async () => {
    try {
      await navigator.serviceWorker.register('/sw.js')
    }
    catch (error) {
      console.error('[pwa] service worker register failed', error)
    }
  })
})
