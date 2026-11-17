const { spawn, spawnSync } = require('node:child_process')
const fs = require('node:fs')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const ROOT = path.resolve(__dirname, '..')
const htmlPath = path.resolve(process.argv[2] || path.join(ROOT, 'dist', '训练助手试用版.html'))
const port = Number(process.env.SINGLE_HTML_PORT || 4180)
const screenshotDir = process.env.SINGLE_SCREENSHOT_DIR
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'fitness-single-smoke-'))

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 30000,
    ...options
  })
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')}\n${result.stdout || ''}\n${result.stderr || ''}`)
  }
  return result.stdout
}

function browserSmoke(url, label, extraEnv = {}) {
  const env = { ...process.env, PREVIEW_URL: url, ...extraEnv }
  if (screenshotDir) {
    fs.mkdirSync(screenshotDir, { recursive: true })
    env.WORKOUT_SCREENSHOT = path.join(screenshotDir, `fitness-single-${label}-workout.png`)
    env.SCREENSHOT = path.join(screenshotDir, `fitness-single-${label}-cycle.png`)
    env.CATEGORY_SCREENSHOT = path.join(screenshotDir, `fitness-single-${label}-category.png`)
  }
  const result = spawnSync(process.execPath, ['scripts/browser-smoke.js'], {
    cwd: ROOT, env, encoding: 'utf8', timeout: 30000
  })
  if (result.status !== 0) throw new Error(result.stdout + result.stderr)
  return result.stdout.trim()
}

function dumpDom(file, extraArgs, profileName) {
  const profile = path.join(temp, profileName)
  const systemChrome = '/opt/google/chrome/chrome'
  const chrome = process.env.CHROME_BIN || (fs.existsSync(systemChrome) ? systemChrome : 'google-chrome')
  return run(chrome, [
    '--headless', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
    `--user-data-dir=${profile}`, ...extraArgs, '--dump-dom', pathToFileURL(file).href
  ])
}

async function disabledScriptDom(file) {
  const port = 9235
  const profile = path.join(temp, 'disabled-cdp-profile')
  const systemChrome = '/opt/google/chrome/chrome'
  const chrome = spawn(process.env.CHROME_BIN || (fs.existsSync(systemChrome) ? systemChrome : 'google-chrome'), [
    '--headless', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'
  ], { stdio: 'ignore' })
  try {
    let target
    for (let i = 0; i < 50; i += 1) {
      try {
        const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(response => response.json())
        target = targets.find(item => item.type === 'page')
        if (target) break
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    if (!target) throw new Error('禁脚本测试浏览器未启动')
    const socket = new WebSocket(target.webSocketDebuggerUrl)
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true })
      socket.addEventListener('error', reject, { once: true })
    })
    let id = 0
    const pending = new Map()
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data)
      if (!message.id || !pending.has(message.id)) return
      const handler = pending.get(message.id)
      pending.delete(message.id)
      message.error ? handler.reject(new Error(message.error.message)) : handler.resolve(message.result)
    })
    const command = (method, params = {}) => new Promise((resolve, reject) => {
      const callId = ++id
      pending.set(callId, { resolve, reject })
      socket.send(JSON.stringify({ id: callId, method, params }))
    })
    await command('Emulation.setScriptExecutionDisabled', { value: true })
    await command('Page.navigate', { url: pathToFileURL(file).href })
    await new Promise(resolve => setTimeout(resolve, 300))
    if (screenshotDir) {
      const image = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
      fs.writeFileSync(path.join(screenshotDir, 'fitness-single-script-disabled.png'), Buffer.from(image.data, 'base64'))
    }
    const document = await command('DOM.getDocument', { depth: 1 })
    const outer = await command('DOM.getOuterHTML', { nodeId: document.root.nodeId })
    socket.close()
    return outer.outerHTML
  } finally {
    const exited = chrome.exitCode === null
      ? new Promise(resolve => chrome.once('exit', resolve))
      : Promise.resolve()
    chrome.kill('SIGTERM')
    await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 1000))])
  }
}

async function main() {
  if (!fs.existsSync(htmlPath)) throw new Error(`HTML 不存在：${htmlPath}`)
  const server = spawn(process.execPath, ['-e', `
    const fs=require('fs'),http=require('http');
    const file=${JSON.stringify(htmlPath)};
    http.createServer((req,res)=>{
      res.setHeader('Content-Type','text/html; charset=utf-8');
      if(req.url==='/sandbox.html'){
        res.setHeader('Content-Security-Policy','sandbox allow-scripts');
      }
      fs.createReadStream(file).pipe(res);
    }).listen(${port},'127.0.0.1')
  `], { stdio: 'ignore' })

  try {
    for (let i = 0; i < 50; i += 1) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}`)
        if (response.ok) break
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    const httpResult = browserSmoke(`http://127.0.0.1:${port}/trial.html`, 'http', { TEST_SETS: '3' })
    const fileResult = browserSmoke(pathToFileURL(htmlPath).href, 'file', { TEST_SETS: '6' })
    const sandboxResult = browserSmoke(`http://127.0.0.1:${port}/sandbox.html`, 'sandbox', {
      RESTRICTED_SANDBOX: '1',
      EXPECT_TEMP_STORAGE: '1',
      TEST_SETS: '6'
    })

    const source = fs.readFileSync(htmlPath, 'utf8')
    const blockedPath = path.join(temp, 'storage-blocked.html')
    fs.writeFileSync(blockedPath, source.replace(
      '<script>\n(function installBrowserStorage',
      `<script>Object.defineProperty(window,'localStorage',{get:function(){throw new Error('storage blocked')}})</script>\n<script>\n(function installBrowserStorage`
    ))
    const blockedResult = browserSmoke(pathToFileURL(blockedPath).href, 'storage-blocked', {
      EXPECT_TEMP_STORAGE: '1'
    })

    const disabledDom = await disabledScriptDom(htmlPath)
    if (!disabledDom.includes('当前聊天附件查看器可能禁止运行脚本') || !disabledDom.includes('可试功能')) {
      throw new Error('禁用脚本时未显示静态说明')
    }
    console.log(`HTTP：${httpResult}`)
    console.log(`file://：${fileResult}`)
    console.log(`opaque-origin 沙箱：${sandboxResult}`)
    console.log(`存储阻止：${blockedResult}`)
    console.log('脚本禁用：静态说明正常')
  } finally {
    server.kill('SIGTERM')
    await new Promise(resolve => setTimeout(resolve, 500))
    try {
      fs.rmSync(temp, { recursive: true, force: true, maxRetries: 10, retryDelay: 150 })
    } catch {}
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
