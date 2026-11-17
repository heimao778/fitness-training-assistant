(function installBrowserStorage(global) {
  const PREFIX = 'wechat-preview:'
  const memory = {}
  let persistent = true

  function markTemporary(reason) {
    persistent = false
    global.__FITNESS_STORAGE_STATUS__ = { persistent: false, reason: reason || 'unavailable' }
    const banner = global.document && global.document.querySelector('.preview-banner')
    if (banner) {
      banner.classList.add('temporary')
      banner.textContent = '临时试用：当前查看器禁止本地存储，刷新或关闭会丢失记录。建议下载后用系统浏览器打开。'
    }
  }

  try {
    const probe = `${PREFIX}probe`
    global.localStorage.setItem(probe, '1')
    global.localStorage.removeItem(probe)
    global.__FITNESS_STORAGE_STATUS__ = { persistent: true }
  } catch (error) {
    markTemporary(error && error.message)
  }

  global.wx = {
    getStorageSync(key) {
      if (!persistent) {
        const raw = memory[key]
        return raw === undefined ? undefined : JSON.parse(raw)
      }
      try {
        const raw = global.localStorage.getItem(PREFIX + key)
        return raw === null ? undefined : JSON.parse(raw)
      } catch (error) {
        markTemporary(error && error.message)
        const raw = memory[key]
        return raw === undefined ? undefined : JSON.parse(raw)
      }
    },
    setStorageSync(key, value) {
      const raw = JSON.stringify(value)
      if (!persistent) {
        memory[key] = raw
        return
      }
      try {
        global.localStorage.setItem(PREFIX + key, raw)
      } catch (error) {
        memory[key] = raw
        markTemporary(error && error.message)
      }
    },
    removeStorageSync(key) {
      delete memory[key]
      if (!persistent) return
      try {
        global.localStorage.removeItem(PREFIX + key)
      } catch (error) {
        markTemporary(error && error.message)
      }
    }
  }
})(window)
