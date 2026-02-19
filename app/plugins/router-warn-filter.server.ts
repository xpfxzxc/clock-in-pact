export default defineNuxtPlugin((nuxtApp) => {
  if (process.env.NODE_ENV !== "production") {
    return;
  }

  const originalWarnHandler = nuxtApp.vueApp.config.warnHandler;

  nuxtApp.vueApp.config.warnHandler = (msg, instance, trace) => {
    if (msg.includes("No match found for location with path")) {
      return;
    }

    if (originalWarnHandler) {
      originalWarnHandler(msg, instance, trace);
      return;
    }

    console.warn(`[Vue warn]: ${msg}${trace}`);
  };
});
