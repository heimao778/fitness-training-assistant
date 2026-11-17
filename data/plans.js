const pools = {
  pulldown: ['引体向上', '高位下拉', '器械下拉'],
  row: ['杠铃俯身划船', 'T杆俯身划船', '坐姿器械划船', '单边哑铃划船'],
  straightArm: ['龙门架直臂下压'],
  rear: ['哑铃俯身飞鸟', '蝴蝶机反向飞鸟', '龙门架反向飞鸟', '坐姿器械/绳索划船（水平开肘）'],
  biceps: ['哑铃弯举', '杠铃弯举', '集中弯举', '器械弯举', '牧师椅弯举'],
  chestPush: ['杠铃卧推（水平推）', '哑铃卧推（水平推）', '史密斯卧推（水平推）', '器械推胸（水平推）'],
  chestFly: ['蝴蝶机夹胸', '龙门架夹胸（水平夹）'],
  front: ['器械推举', '哑铃推举', '史密斯推举', '哑铃片前平举'],
  side: ['哑铃侧平举', '龙门架侧平举', '杠铃提拉'],
  triceps: ['龙门架直杆下压', '龙门架绳索臂屈伸', '哑铃颈后臂屈伸', '杠铃仰卧臂屈伸', '窄距卧推'],
  quads: ['杠铃深蹲', '器械腿屈伸'],
  hamstrings: ['罗马尼亚硬拉', '传统硬拉', '器械腿弯举'],
  legAssist: ['哈克机', '倒蹬机', '箭步蹲', '史密斯深蹲'],
  abs: ['平板卷腹', '悬垂举腿'],
  homeBack: ['引体向上（可用弹力带减重）', '弹力带俯身划船', '单边哑铃划船'],
  homeRear: ['哑铃俯身飞鸟', '弹力带反向飞鸟', '弹力带划船（水平开肘）'],
  homeBiceps: ['哑铃弯举', '弹力带弯举', '集中弯举'],
  homePush: ['俯卧撑', '哑铃卧推'],
  homeFly: ['弹力带夹胸（水平夹）'],
  homeFront: ['哑铃推举', '弹力带推举', '哑铃前平举', '弹力带前平举'],
  homeSide: ['哑铃侧平举', '弹力带侧平举', '哑铃提拉', '弹力带提拉'],
  homeTriceps: ['哑铃颈后臂屈伸', '弹力带颈后臂屈伸', '哑铃仰卧臂屈伸', '窄距俯卧撑'],
  homeQuads: ['哑铃箭步蹲', '高脚杯深蹲'],
  homeHamstrings: ['哑铃硬拉', '弹力带硬拉'],
  homeGlutes: ['弹力带臀桥', '弹力带髋外展']
}

function p(id, name, pool, role, total, sets, restType) {
  return { id, name, options: pools[pool], role, sourceTotal: total, suggestedSets: sets, restType }
}

const back = () => [
  p('pulldown', '下拉', 'pulldown', '主项', '类别合计 6–8 组', 3, 'compound'),
  p('row', '水平划船', 'row', '主项', '类别合计 6–8 组', 3, 'compound'),
  p('straight-arm', '直臂下压', 'straightArm', '可选补充（不等价于划船）', '原表列于划船类', 2, 'isolation')
]
const rear = () => p('rear', '肩后束', 'rear', '协同肌补练', '类别合计 6–8 组', 3, 'isolation')
const biceps = () => p('biceps', '肱二头', 'biceps', '协同肌补练', '类别合计 6–8 组', 3, 'isolation')
const chest = () => [
  p('chest-push', '中胸 · 水平推', 'chestPush', '主项', '中胸类别合计 10–12 组', 3, 'compound'),
  p('chest-fly', '中胸 · 水平夹', 'chestFly', '主项', '与水平推共享类别总组数', 3, 'isolation')
]
const front = () => p('front', '肩前束', 'front', '协同肌补练', '类别合计按所选循环', 3, 'compound')
const side = () => p('side', '肩中束', 'side', '协同肌补练', '类别合计按所选循环', 3, 'isolation')
const triceps = () => p('triceps', '肱三头', 'triceps', '协同肌补练', '类别合计按所选循环', 3, 'isolation')
const legs = hasAbs => [
  p('leg-focus', '今日腿部重点', 'quads', '主项', '类别合计 6–8 组', 3, 'leg'),
  p('leg-assist', '兼练动作', 'legAssist', '主项', '类别合计 6–8 组', 3, 'leg')
].concat(hasAbs ? [p('abs', '腹', 'abs', '补练', '类别合计 6–8 组', 3, 'isolation')] : [])

