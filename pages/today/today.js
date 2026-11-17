const store = require('../../utils/store')
const engine = require('../../utils/engine')
const plans = require('../../data/plans')

Page({
  data: { state: null, slot: null, templateName: '', dateText: '', safetyOpen: false },
  onShow() { this.refresh() },
  onPullDownRefresh() { this.refresh(); wx.stopPullDownRefresh() },
  refresh() {
    const state = store.load()
    const slot = engine.getCurrentSlot(state)
    this.setData({
      state, slot, templateName: plans.templates[state.settings.templateId].name,
      dateText: (state.rotation.scheduledDate || engine.todayKey()).split('-').join('.')
    })
  },
  openPart(e) {
    const partIndex = Number(e.currentTarget.dataset.index)
    const state = store.load()
    if (!state.settings.templateConfirmed) {
      this.chooseTemplate()
      return
    }
    const slot = engine.getCurrentSlot(state)
    const routine = engine.getRoutine(state, slot.id, partIndex)
    if (!routine) {
      wx.navigateTo({ url: `/pages/category/category?part=${partIndex}` })
      return
    }
    const built = engine.createSession(state, routine)
    const selectedPart = built.parts.find(part => part.name === slot.parts[partIndex].name)
    built.parts = [selectedPart]
    built.currentPlanPartIndex = partIndex
    state.activeSession = built
    store.save(state)
    wx.navigateTo({ url: '/pages/workout/workout' })
  },
  chooseTemplate() {
    const ids = ['gym3', 'gym4shoulder', 'gym4arms', 'home3']
    const names = ['健身房三分化', '四分化 · 肩单练', '四分化 · 手臂单练', '居家三分化']
    wx.showActionSheet({
      itemList: names,
      success: res => {
        const state = store.load()
        state.settings.templateId = ids[res.tapIndex]
        state.settings.templateConfirmed = true
        state.rotation.slotIndex = 0
        state.rotation.legFocus = 'quads'
        store.save(state)
        this.refresh()
      }
    })
  },
  resume() { wx.navigateTo({ url: '/pages/workout/workout' }) },
  showSafety() { this.setData({ safetyOpen: true }) },
  closeSafety() { this.setData({ safetyOpen: false }) },
  chooseCondition(e) {
    const value = e.currentTarget.dataset.value
    if (value === 'danger') {
      wx.showModal({
        title: '请停止训练',
        content: '胸痛、明显气促、晕厥等危险症状不是“轻练一下”的情形。请停止并及时就医；严重或持续时寻求急救。',
        showCancel: false
      })
    } else {
      wx.showToast({ title: value === 'tired' ? '今天建议减组并延长休息' : '状态已确认', icon: 'none' })
    }
    this.closeSafety()
  },
  restDay() {
    wx.showToast({ title: '已休息，循环位置不变', icon: 'none' })
  },
  moveTomorrow() {
    const date = new Date()
    date.setDate(date.getDate() + 1)
    const state = engine.reschedule(store.load(), engine.todayKey(date))
    store.save(state)
    this.refresh()
    wx.showToast({ title: '已改到明天，顺序不变', icon: 'none' })
  },
  skip() {
    wx.showModal({
      title: '确认跳过当前部位？',
      content: '跳过会推进一次循环；休息不会推进。健身房腿日被跳过时不会切换腿部重点。',
      success: res => {
        if (!res.confirm) return
        store.save(engine.advance(store.load(), 'skip'))
        this.refresh()
      }
    })
  }
})
