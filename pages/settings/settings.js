const store = require('../../utils/store')
const engine = require('../../utils/engine')
const plans = require('../../data/plans')
const componentEvents = require('../../utils/component-events')

const timeMap = {
  '早上': ['早饭后练（早起版）', '早饭后练（晚起版）'],
  '中午': ['午饭前练', '午饭后练'],
  '下午': ['产品映射：接近午饭后', '产品映射：接近晚饭前'],
  '晚上': ['晚饭前练', '晚饭后练', '夜里练']
}

Page({
  data: { state: null, templates: [], favoriteList: [] },
  onShow() { this.refresh() },
  refresh() {
    const state = store.load()
    const favoriteList = Object.keys(state.settings.favorites).map(key => ({ key, name: state.settings.favorites[key] }))
    this.setData({
      state,
      templates: Object.values(plans.templates).map(item => ({ id: item.id, name: item.name })),
      favoriteList
    })
  },
  nameInput(e) {
    const value = componentEvents.inputValue(e.detail)
    this.setData({ 'state.settings.displayName': value })
    store.save(this.data.state)
  },
  toggleBp(e) {
    const state = store.load()
    state.settings.bpUnconfirmed = componentEvents.checkedValue(e.detail)
    store.save(state); this.refresh()
  },
  chooseTemplate() {
    wx.showActionSheet({
      itemList: this.data.templates.map(item => item.name),
      success: res => {
        const selected = this.data.templates[res.tapIndex]
        const current = store.load()
        if (current.activeSession) {
          wx.showModal({ title: '有进行中的训练', content: '请先恢复训练，或保存并结束。循环不会在进行中被替换。', showCancel: false })
          return
        }
        wx.showModal({
          title: `切换为${selected.name}？`,
          content: '会从新循环 Day1 开始，不清空历史记录。',
          success: answer => {
            if (!answer.confirm) return
            store.save(engine.changeTemplate(current, selected.id))
            this.refresh()
          }
        })
      }
    })
  },
  chooseTime() {
    const periods = Object.keys(timeMap)
    wx.showActionSheet({
      itemList: periods,
      success: res => {
        const period = periods[res.tapIndex]
        wx.showActionSheet({
          itemList: timeMap[period],
          success: sub => {
            const state = store.load()
            state.settings.timePeriod = period
            state.settings.mealRelation = timeMap[period][sub.tapIndex]
            store.save(state); this.refresh()
          }
        })
      }
    })
  },
  chooseRest(e) {
    const type = e.currentTarget.dataset.type
    const seconds = [60, 90, 120, 150, 180, 240]
    wx.showActionSheet({
      itemList: seconds.map(item => `${item} 秒${(type === 'compound' && item === 120) || (type === 'isolation' && item === 60) ? '（建议下限）' : ''}`),
      success: res => {
        const state = store.load()
        state.settings.rests[type] = seconds[res.tapIndex]
        store.save(state); this.refresh()
      }
    })
  },
  clearFavorites() {
    wx.showModal({
      title: '清除常用选择？', content: '下次进入部位时会恢复到候选列表第一项。',
      success: res => {
        if (!res.confirm) return
        const state = store.load()
        state.settings.favorites = {}
        store.save(state); this.refresh()
      }
    })
  }
})
