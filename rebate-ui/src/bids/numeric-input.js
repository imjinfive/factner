export function parseNumericInput(text, allowDecimal = false) {
  const value = String(text ?? '').trim();
  const pattern = allowDecimal ? /^[\d,]*(?:\.\d*)?$/ : /^[\d,]*$/;
  if (!pattern.test(value)) return null;
  const raw = value.replaceAll(',', '');
  return raw.startsWith('.') ? '0' + raw : raw;
}

export function formatNumericInput(value) {
  const raw = parseNumericInput(value, true);
  if (raw === null || raw === '') return '';
  const [integer, fraction] = raw.split('.');
  return integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (fraction === undefined ? '' : '.' + fraction);
}

export function numericCaretPosition(display, rawOffset) {
  if (rawOffset <= 0) return 0;
  let count = 0;
  for (let i = 0; i < display.length; i++) {
    if (display[i] !== ',') count++;
    if (count === rawOffset) return i + 1;
  }
  return display.length;
}

export function numericDeletionCaret(display, start, end, direction) {
  if (start !== end) return null;
  if (direction === 'backward' && display[start - 1] === ',') return start - 1;
  if (direction === 'forward' && display[start] === ',') return start + 1;
  return null;
}

export function finishNumericInput(text, allowDecimal = false) {
  const raw = parseNumericInput(text, allowDecimal);
  return raw === null ? null : raw.replace(/^0+(?=\d)/, '').replace(/\.$/, '');
}

export function numericInputEdit(text, start, end = start, allowDecimal = false, maxLength) {
  const raw = parseNumericInput(text, allowDecimal);
  if (raw === null || (maxLength > 0 && raw.length > maxLength)) return null;
  const display = formatNumericInput(raw);
  const position = offset => {
    const prefix = text.slice(0, offset ?? text.length).replace(/[,\s]/g, '');
    const implicitZero = text.trim().startsWith('.') && prefix.length > 0 ? 1 : 0;
    return numericCaretPosition(display, prefix.length + implicitZero);
  };
  return { raw, display, start: position(start), end: position(end) };
}
