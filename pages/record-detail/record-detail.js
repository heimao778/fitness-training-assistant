const store = require('../../utils/store')
const engine = require('../../utils/engine')
const componentEvents = require('../../utils/component-events')

Page({
  data: { record: null, recordId: '' },
  onLoad(query) {
    this.setData({ recordId: query.id })
  },
  onShow() {
    const record = store.load().history.find(item => item.id === this.data.recordId)
    this.setData({ record: record || null })
  },
  editSet(e) {
    const { part, exercise, set, field } = e.currentTarget.dataset
    const state = engine.editHistorySet(
      store.load(), this.data.recordId, Number(part), Number(exercise), Number(set),
      { [field]: componentEvents.inputValue(e.detail), unit: 'kg' }
    )
    store.save(state)
    this.setData({
      [`record.parts[${part}].exercises[${exercise}].sets[${set}].${field}`]: componentEvents.inputValue(e.detail)
    })
  }
})
