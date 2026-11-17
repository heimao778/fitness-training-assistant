const store = require('../../utils/store')
const engine = require('../../utils/engine')

Page({
  data: { partIndex: 0, part: null, choices: {} },
  onLoad(query) {
    const state = store.load()
    const slot = engine.getCurrentSlot(state)
    const partIndex = Number(query.part || 0)
    const part = slot.parts[partIndex]
    const routine = engine.getRoutine(state, slot.id, partIndex) || {}
    const choices = {}
    part.patterns.forEach(pattern => {
      const saved = state.settings.favorites[`${state.settings.templateId}:${pattern.id}`]
      const routineChoice = routine[pattern.id]
      choices[pattern.id] = {
        name: routineChoice && pattern.options.includes(routineChoice.name)
          ? routineChoice.name
          : (saved && pattern.options.includes(saved) ? saved : ''),
        sets: routineChoice ? routineChoice.sets : pattern.suggestedSets
      }
    })
    this.setData({ partIndex, part, choices })
  },
  pick(e) {
    const id = e.currentTarget.dataset.id
    const options = this.data.part.patterns.find(item => item.id === id).options
    wx.showActionSheet({
      itemList: options,
      success: res => this.setData({ [`choices.${id}.name`]: options[res.tapIndex] })
    })
  },
  changeSets(e) {
    const id = e.currentTarget.dataset.id
    const delta = Number(e.currentTarget.dataset.delta)
    const current = this.data.choices[id].sets
    this.setData({ [`choices.${id}.sets`]: Math.max(1, Math.min(8, current + delta)) })
  },
  start() {
    let state = store.load()
    const missing = this.data.part.patterns.filter(pattern => {
      const optional = pattern.role.indexOf('可选') >= 0
      return !optional && !this.data.choices[pattern.id].name
    })
    if (missing.length) {
      wx.showToast({ title: `请先选择${missing[0].name}`, icon: 'none' })
      return
    }
    const configured = {}
    Object.keys(this.data.choices).forEach(id => {
      if (this.data.choices[id].name) configured[id] = this.data.choices[id]
    })
    const favorites = Object.assign({}, state.settings.favorites)
    Object.keys(configured).forEach(id => {
      favorites[`${state.settings.templateId}:${id}`] = configured[id].name
    })
    state.settings.favorites = favorites
    const slot = engine.getCurrentSlot(state)
    state = engine.saveRoutine(state, slot.id, this.data.partIndex, configured)
    let session = state.activeSession
    const built = engine.createSession(state, configured)
    const selectedPart = built.parts.find(part => part.name === this.data.part.name)
    if (!selectedPart || !selectedPart.exercises.length) {
      wx.showToast({ title: '请至少选择一个动作', icon: 'none' })
      return
    }
    if (!session) {
      built.parts = [selectedPart]
      built.currentPlanPartIndex = this.data.partIndex
      session = built
    } else {
      const existingIndex = session.parts.findIndex(part => part.name === selectedPart.name)
      if (existingIndex < 0) {
        session.parts.push(selectedPart)
        session.partIndex = session.parts.length - 1
      } else {
        const existing = session.parts[existingIndex]
        selectedPart.exercises.forEach(exercise => {
          const prior = existing.exercises.find(item => item.name === exercise.name)
          if (!prior) return
          exercise.sets.forEach((set, index) => {
            if (prior.sets[index]) exercise.sets[index] = prior.sets[index]
          })
        })
        session.parts[existingIndex] = selectedPart
        session.partIndex = existingIndex
      }
      session.exerciseIndex = 0
      session.currentPlanPartIndex = this.data.partIndex
    }
    state.activeSession = session
    store.save(state)
    wx.redirectTo({ url: '/pages/workout/workout' })
  }
})