const templates = {
  gym3: {
    id: 'gym3', name: '健身房三分化', gymLegRotation: true,
    slots: [
      { id: 'day1', title: '背 · 肩后束 · 二头', parts: [{ name: '背部', patterns: back() }, { name: '肩后束', patterns: [rear()] }, { name: '二头', patterns: [biceps()] }] },
      { id: 'day2', title: '胸 · 肩前中束 · 三头', parts: [{ name: '胸部', patterns: chest() }, { name: '肩前中束', patterns: [front(), side()] }, { name: '三头', patterns: [triceps()] }] },
      { id: 'day3', title: '腿臀 · 腹', isLeg: true, parts: [{ name: '腿部重点', patterns: legs(true).slice(0, 2) }, { name: '腹', patterns: legs(true).slice(2) }] }
    ]
  },
  gym4shoulder: {
    id: 'gym4shoulder', name: '四分化 · 肩单练', gymLegRotation: true,
    slots: [
      { id: 'day1', title: '背 · 二头', parts: [{ name: '背部', patterns: back() }, { name: '二头', patterns: [biceps()] }] },
      { id: 'day2', title: '胸 · 三头', parts: [{ name: '胸部', patterns: chest() }, { name: '三头', patterns: [triceps()] }] },
      { id: 'day3', title: '腿臀 · 腹', isLeg: true, parts: [{ name: '腿部重点', patterns: legs(true).slice(0, 2) }, { name: '腹', patterns: legs(true).slice(2) }] },
      { id: 'day4', title: '肩', parts: [{ name: '肩前束', patterns: [front()] }, { name: '肩中束', patterns: [side()] }, { name: '肩后束', patterns: [rear()] }] }
    ]
  },
  gym4arms: {
    id: 'gym4arms', name: '四分化 · 手臂单练', gymLegRotation: true,
    slots: [
      { id: 'day1', title: '背 · 肩后束', parts: [{ name: '背部', patterns: back() }, { name: '肩后束', patterns: [rear()] }] },
      { id: 'day2', title: '胸 · 肩前中束', parts: [{ name: '胸部', patterns: chest() }, { name: '肩前中束', patterns: [front(), side()] }] },
      { id: 'day3', title: '腿臀', isLeg: true, parts: [{ name: '腿部重点', patterns: legs(false) }] },
      { id: 'day4', title: '大臂 · 腹', parts: [{ name: '二头', patterns: [biceps()] }, { name: '三头', patterns: [triceps()] }, { name: '腹', patterns: [p('abs', '腹', 'abs', '补练', '类别合计 6–8 组', 3, 'isolation')] }] }
    ]
  },
  home3: {
    id: 'home3', name: '居家三分化', gymLegRotation: false,
    slots: [
      { id: 'day1', title: '背 · 肩后束 · 二头', parts: [{ name: '背部', patterns: [p('home-back', '背', 'homeBack', '主项', '类别合计 6–8 组', 3, 'compound')] }, { name: '肩后束', patterns: [p('home-rear', '肩后束', 'homeRear', '补练', '类别合计 6–8 组', 3, 'isolation')] }, { name: '二头', patterns: [p('home-bi', '二头', 'homeBiceps', '补练', '类别合计 6–8 组', 3, 'isolation')] }] },
      { id: 'day2', title: '胸 · 肩前中束 · 三头', parts: [{ name: '胸部', patterns: [p('home-push', '水平推', 'homePush', '主项', '中胸类别合计 10 组', 3, 'compound'), p('home-fly', '水平夹', 'homeFly', '主项', '与水平推共享类别总组数', 3, 'isolation')] }, { name: '肩前中束', patterns: [p('home-front', '肩前束', 'homeFront', '补练', '类别合计 5 组', 3, 'compound'), p('home-side', '肩中束', 'homeSide', '补练', '类别合计 5 组', 3, 'isolation')] }, { name: '三头', patterns: [p('home-tri', '三头', 'homeTriceps', '补练', '类别合计 5 组', 3, 'isolation')] }] },
      { id: 'day3', title: '腿臀 · 腹', isLeg: true, parts: [{ name: '腿部', patterns: [p('home-quad', '股四头', 'homeQuads', '主项', '类别合计 6–8 组', 3, 'leg'), p('home-ham', '腘绳肌', 'homeHamstrings', '主项', '类别合计 6–8 组', 3, 'leg'), p('home-glute', '臀大肌', 'homeGlutes', '可选', '类别合计 6–8 组', 3, 'compound')] }, { name: '腹', patterns: [p('abs', '腹', 'abs', '补练', '类别合计 6–8 组', 3, 'isolation')] }] }
    ]
  }
}

function applyLegFocus(template, slot, legFocus) {
  const copy = JSON.parse(JSON.stringify(slot))
  if (!copy.isLeg || !template.gymLegRotation) return copy
  const pattern = copy.parts[0].patterns[0]
  pattern.options = pools[legFocus === 'hamstrings' ? 'hamstrings' : 'quads']
  pattern.name = legFocus === 'hamstrings' ? '腘绳肌重点' : '股四头重点'
  return copy
}

module.exports = { templates, pools, applyLegFocus }
