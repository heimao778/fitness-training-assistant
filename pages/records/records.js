const store = require('../../utils/store')
const engine = require('../../utils/engine')

Page({
  data: { history: [], summaries: [] },
  onShow() { this.refresh() },
  refresh() {
    const state = store.load()
    this.setData({ history: state.history, summaries: engine.exerciseSummaries(state) })
  },
  detail(e) { wx.navigateTo({ url: `/pages/record-detail/record-detail?id=${e.currentTarget.dataset.id}` }) },
  exerciseHistory(e) {
    wx.navigateTo({ url: `/pages/exercise-history/exercise-history?name=${encodeURIComponent(e.currentTarget.dataset.name)}` })
  }
})
