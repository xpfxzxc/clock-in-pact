export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.directive('viewer', {
    getSSRProps() {
      return {}
    },
  })
})
