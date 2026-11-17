const test = require('node:test')
const assert = require('node:assert/strict')
const engine = require('../utils/engine')
const store = require('../utils/store')

test('完成推进，休息与换日不推进', () => {
  const state = engine.initialState()
  assert.equal(engine.advance(state, 'rest').rotation.slotIndex, 0)
  const moved = engine.reschedule(state, '2026-11-11')
  assert.equal(moved.rotation.slotIndex, 0)
  assert.equal(moved.rotation.scheduledDate, '2026-11-11')
  assert.equal(engine.advance(state, 'complete').rotation.slotIndex, 1)
})

test('跳过只推进一次，跳过腿日不切换重点', () => {
  let state = engine.initialState()
  state.rotation.slotIndex = 2
  state = engine.advance(state, 'skip', 1000)
  assert.equal(state.rotation.slotIndex, 0)
  assert.equal(state.rotation.legFocus, 'quads')
  assert.equal(state.history.filter(item => item.status === 'skipped').length, 1)
})

test('健身房腿日仅完成后交替，居家不交替', () => {
  let gym = engine.initialState()
  gym.rotation.slotIndex = 2
  gym = engine.advance(gym, 'complete')
  assert.equal(gym.rotation.legFocus, 'hamstrings')
  let home = engine.initialState()
  home.settings.templateId = 'home3'
  home.rotation.slotIndex = 2
  home = engine.advance(home, 'complete')
  assert.equal(home.rotation.legFocus, 'quads')
})

test('换日后循环内容与动作顺序保持', () => {
  const state = engine.initialState()
  const before = engine.getCurrentSlot(state)
  const after = engine.getCurrentSlot(engine.reschedule(state, '2026-12-31'))
  assert.deepEqual(after.parts.map(item => item.name), before.parts.map(item => item.name))
})

test('单组完成防重复并启动时间戳计时', () => {
  const state = engine.initialState()
  const session = engine.createSession(state, {
    pulldown: { name: '高位下拉', sets: 2 }
  }, 1000)
  const first = engine.completeSet(session, 0, 0, 0, { weight: '40', reps: '10', restSeconds: 120 }, 2000)
  assert.equal(first.changed, true)
  assert.equal(first.session.rest.endsAt, 122000)
  const duplicate = engine.completeSet(first.session, 0, 0, 0, { weight: '99', reps: '99', restSeconds: 120 }, 3000)
  assert.equal(duplicate.changed, false)
  assert.equal(duplicate.session.parts[0].exercises[0].sets[0].weight, '40')
})

test('后台恢复、修改与延长休息使用绝对时间戳', () => {
  const state = engine.initialState()
  const session = engine.createSession(state, { pulldown: { name: '高位下拉', sets: 1 } }, 1000)
  const done = engine.completeSet(session, 0, 0, 0, { restSeconds: 120 }, 2000).session
  assert.equal(engine.restRemaining(done.rest, 62000), 60)
  const adjusted = engine.adjustRest(done, 90, 70000)
  assert.equal(adjusted.rest.endsAt, 92000)
  const extended = engine.extendRest(adjusted, 30, 71000)
  assert.equal(extended.rest.endsAt, 122000)
  assert.equal(engine.restRemaining(extended.rest, 200000), 0)
})

test('本地保存可恢复，校验失败回退安全默认', () => {
  store.resetMemory()
  const state = engine.initialState()
  state.settings.displayName = '测试'
  store.save(state)
  assert.equal(store.load().settings.displayName, '测试')
  const packed = store.pack(state)
  packed.payload += 'broken'
  global.wx = {
    getStorageSync: () => packed,
    setStorageSync: () => {}
  }
  assert.equal(store.load().settings.templateId, 'gym3')
  delete global.wx
})

test('旧版数据迁移保留历史并补齐新字段', () => {
  const legacy = engine.initialState()
  legacy.version = 1
  delete legacy.settings.templateConfirmed
  delete legacy.routines
  delete legacy.completedSessionIds
  legacy.history.push({ id: 'legacy' })
  const migrated = store.migrate(legacy)
  assert.equal(migrated.version, 2)
  assert.equal(migrated.settings.templateConfirmed, true)
  assert.equal(migrated.history[0].id, 'legacy')
  assert.deepEqual(migrated.routines, {})
})

