const store = require('../../utils/store')
const engine = require('../../utils/engine')

Page({
  data: { name: '', rows: [] },
  onLoad(query) {
    const name = decodeURIComponent(query.name || '')
    this.setData({ name })
  },
  onShow() {
    this.setData({ rows: engine.listExerciseHistory(store.load(), this.data.name, 'kg') })
  },
  detail(e) {
    wx.navigateTo({ url: `/pages/record-detail/record-detail?id=${e.currentTarget.dataset.id}` })
  }
})
