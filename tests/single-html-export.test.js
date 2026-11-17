const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

test('单文件导出无外部依赖并包含禁脚本静态说明', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fitness-html-export-'))
  const output = path.join(directory, 'trial.html')
  const result = spawnSync(process.execPath, ['scripts/export-single-html.js', output], {
    cwd: path.resolve(__dirname, '..'),
    encoding: 'utf8'
  })
  assert.equal(result.status, 0, result.stderr)
  const html = fs.readFileSync(output, 'utf8')
  assert.match(html, /训练助手试用版/)
  assert.match(html, /当前聊天附件查看器可能禁止运行脚本/)
  assert.match(html, /global\.FitnessCore/)
  assert.match(html, /installBrowserStorage/)
  assert.doesNotMatch(html, /<script[^>]+\bsrc=/i)
  assert.doesNotMatch(html, /<link[^>]+\bhref=/i)
  assert.doesNotMatch(html, /https?:\/\//i)
  fs.rmSync(directory, { recursive: true, force: true })
})
