const fs = require('node:fs')
const path = require('node:path')
const { buildCoreBundle } = require('../web/server')

const ROOT = path.resolve(__dirname, '..')
const output = path.resolve(process.argv[2] || path.join(ROOT, 'dist', '训练助手试用版.html'))

function safeScript(source) {
  return source.replace(/<\/script/gi, '<\\/script')
}

function exportSingleHtml() {
  const css = fs.readFileSync(path.join(ROOT, 'web/style.css'), 'utf8')
  const storage = fs.readFileSync(path.join(ROOT, 'web/storage-adapter.js'), 'utf8')
  const preview = fs.readFileSync(path.join(ROOT, 'web/preview.js'), 'utf8')
  let html = fs.readFileSync(path.join(ROOT, 'web/index.html'), 'utf8')

  html = html
    .replace('<title>太岁 · 训练助手浏览器预览</title>', '<title>训练助手试用版</title>')
    .replace('<link rel="stylesheet" href="/style.css">', `<style>\n${css}\n</style>`)
    .replace('<script src="/storage-adapter.js"></script>', `<script>\n${safeScript(storage)}\n</script>`)
    .replace('<script src="/core.js"></script>', `<script>\n${safeScript(buildCoreBundle())}\n</script>`)
    .replace('<script src="/preview.js"></script>', `<script>\n${safeScript(preview)}\n</script>`)
    .replace(
      '浏览器预览，非微信运行 · 数据仅保存在本机浏览器',
      '试用版（浏览器预览，非微信运行）· 记录保存在当前浏览器；若存储被禁止会自动切换为临时试用'
    )
  html = html.replace('<head>', '<head>\n  <!-- 单文件离线试用版：无外部脚本、样式、接口或登录 -->')

  fs.mkdirSync(path.dirname(output), { recursive: true })
  fs.writeFileSync(output, html)
  return output
}

if (require.main === module) {
  const result = exportSingleHtml()
  console.log(`单文件 HTML 已生成：${result}`)
}

module.exports = { exportSingleHtml, safeScript }
