const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { buildCoreBundle } = require('../web/server')

function browserContext() {
  const values = new Map()
  const context = {
    console: { log: console.log, warn() {} },
    localStorage: {
      getItem: key => values.has(key) ? values.get(key) : null,
      setItem: (key, value) => values.set(key, value),
      removeItem: key => values.delete(key)
    }
  }
  context.window = context
  vm.createContext(context)
  return { context, values }
}

test('浏览器适配层复用核心模块并通过 localStorage 刷新恢复', () => {
  const { context, values } = browserContext()
  const adapter = fs.readFileSync(path.join(__dirname, '../web/storage-adapter.js'), 'utf8')
  vm.runInContext(adapter, context)
  vm.runInContext(buildCoreBundle(), context)
  const { engine, store } = context.FitnessCore
  store.bootstrap()
  const state = store.load()
  state.settings.displayName = '浏览器恢复测试'
  store.save(state)
  assert.equal(store.load().settings.displayName, '浏览器恢复测试')
  assert.ok(values.has('wechat-preview:fitness_coach_v1'))
  assert.equal(engine.getCurrentSlot(store.load()).id, 'day1')
})

test('浏览器损坏数据安全回退，不污染微信存储命名空间', () => {
  const { context, values } = browserContext()
  const adapter = fs.readFileSync(path.join(__dirname, '../web/storage-adapter.js'), 'utf8')
  vm.runInContext(adapter, context)
  vm.runInContext(buildCoreBundle(), context)
  values.set('wechat-preview:fitness_coach_v1', '{broken')
  assert.equal(context.FitnessCore.store.load().settings.templateId, 'gym3')
  assert.equal(values.has('fitness_coach_v1'), false)
})

test('localStorage 被查看器禁止时自动使用临时内存且不崩溃', () => {
  const context = { console: { log() {}, warn() {} } }
  Object.defineProperty(context, 'localStorage', {
    get() { throw new Error('SecurityError: storage blocked') }
  })
  context.window = context
  vm.createContext(context)
  const adapter = fs.readFileSync(path.join(__dirname, '../web/storage-adapter.js'), 'utf8')
  vm.runInContext(adapter, context)
  vm.runInContext(buildCoreBundle(), context)
  assert.equal(context.__FITNESS_STORAGE_STATUS__.persistent, false)
  assert.doesNotThrow(() => context.FitnessCore.store.bootstrap())
  const state = context.FitnessCore.store.load()
  state.settings.displayName = '临时试用'
  context.FitnessCore.store.save(state)
  assert.equal(context.FitnessCore.store.load().settings.displayName, '临时试用')
})
