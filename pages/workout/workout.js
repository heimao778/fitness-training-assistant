const store = require('../../utils/store')
const engine = require('../../utils/engine')
const componentEvents = require('../../utils/component-events')

Page({
  data: {
    session: null, part: null, exercise: null, exerciseIndex: 0,
    lastPerformance: null, remaining: 0, clock: '00:00', saving: false,
    completing: false, confirmVisible: false
  },
  onShow() {
    this.refresh()
    this.timer = setInterval(() => this.tick(), 500)
  },
  onHide() { clearInterval(this.timer) },
  onUnload() { clearInterval(this.timer) },
  refresh() {
    const state = store.load()
    if (!state.activeSession) { wx.switchTab({ url: '/pages/today/today' }); return }
    const session = state.activeSession
    const part = session.parts[session.partIndex]
    const exerciseIndex = session.exerciseIndex || 0
    const exercise = part.exercises[exerciseIndex]
    this.setData({
      session, part, exercise, exerciseIndex,
      lastPerformance: engine.getLastPerformance(state, exercise.name, exercise.unit || 'kg')
    })
    this.tick()
  },
  tick() {
    if (!this.data.session) return
    const remaining = engine.restRemaining(this.data.session.rest)
    const min = String(Math.floor(remaining / 60)).padStart(2, '0')
    const sec = String(remaining % 60).padStart(2, '0')
    this.setData({ remaining, clock: `${min}:${sec}` })
  },
  input(e) {
    const { set, field } = e.currentTarget.dataset
    const state = store.load()
    state.activeSession = engine.updateActiveSet(
      state.activeSession,
      state.activeSession.partIndex,
      state.activeSession.exerciseIndex || 0,
      Number(set),
      { [field]: componentEvents.inputValue(e.detail) }
    )
    store.save(state)
    this.setData({
      [`exercise.sets[${set}].${field}`]: componentEvents.inputValue(e.detail),
      session: state.activeSession
    })
  },
  completeSet(e) {
    if (this.data.remaining > 0 || this.data.saving) return
    this.setData({ saving: true })
    const { set } = e.currentTarget.dataset
    const state = store.load()
    const exerciseIndex = state.activeSession.exerciseIndex || 0
    const ex = state.activeSession.parts[state.activeSession.partIndex].exercises[exerciseIndex]
    const values = ex.sets[set]
    values.restSeconds = state.settings.rests[ex.restType] || 60
    const result = engine.completeSet(state.activeSession, state.activeSession.partIndex, exerciseIndex, set, values)
    if (result.changed) {
      state.activeSession = result.session
      store.save(state)
      this.refresh()
    }
    setTimeout(() => this.setData({ saving: false }), 350)
  },
  adjustRest() {
    const values = ['60 秒', '90 秒', '120 秒', '180 秒', '240 秒']
    wx.showActionSheet({
      itemList: values,
      success: res => {
        const state = store.load()
        state.activeSession = engine.adjustRest(state.activeSession, [60, 90, 120, 180, 240][res.tapIndex])
        store.save(state)
        this.refresh()
        wx.showToast({ title: '从本组完成时间重新计算', icon: 'none' })
      }
    })
  },
  extend() {
    const state = store.load()
    state.activeSession = engine.extendRest(state.activeSession, 30)
    store.save(state)
    this.refresh()
  },
  nextExercise() {
    const state = store.load()
    const session = state.activeSession
    const part = session.parts[session.partIndex]
    if ((session.exerciseIndex || 0) < part.exercises.length - 1) {
      session.exerciseIndex = (session.exerciseIndex || 0) + 1
      session.updatedAt = Date.now()
      store.save(state)
      this.refresh()
      return
    }
    const slot = engine.getCurrentSlot(state)
    const current = session.currentPlanPartIndex
    if (current < slot.parts.length - 1) {
      const nextPartIndex = current + 1
      const routine = engine.getRoutine(state, slot.id, nextPartIndex)
      if (!routine) {
        wx.redirectTo({ url: `/pages/category/category?part=${nextPartIndex}` })
        return
      }
      const built = engine.createSession(state, routine)
      const selectedPart = built.parts.find(item => item.name === slot.parts[nextPartIndex].name)
      session.parts.push(selectedPart)
      session.partIndex = session.parts.length - 1
      session.exerciseIndex = 0
      session.currentPlanPartIndex = nextPartIndex
      store.save(state)
      this.refresh()
      return
    }
    this.confirmComplete()
  },
  previousExercise() {
    const state = store.load()
    if (!state.activeSession || (state.activeSession.exerciseIndex || 0) === 0) return
    state.activeSession.exerciseIndex -= 1
    store.save(state)
    this.refresh()
  },
  editPart() {
    const state = store.load()
    wx.navigateTo({ url: `/pages/category/category?part=${state.activeSession.currentPlanPartIndex}&edit=1` })
  },
  confirmComplete() {
    if (this.data.completing) return
    this.setData({ confirmVisible: true })
  },
  cancelComplete() {
    this.setData({ confirmVisible: false })
  },
  confirmCompleteAction() {
    if (this.data.completing) return
    this.setData({ completing: true, confirmVisible: false })
    this.finish('completed')
  },
  savePartial() {
    wx.showModal({
      title: '保存并结束？',
      content: '已完成的组会保留到记录，循环不会推进。之后可从今天重新开始本槽位。',
      success: res => { if (res.confirm) this.finish('partial') }
    })
  },
  finish(status) {
    const next = engine.finishSession(store.load(), status)
    store.save(next)
    wx.showToast({ title: status === 'completed' ? '训练已保存' : '部分完成已保存', icon: 'success' })
    setTimeout(() => wx.switchTab({ url: '/pages/today/today' }), 450)
  }
})
