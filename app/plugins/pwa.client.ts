export default defineNuxtPlugin(() => {
  if (!('serviceWorker' in navigator)) {
    return
  }

  if (!import.meta.env.PROD) {
    window.addEventListener('load', async () => {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations()
        await Promise.all(registrations.map((registration) => registration.unregister()))

        if ('caches' in window) {
          const cacheKeys = await caches.keys()
          const pwaCacheKeys = cacheKeys.filter((key) => key.startsWith('clock-in-pact-'))
          await Promise.all(pwaCacheKeys.map((key) => caches.delete(key)))
        }
      }
      catch (error) {
        console.error('[pwa] service worker cleanup failed', error)
      }
    })
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
