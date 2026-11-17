(function previewApp() {
  const { engine, plans, store } = window.FitnessCore
  const app = document.querySelector('#app')
  const tabs = document.querySelector('#tabs')
  let route = 'today'
  let routeData = {}
  let toastTimer

  store.bootstrap()

  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char])

  function toast(message) {
    const node = document.querySelector('#toast')
    node.textContent = message
    node.classList.add('show')
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => node.classList.remove('show'), 1800)
  }

  function navigate(next, data) {
    route = next
    routeData = data || {}
    render()
    window.scrollTo(0, 0)
  }

  function safety(state) {
    return state.settings.bpUnconfirmed ? `
      <section class="card safety"><b>血压仍未确认 · 保守训练</b>
      <div class="hint">不憋气、不做极限/力竭/HIIT/1RM。胸痛、明显气促或晕厥时停止并及时就医。</div></section>` : ''
  }

  function renderToday() {
    const state = store.load()
    const template = plans.templates[state.settings.templateId]
    const slot = engine.getCurrentSlot(state)
    if (!state.settings.templateConfirmed) {
      app.innerHTML = `<h1>开始记录训练</h1><div class="sub">首次只需选择一次分化方案，之后在设置中修改。</div>
        <section class="card"><h2>选择训练分化</h2>
          <label>分化方案</label><select id="first-template">${Object.values(plans.templates).map(item => `<option value="${item.id}">${esc(item.name)}</option>`).join('')}</select>
          <button class="primary" data-action="confirm-first-template">确认并开始</button>
        </section>`
      return
    }
    app.innerHTML = `
      <h1>今天练什么</h1><div class="sub">${esc(state.rotation.scheduledDate || engine.todayKey())} · ${esc(template.name)}</div>
      ${safety(state)}
      <section class="card"><span class="muted">当前槽位</span><div class="hero">${esc(slot.title)}</div>
      ${slot.isLeg && template.gymLegRotation ? `<div class="hint">本次重点：${state.rotation.legFocus === 'quads' ? '股四头 + 兼练' : '腘绳肌 + 兼练'}</div>` : ''}</section>
      <div class="group">按顺序完成部位</div>
      ${slot.parts.map((part, index) => {
        const configured = engine.getRoutine(state, slot.id, index)
        return `<div class="part row" data-action="${configured ? 'start-routine' : 'category'}" data-index="${index}">
        <span><i class="num">${index + 1}</i>${esc(part.name)}</span><span class="${index ? 'muted' : 'orange'}">${index ? '待开始' : '当前'} ›</span>
      </div>`}).join('')}
      <button class="primary" data-action="${state.activeSession ? 'resume' : (engine.getRoutine(state, slot.id, 0) ? 'start-routine' : 'category')}" data-index="0">${state.activeSession ? '恢复进行中的训练' : '开始当前部位'}</button>
      <div class="actions"><button class="secondary" data-action="rest">今天休息</button><button class="secondary" data-action="skip">跳过槽位</button></div>
      <div class="hint" style="text-align:center;margin-top:10px">休息不推进 · 只有确认完成训练后才推进</div>`
  }

  function renderCategory() {
    const state = store.load()
    const slot = engine.getCurrentSlot(state)
    const index = Number(routeData.index || 0)
    const part = slot.parts[index]
    if (!part) return navigate('today')
    const routine = engine.getRoutine(state, slot.id, index) || {}
    if (!routeData.rows) {
      routeData.rows = part.patterns
        .filter(pattern => routine[pattern.id])
        .map(pattern => ({
          patternId: pattern.id,
          name: routine[pattern.id].name,
          sets: routine[pattern.id].sets
        }))
      if (!routeData.rows.length) routeData.rows = [{ patternId: '', name: '', sets: 3 }]
    }
    app.innerHTML = `<h1>${esc(part.name)}</h1><div class="sub">默认只配一个动作，需要时再主动添加</div>
      <form id="category-form" data-index="${index}">
      ${routeData.rows.map((row, rowIndex) => {
        const selectedPattern = part.patterns.find(pattern => pattern.id === row.patternId)
        return `<section class="card config-row" data-row="${rowIndex}">
          <div class="row"><h2>动作 ${rowIndex + 1}</h2>${routeData.rows.length > 1 ? `<button class="remove-config" type="button" data-action="remove-config" data-index="${rowIndex}">删除</button>` : ''}</div>
          <div class="config-selects">
            <div><label>动作类型</label><select class="config-type">
              <option value="">请选择类型</option>
              ${part.patterns.map(pattern => `<option value="${esc(pattern.id)}" ${pattern.id === row.patternId ? 'selected' : ''}>${esc(pattern.name)}</option>`).join('')}
            </select></div>
            <div><label>器械 / 具体动作</label><select class="config-exercise" ${selectedPattern ? '' : 'disabled'}>
              <option value="">${selectedPattern ? '请选择具体动作' : '先选动作类型'}</option>
              ${selectedPattern ? selectedPattern.options.map(name => `<option value="${esc(name)}" ${name === row.name ? 'selected' : ''}>${esc(name)}</option>`).join('') : ''}
            </select></div>
          </div>
          <div class="config-bottom"><div><label>本次组数</label><input class="config-sets" type="number" min="1" max="8" value="${esc(row.sets || (selectedPattern && selectedPattern.suggestedSets) || 3)}"></div>
          <div class="source config-source">${selectedPattern ? `${esc(selectedPattern.role)} · ${esc(selectedPattern.sourceTotal)}` : '选择类型后显示原表类别说明'}</div></div>
          ${row.patternId === 'straight-arm' ? '<div class="hint">直臂下压是可选补充，不替代水平划船。</div>' : ''}
        </section>`
      }).join('')}
      <button class="add-config" type="button" data-action="add-config">＋ 添加另一个动作（可选）</button>
      <div id="category-error" class="form-error" role="alert"></div>
      <button class="primary" type="button" data-action="start-training">开始训练</button>
      <details class="start-diagnostics"><summary>点了没反应？查看诊断</summary><pre id="start-diagnostic">等待点击开始训练</pre></details>
      </form>`
  }

  function readConfigRows() {
    return [...document.querySelectorAll('.config-row')].map(row => ({
      patternId: row.querySelector('.config-type').value,
      name: row.querySelector('.config-exercise').value,
      sets: Number(row.querySelector('.config-sets').value) || 3
    }))
  }

  function startPart(form) {
    const error = form.querySelector('#category-error')
    const diagnostic = form.querySelector('#start-diagnostic')
    const mark = (stage, cause) => {
      if (!diagnostic) return
      const storage = window.__FITNESS_STORAGE_STATUS__
      diagnostic.textContent = [
        `阶段：${stage}`,
        `存储：${storage && storage.persistent === false ? '临时模式' : '可持久保存'}`,
        `页面来源：${location.protocol || '未知'}`,
        cause ? `异常：${cause.message || String(cause)}` : ''
      ].filter(Boolean).join('\n')
    }
    const showError = (message, field) => {
      error.textContent = message
      error.classList.add('show')
      if (field) field.focus()
      try { error.scrollIntoView({ block: 'center', behavior: 'smooth' }) } catch (cause) { error.scrollIntoView() }
    }
    error.textContent = ''
    error.classList.remove('show')
    mark('已收到按钮点击')
    try {
      let state = store.load()
      const slot = engine.getCurrentSlot(state)
      const partIndex = Number(form.dataset.index)
      const part = slot.parts[partIndex]
      const choices = {}
      const rows = Array.prototype.slice.call(form.querySelectorAll('.config-row'))
      mark('正在校验动作')
      for (let index = 0; index < rows.length; index += 1) {
        const type = rows[index].querySelector('.config-type')
        const exercise = rows[index].querySelector('.config-exercise')
        const sets = rows[index].querySelector('.config-sets')
        if (!type.value) return showError(`动作 ${index + 1}：请先选择动作类型`, type)
        if (!exercise.value) return showError(`动作 ${index + 1}：请选择器械或具体动作`, exercise)
        const count = Number(sets.value)
        if (!Number.isInteger(count) || count < 1 || count > 8) return showError(`动作 ${index + 1}：组数请输入 1–8 的整数`, sets)
        if (choices[type.value]) return showError(`动作 ${index + 1}：同一动作类型请勿重复添加`, type)
        choices[type.value] = { name: exercise.value, sets: count }
        state.settings.favorites[`${state.settings.templateId}:${type.value}`] = exercise.value
      }
      mark('正在建立训练')
      state = engine.saveRoutine(state, slot.id, partIndex, choices)
      const built = engine.createSession(state, choices)
      const selectedPart = built.parts.find(item => item.name === part.name)
      if (!selectedPart || !selectedPart.exercises.length) return showError('没有可开始的动作，请检查上方选择')
      if (!state.activeSession) {
        built.parts = [selectedPart]
        built.currentPlanPartIndex = partIndex
        state.activeSession = built
      } else {
        const existingIndex = state.activeSession.parts.findIndex(item => item.name === selectedPart.name)
        if (existingIndex < 0) {
          state.activeSession.parts.push(selectedPart)
          state.activeSession.partIndex = state.activeSession.parts.length - 1
        } else {
          const existing = state.activeSession.parts[existingIndex]
          selectedPart.exercises.forEach(exercise => {
            const prior = existing.exercises.find(item => item.name === exercise.name)
            if (!prior) return
            exercise.sets.forEach((set, index) => { if (prior.sets[index]) exercise.sets[index] = prior.sets[index] })
          })
          state.activeSession.parts[existingIndex] = selectedPart
          state.activeSession.partIndex = existingIndex
        }
        state.activeSession.exerciseIndex = 0
        state.activeSession.currentPlanPartIndex = partIndex
      }
      mark('正在保存并打开训练页')
      store.save(state)
      navigate('workout')
    } catch (cause) {
      console.error(cause)
      mark('启动失败', cause)
      showError(`无法开始训练：${cause && cause.message ? cause.message : '请检查选择后重试'}`)
    }
  }

  function startRoutine(partIndex) {
    const state = store.load()
    const slot = engine.getCurrentSlot(state)
    const routine = engine.getRoutine(state, slot.id, partIndex)
    if (!routine) return navigate('category', { index: partIndex })
    const built = engine.createSession(state, routine)
    const selectedPart = built.parts.find(item => item.name === slot.parts[partIndex].name)
    built.parts = [selectedPart]
    built.currentPlanPartIndex = partIndex
    state.activeSession = built
    store.save(state)
    navigate('workout')
  }

  function renderWorkout() {
    const state = store.load()
    const session = state.activeSession
    if (!session) return navigate('today')
    const part = session.parts[session.partIndex]
    const exerciseIndex = session.exerciseIndex || 0
    const exercise = part.exercises[exerciseIndex]
    const last = engine.getLastPerformance(state, exercise.name, exercise.unit || 'kg')
    const remaining = engine.restRemaining(session.rest)
    app.innerHTML = `<div class="muted">${esc(session.title)} · ${esc(part.name)} · 动作 ${exerciseIndex + 1}/${part.exercises.length}</div>
      <div class="row"><h1>${esc(exercise.name)}</h1><button class="small-button" data-action="edit-part">编辑动作</button></div>
      <div class="sub">${esc(exercise.patternName)} · 每组留 2–3 次余力，不憋气</div>
      <section class="card"><div class="muted">上次同动作</div>
        ${last ? `<div class="source">${esc(last.date)} · 单位 ${esc(last.unit)}</div><div class="previous-performance">${last.sets.map(set => `${esc(set.weight || '—')} kg × ${esc(set.reps || '—')}`).join('　')}</div>` : '<div class="empty-performance">暂无真实记录，完成训练后这里会显示。</div>'}
      </section>
      ${session.rest ? `<section class="card timer ${remaining ? '' : 'done'}"><div class="muted">最低休息</div>
        <div class="clock" id="clock">${clock(remaining)}</div><div class="hint" id="rest-hint">${remaining ? '计时期间下一组不可完成' : '最低休息已到，由你决定何时继续'}</div>
        <div class="actions"><select id="rest-adjust"><option value="">调整时长</option>${[60,90,120,180,240].map(n => `<option value="${n}">${n} 秒</option>`).join('')}</select>
        <button class="small-button" data-action="extend">延长 30 秒</button></div></section>` : ''}
      <section class="card"><div class="row"><h2>本次记录</h2><span class="role">${esc(exercise.role)}</span></div>
        <div class="source">${esc(exercise.sourceTotal)}；输入立即自动保存</div>
        <div class="set-grid muted"><span>组</span><span>重量 kg</span><span>次数</span><span>完成</span></div>
        ${exercise.sets.map((set, setIndex) => `<div class="set-grid" data-exercise="${exerciseIndex}" data-set="${setIndex}">
          <span>${set.index}</span><input class="weight" data-field="weight" type="number" step="0.5" value="${esc(set.weight)}" ${set.done ? 'disabled' : ''} placeholder="—">
          <input class="reps" data-field="reps" type="number" value="${esc(set.reps)}" ${set.done ? 'disabled' : ''} placeholder="—">
          <button class="${set.done ? 'done' : ''}" data-action="complete-set" ${set.done || remaining ? 'disabled' : ''}>${set.done ? '✓' : '完成'}</button></div>`).join('')}
      </section>
      <div class="actions">${exerciseIndex > 0 ? '<button class="secondary" data-action="previous-exercise">上一个动作</button>' : ''}
      <button class="primary" data-action="next-exercise">${exerciseIndex < part.exercises.length - 1 ? '下一个动作' : '完成本部位'}</button></div>
      <button class="secondary" data-action="partial">保存并结束（允许部分完成）</button>`
  }

  function completeSet(button) {
    const row = button.closest('.set-grid')
    const state = store.load()
    if (engine.restRemaining(state.activeSession.rest) > 0) return
    const exerciseIndex = Number(row.dataset.exercise)
    const setIndex = Number(row.dataset.set)
    const exercise = state.activeSession.parts[state.activeSession.partIndex].exercises[exerciseIndex]
    const result = engine.completeSet(state.activeSession, state.activeSession.partIndex, exerciseIndex, setIndex, {
      weight: row.querySelector('.weight').value,
      reps: row.querySelector('.reps').value,
      restSeconds: state.settings.rests[exercise.restType] || 60
    })
    if (result.changed) {
      state.activeSession = result.session
      store.save(state)
      renderWorkout()
    }
  }

  function clock(seconds) {
    return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
  }

  function tick() {
    if (route !== 'workout') return
    const state = store.load()
    if (!state.activeSession || !state.activeSession.rest) return
    const remaining = engine.restRemaining(state.activeSession.rest)
    const node = document.querySelector('#clock')
    if (node) node.textContent = clock(remaining)
    const hint = document.querySelector('#rest-hint')
    if (hint) hint.textContent = remaining ? '计时期间下一组不可完成' : '最低休息已到，由你决定何时继续'
    document.querySelectorAll('[data-action="complete-set"]:not(.done)').forEach(button => { button.disabled = remaining > 0 })
    document.querySelector('.timer')?.classList.toggle('done', remaining === 0)
  }

  function nextExercise() {
    const state = store.load()
    const session = state.activeSession
    const part = session.parts[session.partIndex]
    if ((session.exerciseIndex || 0) < part.exercises.length - 1) {
      session.exerciseIndex = (session.exerciseIndex || 0) + 1
      store.save(state)
      renderWorkout()
      return
    }
    const slot = engine.getCurrentSlot(state)
    const current = session.currentPlanPartIndex
    if (current < slot.parts.length - 1) {
      const nextPartIndex = current + 1
      const routine = engine.getRoutine(state, slot.id, nextPartIndex)
      if (!routine) return navigate('category', { index: nextPartIndex })
      const built = engine.createSession(state, routine)
      const selectedPart = built.parts.find(item => item.name === slot.parts[nextPartIndex].name)
      session.parts.push(selectedPart)
      session.partIndex = session.parts.length - 1
      session.exerciseIndex = 0
      session.currentPlanPartIndex = nextPartIndex
      store.save(state)
      renderWorkout()
      return
    }
    if (!confirm('确认完成本次训练？只有确认后才推进训练分化。')) return
    store.save(engine.finishSession(state, 'completed'))
    toast('训练已完成，循环已推进')
    navigate('today')
  }

  function renderRecords() {
    const state = store.load()
    const summaries = engine.exerciseSummaries(state)
    app.innerHTML = `<h1>记录</h1><div class="sub">动作进步与训练历史</div>
      <div class="group">动作进步</div>
      ${summaries.length ? summaries.map(item => `<div class="history row" data-action="exercise-history" data-name="${esc(item.name)}"><span><b>${esc(item.name)}</b><br><span class="hint">上次 ${esc(item.last.date)} · ${item.count} 次训练记录</span></span><span class="orange">历史 ›</span></div>`).join('') : '<div class="empty">暂无真实训练记录，不生成示例数据。</div>'}
      <div class="group">训练历史</div>
      ${state.history.length ? state.history.map(record => `<div class="history row" data-action="record" data-id="${esc(record.id)}"><span><b>${esc(record.title)}</b><br><span class="hint">${esc(record.date)} · ${record.status === 'completed' ? '已完成' : record.status === 'skipped' ? '已跳过' : '部分完成'}</span></span><span class="orange">查看 ›</span></div>`).join('') : '<div class="empty">完成训练后，逐组记录会出现在这里。</div>'}`
  }

  function renderRecord() {
    const record = store.load().history.find(item => item.id === routeData.id)
    if (!record) return navigate('records')
    app.innerHTML = `<button class="small-button" data-action="back-records">‹ 返回记录</button><h1 style="margin-top:18px">${esc(record.title)}</h1><div class="sub">${esc(record.date)}</div>
      ${(record.parts || []).map((part, partIndex) => `<section class="card"><h2>${esc(part.name)}</h2>${part.exercises.map((exercise, exerciseIndex) => `<div style="margin-top:18px"><b>${esc(exercise.name)}</b>
        ${exercise.sets.map((set, setIndex) => `<div class="record-set ${set.done ? 'done' : ''}">第 ${set.index} 组　${set.done ? `<input class="history-edit" data-session="${esc(record.id)}" data-part="${partIndex}" data-exercise="${exerciseIndex}" data-set="${setIndex}" data-field="weight" value="${esc(set.weight)}"> kg × <input class="history-edit" data-session="${esc(record.id)}" data-part="${partIndex}" data-exercise="${exerciseIndex}" data-set="${setIndex}" data-field="reps" value="${esc(set.reps)}"> 次` : '未完成'}</div>`).join('')}</div>`).join('')}</section>`).join('')}`
  }

  function renderExerciseHistory() {
    const rows = engine.listExerciseHistory(store.load(), routeData.name, 'kg')
    app.innerHTML = `<button class="small-button" data-action="back-records">‹ 返回记录</button>
      <h1 style="margin-top:18px">${esc(routeData.name)}</h1><div class="sub">仅比较相同单位 kg 的真实完成记录</div>
      ${rows.length ? rows.map(row => `<div class="card history" data-action="record" data-id="${esc(row.sessionId)}"><div class="row"><b>${esc(row.date)}</b><span class="orange">纠错 ›</span></div>
        <div class="previous-performance">${row.sets.map(set => `${esc(set.weight || '—')} kg × ${esc(set.reps || '—')}`).join('　')}</div></div>`).join('') : '<div class="empty">暂无记录</div>'}`
  }

  function renderSettings() {
    const state = store.load()
    app.innerHTML = `<h1>设置</h1>
      <div class="group">个人与安全</div><section class="setting"><label>显示名称</label><input id="display-name" value="${esc(state.settings.displayName)}"></section>
      <section class="setting row"><span>血压仍未确认<br><span class="hint">开启时显示保守训练提醒</span></span><input id="bp-toggle" type="checkbox" style="width:auto" ${state.settings.bpUnconfirmed ? 'checked' : ''}></section>
      <div class="group">训练安排</div><section class="setting"><label>训练循环</label><select id="template-select">${Object.values(plans.templates).map(template => `<option value="${template.id}" ${template.id === state.settings.templateId ? 'selected' : ''}>${esc(template.name)}</option>`).join('')}</select></section>
      <section class="setting"><label>训练时间模式（只改提醒，不动循环）</label><select id="time-select">${['早上','中午','下午','晚上'].map(value => `<option ${value === state.settings.timePeriod ? 'selected' : ''}>${value}</option>`).join('')}</select><div class="hint">${esc(state.settings.mealRelation)}</div></section>
      <div class="group">默认最低休息</div>
      ${[['compound','复合动作','参考 120–180 秒'],['isolation','孤立动作','参考 60–90 秒'],['leg','蹲 / 硬拉','原表只说“可更长”']].map(([key,name,note]) => `<section class="setting"><label>${name} · ${note}</label><select data-rest="${key}">${[60,90,120,150,180,240].map(n => `<option value="${n}" ${n === state.settings.rests[key] ? 'selected' : ''}>${n} 秒</option>`).join('')}</select></section>`).join('')}
      <section class="card safety hint">本工具不是医学定制。胸痛、明显气促、晕厥等危险症状应停止并及时就医，不继续轻练。</section>`
  }

  function render() {
    tabs.hidden = route === 'category' || route === 'workout' || route === 'record' || route === 'exercise-history'
    tabs.querySelectorAll('button').forEach(button => button.classList.toggle('active', button.dataset.route === route))
    if (route === 'today') renderToday()
    else if (route === 'category') renderCategory()
    else if (route === 'workout') renderWorkout()
    else if (route === 'records') renderRecords()
    else if (route === 'record') renderRecord()
    else if (route === 'exercise-history') renderExerciseHistory()
    else renderSettings()
  }

  tabs.addEventListener('click', event => {
    const button = event.target.closest('[data-route]')
    if (button) navigate(button.dataset.route)
  })

  app.addEventListener('submit', event => {
    event.preventDefault()
    if (event.target.id === 'category-form') startPart(event.target)
    if (event.target.id === 'metric-form') {
      const data = new FormData(event.target)
      const weight = Number(data.get('weight'))
      if (weight < 30 || weight > 400) return toast('请输入有效体重')
      const state = store.load()
      state.metrics.unshift({ id: `m-${Date.now()}`, date: engine.todayKey(), at: Date.now(), weight, waist: Number(data.get('waist')) || null })
      store.save(state); toast('身体记录已保存'); renderRecords()
    }
  })

  app.addEventListener('input', event => {
    if (route === 'workout' && event.target.dataset.field) {
      const row = event.target.closest('.set-grid')
      if (!row) return
      const state = store.load()
      state.activeSession = engine.updateActiveSet(
        state.activeSession,
        state.activeSession.partIndex,
        Number(row.dataset.exercise),
        Number(row.dataset.set),
        { [event.target.dataset.field]: event.target.value }
      )
      store.save(state)
    }
    if (event.target.classList.contains('history-edit')) {
      const data = event.target.dataset
      const state = engine.editHistorySet(
        store.load(), data.session, Number(data.part), Number(data.exercise), Number(data.set),
        { [data.field]: event.target.value, unit: 'kg' }
      )
      store.save(state)
    }
  })

  app.addEventListener('change', event => {
    if (event.target.classList.contains('config-type')) {
      const state = store.load()
      const slot = engine.getCurrentSlot(state)
      const part = slot.parts[Number(document.querySelector('#category-form').dataset.index)]
      const pattern = part.patterns.find(item => item.id === event.target.value)
      const row = event.target.closest('.config-row')
      const exercise = row.querySelector('.config-exercise')
      exercise.disabled = !pattern
      exercise.innerHTML = pattern
        ? `<option value="">请选择具体动作</option>${pattern.options.map(name => `<option value="${esc(name)}">${esc(name)}</option>`).join('')}`
        : '<option value="">先选动作类型</option>'
      row.querySelector('.config-sets').value = pattern ? pattern.suggestedSets : 3
      row.querySelector('.config-source').textContent = pattern
        ? `${pattern.role} · ${pattern.sourceTotal}`
        : '选择类型后显示原表类别说明'
      const error = document.querySelector('#category-error')
      if (error) { error.textContent = ''; error.classList.remove('show') }
    }
    if (event.target.id === 'rest-adjust' && event.target.value) {
      const state = store.load()
      state.activeSession = engine.adjustRest(state.activeSession, Number(event.target.value))
      store.save(state); renderWorkout(); toast('已从本组完成时间重新计算')
    }
    if (event.target.id === 'bp-toggle') {
      const state = store.load(); state.settings.bpUnconfirmed = event.target.checked; store.save(state)
    }
    if (event.target.id === 'display-name') {
      const state = store.load(); state.settings.displayName = event.target.value.trim() || '太岁'; store.save(state)
    }
    if (event.target.id === 'time-select') {
      const state = store.load(); state.settings.timePeriod = event.target.value
      state.settings.mealRelation = event.target.value === '下午' ? '产品映射：接近午饭后或晚饭前，请按实际安排' : `${event.target.value}训练，饭前/饭后按实际安排`
      store.save(state); renderSettings()
    }
    if (event.target.id === 'template-select') {
      const state = store.load()
      if (state.activeSession) { event.target.value = state.settings.templateId; return alert('有进行中的训练，请先恢复或保存结束。') }
      if (confirm('切换循环会从 Day1 开始，但不会清空历史。是否继续？')) {
        store.save(engine.changeTemplate(state, event.target.value)); renderSettings()
      } else event.target.value = state.settings.templateId
    }
    if (event.target.dataset.rest) {
      const state = store.load(); state.settings.rests[event.target.dataset.rest] = Number(event.target.value); store.save(state)
    }
  })

  app.addEventListener('click', event => {
    const target = event.target.closest('[data-action]')
    if (!target) return
    const action = target.dataset.action
    if (action === 'confirm-first-template') {
      const selected = document.querySelector('#first-template').value
      const state = store.load()
      const next = selected === state.settings.templateId ? state : engine.changeTemplate(state, selected)
      next.settings.templateConfirmed = true
      store.save(next)
      renderToday()
    }
    if (action === 'category') navigate('category', { index: Number(target.dataset.index) })
    if (action === 'start-training') {
      event.preventDefault()
      try {
        const form = target.closest('#category-form')
        if (!form) throw new Error('找不到动作配置表单')
        startPart(form)
      } catch (cause) {
        console.error(cause)
        const error = document.querySelector('#category-error')
        const diagnostic = document.querySelector('#start-diagnostic')
        if (error) {
          error.textContent = `无法开始训练：${cause && cause.message ? cause.message : '当前查看器阻止了按钮操作'}`
          error.classList.add('show')
        }
        if (diagnostic) diagnostic.textContent = `阶段：按钮处理失败\n异常：${cause && cause.message ? cause.message : String(cause)}`
      }
    }
    if (action === 'add-config') {
      routeData.rows = readConfigRows()
      routeData.rows.push({ patternId: '', name: '', sets: 3 })
      renderCategory()
    }
    if (action === 'remove-config') {
      routeData.rows = readConfigRows().filter((_, index) => index !== Number(target.dataset.index))
      renderCategory()
    }
    if (action === 'start-routine') startRoutine(Number(target.dataset.index))
    if (action === 'resume') navigate('workout')
    if (action === 'rest') toast('今天休息，循环位置保持不变')
    if (action === 'skip' && confirm('跳过会推进一次循环；休息不会推进。确认跳过？')) {
      store.save(engine.advance(store.load(), 'skip')); toast('已跳过当前槽位'); renderToday()
    }
    if (action === 'complete-set') completeSet(target)
    if (action === 'extend') {
      const state = store.load(); state.activeSession = engine.extendRest(state.activeSession, 30); store.save(state); renderWorkout()
    }
    if (action === 'next-exercise') nextExercise()
    if (action === 'previous-exercise') {
      const state = store.load()
      if ((state.activeSession.exerciseIndex || 0) > 0) state.activeSession.exerciseIndex -= 1
      store.save(state); renderWorkout()
    }
    if (action === 'edit-part') {
      const state = store.load()
      navigate('category', { index: state.activeSession.currentPlanPartIndex })
    }
    if (action === 'partial' && confirm('保存已完成的组并结束？循环不会推进。')) {
      store.save(engine.finishSession(store.load(), 'partial')); toast('部分完成已保存'); navigate('today')
    }
    if (action === 'record') navigate('record', { id: target.dataset.id })
    if (action === 'exercise-history') navigate('exercise-history', { name: target.dataset.name })
    if (action === 'back-records') navigate('records')
  })

  setInterval(tick, 500)
  render()
})(window)
