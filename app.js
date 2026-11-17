const store = require('./utils/store')

App({
  onLaunch() {
    store.bootstrap()
  },
  globalData: {
    version: '1.0.0'
  }
})
