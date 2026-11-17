const engine = require('./engine')
const KEY = 'fitness_coach_v1'
let memory = null

function hash(text) {
  let value = 2166136261
  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i)
    value = Math.imul(value, 16777619)
  }
  return (value >>> 0).toString(16)
}

function api() {
  if (typeof wx !== 'undefined') return wx
  return {
    getStorageSync: () => memory,
    setStorageSync: (_, value) => { memory = value }
  }
}

function pack(state) {
  const payload = JSON.stringify(state)
  return { schemaVersion: 2, payload, checksum: hash(payload), savedAt: Date.now() }
}

function save(state) {
  api().setStorageSync(KEY, pack(state))
  return state
}

function load() {
  const envelope = api().getStorageSync(KEY)
  if (!envelope || !envelope.payload || hash(envelope.payload) !== envelope.checksum) {
    return engine.initialState()
  }
  try {
    const state = JSON.parse(envelope.payload)
    return migrate(state)
  } catch (error) {
    return engine.initialState()
  }
}

function migrate(state) {
  if (!state || (state.version !== 1 && state.version !== 2)) return engine.initialState()
  if (state.version === 1) {
    state.version = 2
    state.settings.templateConfirmed = Boolean(
      state.activeSession || (state.history && state.history.length) ||
      (state.settings.favorites && Object.keys(state.settings.favorites).length)
    )
  }
  if (typeof state.settings.templateConfirmed !== 'boolean') state.settings.templateConfirmed = false
  state.routines = state.routines || {}
  state.completedSessionIds = state.completedSessionIds || []
  return state
}

function bootstrap() {
  const envelope = api().getStorageSync(KEY)
  if (!envelope) save(engine.initialState())
  else if (!envelope.payload || hash(envelope.payload) !== envelope.checksum) {
    api().setStorageSync(`${KEY}_corrupt_${Date.now()}`, envelope)
    save(engine.initialState())
  } else {
    const state = load()
    if (state.version === 2 && envelope.schemaVersion !== 2) save(state)
  }
}

function resetMemory() { memory = null }

module.exports = { KEY, hash, pack, save, load, bootstrap, migrate, resetMemory }
