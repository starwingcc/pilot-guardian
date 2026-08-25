export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
  runAt: 'document_start',
  main(ctx) {
    let lastUrl = location.href
    let queued = false

    const checkNavigation = () => {
      queued = false
      if (location.href === lastUrl) return
      lastUrl = location.href
      void chrome.runtime.sendMessage({ type: 'navigation:spa', url: lastUrl })
    }
    const scheduleCheck = () => {
      if (queued) return
      queued = true
      setTimeout(checkNavigation, 0)
    }

    window.addEventListener('popstate', scheduleCheck)
    window.addEventListener('hashchange', scheduleCheck)
    const navigation = (window as Window & {
      navigation?: EventTarget
    }).navigation
    navigation?.addEventListener('navigate', scheduleCheck)

    ctx.onInvalidated(() => {
      window.removeEventListener('popstate', scheduleCheck)
      window.removeEventListener('hashchange', scheduleCheck)
      navigation?.removeEventListener('navigate', scheduleCheck)
    })
  },
})
