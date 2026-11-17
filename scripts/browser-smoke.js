const { spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const PREVIEW_URL = process.env.PREVIEW_URL || 'http://127.0.0.1:4173'
const DEBUG_PORT = Number(process.env.CHROME_DEBUG_PORT || 9223)
const SCREENSHOT = process.env.SCREENSHOT
const WORKOUT_SCREENSHOT = process.env.WORKOUT_SCREENSHOT
const CATEGORY_SCREENSHOT = process.env.CATEGORY_SCREENSHOT
const EXPECT_TEMP_STORAGE = process.env.EXPECT_TEMP_STORAGE === '1'
const RESTRICTED_SANDBOX = process.env.RESTRICTED_SANDBOX === '1'
const TEST_SETS = Number(process.env.TEST_SETS || 3)
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'fitness-preview-'))
const chrome = spawn(process.env.CHROME_BIN || 'google-chrome', [
  '--headless=new', '--disable-gpu', '--no-sandbox',
  `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profile}`,
  '--window-size=430,900', PREVIEW_URL
], { stdio: 'ignore' })

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

async function pageTarget() {
  for (let i = 0; i < 50; i += 1) {
    try {
      const targets = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`).then(response => response.json())
      const target = targets.find(item => item.type === 'page' && item.url.startsWith(PREVIEW_URL))
      if (target) return target
    } catch {}
    await sleep(100)
  }
  throw new Error('Chrome DevTools target did not become ready')
}

async function run() {
  const target = await pageTarget()
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
    const { resolve, reject } = pending.get(message.id)
    pending.delete(message.id)
    if (message.error) reject(new Error(message.error.message))
    else resolve(message.result)
  })
  const command = (method, params = {}) => new Promise((resolve, reject) => {
    const callId = ++id
    pending.set(callId, { resolve, reject })
    socket.send(JSON.stringify({ id: callId, method, params }))
  })
  const evaluate = async expression => {
    const params = { expression, returnByValue: true, awaitPromise: true }
    const result = await command('Runtime.evaluate', params)
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
    }
    return result.result.value
  }
  const waitFor = async expression => {
    for (let i = 0; i < 50; i += 1) {
      if (await evaluate(expression)) return
      await sleep(100)
    }
    throw new Error(`Timed out: ${expression}`)
  }

  await waitFor(`document.body && (document.body.innerText.includes('开始记录训练') || document.body.innerText.includes('今天练什么'))`)
  let sandboxFormBlocked = false
  if (RESTRICTED_SANDBOX) {
    const nativeSubmitSeen = await evaluate(`(() => {
      let seen = false;
      const form = document.createElement('form');
      const button = document.createElement('button');
      button.type = 'submit';
      form.addEventListener('submit', event => { seen = true; event.preventDefault(); });
      form.appendChild(button);
      document.body.appendChild(form);
      button.click();
      form.remove();
      return seen;
    })()`)
    if (nativeSubmitSeen) throw new Error('当前沙箱未复现原生表单提交被阻止')
    sandboxFormBlocked = true
  }
  await evaluate(`try { localStorage.clear() } catch (error) {}; location.reload()`)
  await sleep(250)
  await waitFor(`document.querySelector('#first-template') !== null`)
  await evaluate(`document.querySelector('[data-action="confirm-first-template"]').click()`)
  await waitFor(`document.querySelector('[data-action="category"]') !== null`)
  await evaluate(`document.querySelector('[data-action="category"]').click()`)
  await waitFor(`document.querySelector('#category-form') !== null`)
  const initialRows = await evaluate(`document.querySelectorAll('.config-row').length`)
  if (initialRows !== 1) throw new Error(`首次部位配置应只有一行，实际为 ${initialRows}`)
  const clickProbe = await evaluate(`(() => {
    let bubbled = 0;
    const app = document.querySelector('#app');
    const probe = () => { bubbled += 1; };
    app.addEventListener('click', probe);
    const button = document.querySelector('[data-action="start-training"]');
    const inForm = Boolean(button.closest('#category-form'));
    button.click();
    app.removeEventListener('click', probe);
    return { bubbled, inForm };
  })()`)
  await sleep(50)
  const emptyValidation = await evaluate(`(() => ({
    error: document.querySelector('#category-error').innerText,
    shown: document.querySelector('#category-error').classList.contains('show'),
    diagnostic: document.querySelector('#start-diagnostic').textContent
  }))()`)
  if (!emptyValidation.shown || !emptyValidation.error.includes('请先选择动作类型')) {
    throw new Error(`空配置点击未显示校验：${JSON.stringify({ clickProbe, emptyValidation })}`)
  }
  await evaluate(`(() => {
    const form = document.querySelector('#category-form');
    const type = form.querySelector('.config-type');
    type.value = [...type.options].find(option => option.textContent === '水平划船').value;
    type.dispatchEvent(new Event('change', { bubbles: true }));
    const exercise = form.querySelector('.config-exercise');
    exercise.value = [...exercise.options].find(option => option.textContent === '坐姿器械划船').value;
    form.querySelector('.config-sets').value = ${TEST_SETS};
  })()`)
  const overflows = await evaluate(`document.documentElement.scrollWidth > window.innerWidth`)
  if (overflows) throw new Error('单行动作配置在手机宽度发生横向溢出')
  if (CATEGORY_SCREENSHOT) {
    const image = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    fs.writeFileSync(CATEGORY_SCREENSHOT, Buffer.from(image.data, 'base64'))
  }
  await evaluate(`(() => {
    const form = document.querySelector('#category-form');
    form.querySelector('[data-action="start-training"]').click();
  })()`)
  await waitFor(`document.querySelector('[data-action="next-exercise"]') !== null`)
  const opened = RESTRICTED_SANDBOX
    ? await evaluate(`(() => ({
        name: document.querySelector('h1').innerText,
        sets: document.querySelectorAll('.set-grid[data-set]').length
      }))()`)
    : await evaluate(`(() => {
        const state = FitnessCore.store.load();
        const exercise = state.activeSession.parts[0].exercises[0];
        return { name: exercise.name, sets: exercise.sets.length };
      })()`)
  if (opened.name !== '坐姿器械划船' || opened.sets !== TEST_SETS) {
    throw new Error(`训练页动作或组数不符：${JSON.stringify(opened)}`)
  }
  await evaluate(`(() => {
    const row = document.querySelector('.set-grid[data-exercise="0"][data-set="0"]');
    const weight = row.querySelector('.weight'); weight.value = '40'; weight.dispatchEvent(new Event('input', { bubbles: true }));
    const reps = row.querySelector('.reps'); reps.value = '10'; reps.dispatchEvent(new Event('input', { bubbles: true }));
  })()`)
  if (RESTRICTED_SANDBOX) {
    await evaluate(`document.querySelector('[data-action="complete-set"]').click()`)
    await waitFor(`document.querySelector('#clock') !== null`)
    if (WORKOUT_SCREENSHOT) {
      const image = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
      fs.writeFileSync(WORKOUT_SCREENSHOT, Buffer.from(image.data, 'base64'))
    }
    await waitFor(`document.querySelector('.preview-banner').innerText.includes('临时试用')`)
    socket.close()
    console.log(`受限沙箱交互点测通过：${JSON.stringify(opened)}，原生表单提交被阻止=${sandboxFormBlocked}，显式点击、逐组输入及完成可操作，页面明确标注临时模式`)
    return
  }
  if (EXPECT_TEMP_STORAGE) {
    await waitFor(`document.querySelector('.preview-banner').innerText.includes('临时试用')`)
  } else {
    await command('Page.reload', { ignoreCache: true })
    await sleep(250)
    await waitFor(`document.querySelector('[data-action="resume"]') !== null`)
    await evaluate(`document.querySelector('[data-action="resume"]').click()`)
  }
  await waitFor(`document.querySelector('.weight') && document.querySelector('.weight').value === '40'`)
  if (WORKOUT_SCREENSHOT) {
    const image = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    fs.writeFileSync(WORKOUT_SCREENSHOT, Buffer.from(image.data, 'base64'))
  }
  const draftState = await evaluate(`(() => {
    const state = FitnessCore.store.load();
    const set = state.activeSession.parts[0].exercises[0].sets[0];
    return { weight: set.weight, reps: set.reps, done: set.done, slot: state.rotation.slotIndex };
  })()`)
  if (draftState.weight !== '40' || draftState.reps !== '10' || draftState.done || draftState.slot !== 0) {
    throw new Error(`Draft restore mismatch: ${JSON.stringify(draftState)}`)
  }
  await evaluate(`document.querySelector('[data-action="complete-set"]').click()`)
  await waitFor(`document.querySelector('#clock') !== null`)
  await evaluate(`document.querySelector('[data-action="extend"]').click(); window.confirm = () => true`)

  for (let step = 0; step < 30; step += 1) {
    const screen = await evaluate(`document.querySelector('#category-form') ? 'category' : document.querySelector('[data-action="next-exercise"]') ? 'workout' : 'today'`)
    if (screen === 'today') break
    if (screen === 'category') {
      await evaluate(`(() => {
        const form = document.querySelector('#category-form');
        const type = form.querySelector('.config-type');
        type.value = type.options[1].value;
        type.dispatchEvent(new Event('change', { bubbles: true }));
        const exercise = form.querySelector('.config-exercise');
        exercise.value = exercise.options[1].value;
        form.querySelector('[data-action="start-training"]').click();
      })()`)
    } else {
      await evaluate(`document.querySelector('[data-action="next-exercise"]').click()`)
    }
    await sleep(50)
  }

  await waitFor(`document.body.innerText.includes('胸 · 肩前中束 · 三头')`)
  await evaluate(`document.querySelector('[data-route="records"]').click()`)
  await waitFor(`document.body.innerText.includes('背 · 肩后束 · 二头')`)
  await evaluate(`document.querySelector('[data-action="record"]').click()`)
  await waitFor(`document.querySelector('.history-edit') !== null`)
  await evaluate(`(() => {
    const input = document.querySelector('.history-edit[data-field="weight"]');
    input.value = '42.5'; input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`)
  const corrected = await evaluate(`(() => {
    const state = FitnessCore.store.load();
    const name = state.history[0].parts[0].exercises[0].name;
    return FitnessCore.engine.getLastPerformance(state, name, 'kg').sets[0].weight;
  })()`)
  if (corrected !== '42.5') throw new Error(`History correction mismatch: ${corrected}`)
  await evaluate(`document.querySelector('[data-action="back-records"]').click()`)
  await evaluate(`document.querySelector('[data-route="settings"]').click()`)
  await waitFor(`document.querySelector('#bp-toggle') !== null`)
  await evaluate(`(() => {
    const toggle = document.querySelector('#bp-toggle'); toggle.checked = false; toggle.dispatchEvent(new Event('change', { bubbles: true }));
    const rest = document.querySelector('[data-rest="compound"]'); rest.value = '150'; rest.dispatchEvent(new Event('change', { bubbles: true }));
  })()`)
  if (EXPECT_TEMP_STORAGE) {
    await waitFor(`document.querySelector('.preview-banner').innerText.includes('临时试用')`)
  } else {
    await command('Page.reload', { ignoreCache: true })
    await sleep(300)
    await waitFor(`document.body.innerText.includes('浏览器预览，非微信运行')`)
  }
  const restored = await evaluate(`(() => {
    const state = FitnessCore.store.load();
    return { slot: state.rotation.slotIndex, bp: state.settings.bpUnconfirmed, rest: state.settings.rests.compound, history: state.history.length };
  })()`)
  if (restored.slot !== 1 || restored.bp !== false || restored.rest !== 150 || restored.history < 1) {
    throw new Error(`Refresh restore mismatch: ${JSON.stringify(restored)}`)
  }
  if (SCREENSHOT) {
    const image = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    fs.writeFileSync(SCREENSHOT, Buffer.from(image.data, 'base64'))
  }
  if (EXPECT_TEMP_STORAGE) {
    await command('Page.reload', { ignoreCache: true })
    await sleep(300)
    await waitFor(`document.querySelector('.preview-banner').innerText.includes('临时试用')`)
    const resetState = await evaluate(`FitnessCore.store.load()`)
    if (resetState.history.length !== 0 || resetState.activeSession) {
      throw new Error('临时模式刷新后不应虚称已保存数据')
    }
  }
  socket.close()
  console.log(`浏览器交互点测通过：启动=${JSON.stringify(opened)}，恢复=${JSON.stringify(restored)}`)
}

run().catch(error => {
  console.error(error)
  process.exitCode = 1
}).finally(async () => {
  const exited = new Promise(resolve => chrome.once('exit', resolve))
  chrome.kill('SIGTERM')
  await Promise.race([
    exited,
    sleep(1000)
  ])
  try {
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 })
  } catch {}
})
