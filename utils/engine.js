const plans = require('../data/plans')

function todayKey(now) {
  const d = now ? new Date(now) : new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function initialState() {
  return {
    version: 2,
    settings: {
      displayName: '太岁',
      templateId: 'gym3',
      templateConfirmed: false,
      timePeriod: '下午',
      mealRelation: '产品映射：接近午饭后或晚饭前，请按实际安排',
      bpUnconfirmed: true,
      rests: { compound: 120, isolation: 60, leg: 180 },
      favorites: {}
    },
    rotation: { slotIndex: 0, legFocus: 'quads', scheduledDate: null },
    activeSession: null,
    history: [],
    metrics: [],
    routines: {},
    completedSessionIds: []
  }
}

function getCurrentSlot(state) {
  const template = plans.templates[state.settings.templateId] || plans.templates.gym3
  return plans.applyLegFocus(template, template.slots[state.rotation.slotIndex], state.rotation.legFocus)
}

function advance(state, mode, now) {
  const next = JSON.parse(JSON.stringify(state))
  const template = plans.templates[next.settings.templateId]
  const slot = template.slots[next.rotation.slotIndex]
  if (mode === 'rest') return next
  if (mode !== 'complete' && mode !== 'skip') throw new Error('invalid advance mode')
  next.rotation.slotIndex = (next.rotation.slotIndex + 1) % template.slots.length
  next.rotation.scheduledDate = null
  if (mode === 'complete' && slot.isLeg && template.gymLegRotation) {
    next.rotation.legFocus = next.rotation.legFocus === 'quads' ? 'hamstrings' : 'quads'
  }
  if (mode === 'skip') {
    next.history.unshift({ id: `skip-${now || Date.now()}`, date: todayKey(now), status: 'skipped', title: slot.title, templateName: template.name })
  }
  return next
}

function createSession(state, selected, now) {
  const slot = getCurrentSlot(state)
  const parts = slot.parts.map(part => ({
    name: part.name,
    exercises: part.patterns.filter(pattern => selected[pattern.id]).map(pattern => {
      const choice = selected[pattern.id]
      const count = Math.max(1, Math.min(8, Number(choice.sets) || pattern.suggestedSets))
      return {
        patternId: pattern.id, patternName: pattern.name, name: choice.name,
        role: pattern.role, sourceTotal: pattern.sourceTotal, restType: pattern.restType,
        unit: choice.unit || 'kg',
        sets: Array.from({ length: count }, (_, i) => ({ index: i + 1, weight: '', reps: '', unit: choice.unit || 'kg', done: false }))
      }
    })
  })).filter(part => part.exercises.length)
  return {
    id: `s-${now || Date.now()}`, date: state.rotation.scheduledDate || todayKey(now), templateId: state.settings.templateId,
    slotId: slot.id, title: slot.title, parts, partIndex: 0, startedAt: now || Date.now(),
    updatedAt: now || Date.now(), rest: null, completed: false, actionLock: null,
    exerciseIndex: 0
  }
}

function updateActiveSet(session, partIndex, exerciseIndex, setIndex, values, now) {
  const copy = JSON.parse(JSON.stringify(session))
  const set = copy.parts[partIndex].exercises[exerciseIndex].sets[setIndex]
  if (!set || set.done) return copy
  if (Object.prototype.hasOwnProperty.call(values, 'weight')) set.weight = String(values.weight || '')
  if (Object.prototype.hasOwnProperty.call(values, 'reps')) set.reps = String(values.reps || '')
  if (values.unit) set.unit = values.unit
  copy.updatedAt = now || Date.now()
  return copy
}

function completeSet(session, partIndex, exerciseIndex, setIndex, values, now) {
  const copy = JSON.parse(JSON.stringify(session))
  const set = copy.parts[partIndex].exercises[exerciseIndex].sets[setIndex]
  const token = `${partIndex}-${exerciseIndex}-${setIndex}`
  if (set.done || copy.actionLock === token) return { session: copy, changed: false }
  copy.actionLock = token
  set.weight = values.weight || ''
  set.reps = values.reps || ''
  set.done = true
  set.completedAt = now || Date.now()
  const exercise = copy.parts[partIndex].exercises[exerciseIndex]
  const seconds = Number(values.restSeconds) || 60
  copy.rest = {
    startedAt: now || Date.now(),
    endsAt: (now || Date.now()) + seconds * 1000,
    durationSeconds: seconds,
    semantics: '修改最低休息时长时，从本组完成时间重新计算结束点；延长则在当前结束点上增加。'
  }
  copy.updatedAt = now || Date.now()
  copy.actionLock = null
  return { session: copy, changed: true, exercise }
}

function restRemaining(rest, now) {
  if (!rest) return 0
  return Math.max(0, Math.ceil((rest.endsAt - (now || Date.now())) / 1000))
}

function adjustRest(session, seconds, now) {
  const copy = JSON.parse(JSON.stringify(session))
  if (!copy.rest) return copy
  copy.rest.durationSeconds = seconds
  copy.rest.endsAt = copy.rest.startedAt + seconds * 1000
  copy.updatedAt = now || Date.now()
  return copy
}

function extendRest(session, seconds, now) {
  const copy = JSON.parse(JSON.stringify(session))
  if (!copy.rest) return copy
  copy.rest.endsAt += seconds * 1000
  copy.rest.durationSeconds += seconds
  copy.updatedAt = now || Date.now()
  return copy
}

function finishSession(state, status, now) {
  const next = JSON.parse(JSON.stringify(state))
  if (!next.activeSession) return next
  const session = next.activeSession
  next.completedSessionIds = next.completedSessionIds || []
  if (status === 'completed' && next.completedSessionIds.includes(session.id)) {
    next.activeSession = null
    return next
  }
  session.endedAt = now || Date.now()
  session.status = status
  session.completed = status === 'completed'
  next.history.unshift(session)
  next.activeSession = null
  if (status !== 'completed') return next
  next.completedSessionIds.push(session.id)
  return advance(next, 'complete', now)
}

function changeTemplate(state, templateId) {
  if (state.activeSession) throw new Error('ACTIVE_SESSION')
  if (!plans.templates[templateId]) throw new Error('UNKNOWN_TEMPLATE')
  const next = JSON.parse(JSON.stringify(state))
  next.settings.templateId = templateId
  next.settings.templateConfirmed = true
  next.rotation.slotIndex = 0
  next.rotation.legFocus = 'quads'
  return next
}

function routineKey(templateId, slotId, partIndex) {
  return `${templateId}:${slotId}:${partIndex}`
}

function saveRoutine(state, slotId, partIndex, choices) {
  const next = JSON.parse(JSON.stringify(state))
  next.routines = next.routines || {}
  next.routines[routineKey(next.settings.templateId, slotId, partIndex)] = JSON.parse(JSON.stringify(choices))
  return next
}

function getRoutine(state, slotId, partIndex) {
  return (state.routines || {})[routineKey(state.settings.templateId, slotId, partIndex)] || null
}

function getLastPerformance(state, exerciseName, unit) {
  const expectedUnit = unit || 'kg'
  for (const session of state.history || []) {
    for (const part of session.parts || []) {
      for (const exercise of part.exercises || []) {
        if (exercise.name !== exerciseName) continue
        const actualSets = (exercise.sets || []).filter(set => set.done && (set.unit || exercise.unit || 'kg') === expectedUnit)
        if (actualSets.length) {
          return {
            sessionId: session.id,
            date: session.date,
            unit: expectedUnit,
            sets: actualSets.map(set => ({ weight: set.weight, reps: set.reps, unit: set.unit || exercise.unit || 'kg' }))
          }
        }
      }
    }
  }
  return null
}

function editHistorySet(state, sessionId, partIndex, exerciseIndex, setIndex, values, now) {
  const next = JSON.parse(JSON.stringify(state))
  const session = next.history.find(item => item.id === sessionId)
  if (!session) throw new Error('HISTORY_NOT_FOUND')
  const exercise = session.parts[partIndex].exercises[exerciseIndex]
  const set = exercise.sets[setIndex]
  if (!set) throw new Error('SET_NOT_FOUND')
  if (Object.prototype.hasOwnProperty.call(values, 'weight')) set.weight = String(values.weight || '')
  if (Object.prototype.hasOwnProperty.call(values, 'reps')) set.reps = String(values.reps || '')
  set.unit = values.unit || set.unit || exercise.unit || 'kg'
  set.editedAt = now || Date.now()
  session.editedAt = set.editedAt
  return next
}

function listExerciseHistory(state, exerciseName, unit) {
  const expectedUnit = unit || 'kg'
  const rows = []
  for (const session of state.history || []) {
    for (const part of session.parts || []) {
      for (const exercise of part.exercises || []) {
        if (exercise.name !== exerciseName) continue
        const sets = (exercise.sets || []).filter(set => set.done && (set.unit || exercise.unit || 'kg') === expectedUnit)
        if (sets.length) rows.push({ sessionId: session.id, date: session.date, unit: expectedUnit, sets })
      }
    }
  }
  return rows
}

function exerciseSummaries(state) {
  const names = []
  for (const session of state.history || []) {
    for (const part of session.parts || []) {
      for (const exercise of part.exercises || []) {
        if ((exercise.sets || []).some(set => set.done) && !names.includes(exercise.name)) names.push(exercise.name)
      }
    }
  }
  return names.map(name => {
    const history = listExerciseHistory(state, name, 'kg')
    return { name, count: history.length, last: history[0] || null, unit: 'kg' }
  })
}

function reschedule(state, date) {
  const next = JSON.parse(JSON.stringify(state))
  next.rotation.scheduledDate = date
  if (next.activeSession) next.activeSession.date = date
  return next
}

module.exports = {
  todayKey, initialState, getCurrentSlot, advance, createSession, completeSet,
  updateActiveSet, restRemaining, adjustRest, extendRest, finishSession, changeTemplate, reschedule,
  routineKey, saveRoutine, getRoutine, getLastPerformance, editHistorySet,
  listExerciseHistory, exerciseSummaries
}
