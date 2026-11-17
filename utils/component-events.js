function inputValue(detail) {
  if (detail && typeof detail === 'object' && Object.prototype.hasOwnProperty.call(detail, 'value')) {
    return detail.value
  }
  return detail == null ? '' : detail
}

function checkedValue(detail) {
  if (detail && typeof detail === 'object' && Object.prototype.hasOwnProperty.call(detail, 'value')) {
    return Boolean(detail.value)
  }
  return Boolean(detail)
}

module.exports = { inputValue, checkedValue }