test('进行中会话阻止切换循环，历史不因正常切换清空', () => {
  const state = engine.initialState()
  state.history.push({ id: 'old' })
  const changed = engine.changeTemplate(state, 'gym4arms')
  assert.equal(changed.history.length, 1)
  changed.activeSession = { id: 'active' }
  assert.throws(() => engine.changeTemplate(changed, 'home3'), /ACTIVE_SESSION/)
})

test('未完成输入立即保存，刷新恢复且不推进循环', () => {
  store.resetMemory()
  const state = engine.initialState()
  state.activeSession = engine.createSession(state, { pulldown: { name: '高位下拉', sets: 2 } }, 1000)
  state.activeSession = engine.updateActiveSet(state.activeSession, 0, 0, 0, { weight: '42.5', reps: '9' }, 2000)
  store.save(state)
  const restored = store.load()
  const set = restored.activeSession.parts[0].exercises[0].sets[0]
  assert.equal(set.weight, '42.5')
  assert.equal(set.reps, '9')
  assert.equal(set.done, false)
  assert.equal(restored.rotation.slotIndex, 0)
})

test('部位动作与组数配置保存后可直接复用', () => {
  let state = engine.initialState()
  const choices = { pulldown: { name: '高位下拉', sets: 4 } }
  state = engine.saveRoutine(state, 'day1', 0, choices)
  assert.deepEqual(engine.getRoutine(state, 'day1', 0), choices)
})

test('上次表现来自真实完成组，历史纠错后立即更新', () => {
  let state = engine.initialState()
  state.activeSession = engine.createSession(state, { pulldown: { name: '高位下拉', sets: 1 } }, 1000)
  state.activeSession = engine.completeSet(state.activeSession, 0, 0, 0, {
    weight: '40', reps: '10', restSeconds: 60
  }, 2000).session
  state = engine.finishSession(state, 'partial', 3000)
  assert.equal(engine.getLastPerformance(state, '高位下拉', 'kg').sets[0].weight, '40')
  state = engine.editHistorySet(state, state.history[0].id, 0, 0, 0, { weight: '42.5', reps: '8', unit: 'kg' }, 4000)
  store.resetMemory()
  store.save(state)
  state = store.load()
  const corrected = engine.getLastPerformance(state, '高位下拉', 'kg')
  assert.equal(corrected.sets[0].weight, '42.5')
  assert.equal(corrected.sets[0].reps, '8')
})

test('上次表现不跨重量单位误比', () => {
  const state = engine.initialState()
  state.history = [
    { id: 'lb', date: '2026-11-13', parts: [{ exercises: [{ name: '高位下拉', unit: 'lb', sets: [{ done: true, weight: '100', reps: '8', unit: 'lb' }] }] }] },
    { id: 'kg', date: '2026-11-12', parts: [{ exercises: [{ name: '高位下拉', unit: 'kg', sets: [{ done: true, weight: '40', reps: '10', unit: 'kg' }] }] }] }
  ]
  const previous = engine.getLastPerformance(state, '高位下拉', 'kg')
  assert.equal(previous.sessionId, 'kg')
  assert.equal(previous.sets[0].weight, '40')
})

test('只有确认完成推进且重复完成调用幂等', () => {
  let state = engine.initialState()
  state.activeSession = engine.createSession(state, { pulldown: { name: '高位下拉', sets: 1 } }, 1000)
  const sessionId = state.activeSession.id
  const completed = engine.finishSession(state, 'completed', 2000)
  assert.equal(completed.rotation.slotIndex, 1)
  assert.deepEqual(completed.completedSessionIds, [sessionId])
  const repeated = engine.finishSession(completed, 'completed', 3000)
  assert.equal(repeated.rotation.slotIndex, 1)
  assert.equal(repeated.history.length, 1)
})
