const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const events = require('../utils/component-events')

test('TDesign Input change 的 detail.value 保持即时保存值', () => {
  assert.equal(events.inputValue({ value: '42.5', cursor: 4 }), '42.5')
  assert.equal(events.inputValue({ value: 10 }), 10)
  assert.equal(events.inputValue('legacy'), 'legacy')
})

test('TDesign Switch change 的 detail.value 正确转为布尔值', () => {
  assert.equal(events.checkedValue({ value: true }), true)
  assert.equal(events.checkedValue({ value: false }), false)
})

test('usingComponents 均能映射到已锁定的 TDesign 小程序构建目录', () => {
  const root = path.resolve(__dirname, '..')
  const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'))
  const project = JSON.parse(fs.readFileSync(path.join(root, 'project.config.json'), 'utf8'))
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'))
  assert.equal(lock.packages['node_modules/tdesign-miniprogram'].version, '1.18.0')
  assert.equal(lock.packages['node_modules/tslib'].version, '2.9.1')
  assert.equal(project.setting.packNpmManually, true)
  assert.deepEqual(project.setting.packNpmRelationList[0], {
    packageJsonPath: './package.json',
    miniprogramNpmDistDir: './'
  })
  Object.values(app.usingComponents).forEach(componentPath => {
    const relative = componentPath.replace(/^tdesign-miniprogram\//, '')
    const file = path.join(root, 'node_modules/tdesign-miniprogram/miniprogram_dist', `${relative}.json`)
    assert.equal(fs.existsSync(file), true, `${componentPath} 应存在`)
  })
})
