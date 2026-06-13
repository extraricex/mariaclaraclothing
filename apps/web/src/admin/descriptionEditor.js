const INLINE_FORMATS = {
  bold: ['**', '**', 'Bold text'],
  italic: ['_', '_', 'Italic text'],
  underline: ['<u>', '</u>', 'Underlined text'],
  link: ['[', '](https://)', 'Link text']
};

export const DESCRIPTION_FONT_STYLES = [
  { command: 'normal-style', label: 'Normal style', value: 'normal' },
  { command: 'italic', label: 'Italic', value: 'italic' },
  { command: 'underline', label: 'Underline', value: 'underline' }
];

export const DESCRIPTION_FONT_SIZES = [
  { label: 'Small', value: '13px' },
  { label: 'Normal', value: '16px' },
  { label: 'Large', value: '20px' },
  { label: 'Heading', value: '28px' }
];

export const DESCRIPTION_COLORS = [
  { label: 'Black', value: '#171411' },
  { label: 'Gray', value: '#8a7d70' },
  { label: 'Orange', value: '#e8590c' },
  { label: 'Red', value: '#b42318' },
  { label: 'Green', value: '#027a48' }
];

export const DESCRIPTION_FONT_WEIGHTS = [
  { label: 'Normal', value: '400' },
  { label: 'Medium', value: '500' },
  { label: 'Bold', value: '700' }
];

function selectedText(value, start, end, fallback) {
  return value.slice(start, end) || fallback;
}

function wrapSelection(value, start, end, prefix, suffix, fallback) {
  const text = selectedText(value, start, end, fallback);
  const nextValue = `${value.slice(0, start)}${prefix}${text}${suffix}${value.slice(end)}`;
  return {
    value: nextValue,
    selection: {
      start: start + prefix.length,
      end: start + prefix.length + text.length
    }
  };
}

function formatCurrentLine(value, start, end, formatter, selectionOffset = null) {
  const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
  const nextBreak = value.indexOf('\n', end);
  const lineEnd = nextBreak === -1 ? value.length : nextBreak;
  const line = value.slice(lineStart, lineEnd);
  const formatted = formatter(line);
  const selectionStart = selectionOffset === null ? formatted.length : selectionOffset;
  return {
    value: `${value.slice(0, lineStart)}${formatted}${value.slice(lineEnd)}`,
    selection: {
      start: lineStart + selectionStart,
      end: lineStart + formatted.length
    }
  };
}

export function applyDescriptionFormat(command, value, start, end) {
  if (INLINE_FORMATS[command]) {
    const [prefix, suffix, fallback] = INLINE_FORMATS[command];
    return wrapSelection(value, start, end, prefix, suffix, fallback);
  }

  if (command === 'heading') {
    return formatCurrentLine(value, start, end, (line) => `## ${line.replace(/^#+\s*/, '') || 'Heading'}`, 3);
  }

  if (command === 'paragraph') {
    return formatCurrentLine(value, start, end, (line) => line.replace(/^[-\d#.]+\s*/, '') || 'Paragraph text');
  }

  if (command === 'bullet') {
    return formatCurrentLine(value, start, end, (line) => `- ${line.replace(/^[-\d.]+\s*/, '') || 'List item'}`);
  }

  if (command === 'numbered') {
    return formatCurrentLine(value, start, end, (line) => `1. ${line.replace(/^[-\d.]+\s*/, '') || 'List item'}`);
  }

  return { value, selection: { start, end } };
}

export function richStyleForCommand(command, value = '') {
  if (command === 'font-size') return { fontSize: value };
  if (command === 'font-color') return { color: value };
  if (command === 'font-weight') return { fontWeight: value };
  if (command === 'italic') return { fontStyle: 'italic' };
  if (command === 'underline') return { textDecoration: 'underline' };
  if (command === 'normal-style') return { fontStyle: 'normal', textDecoration: 'none' };
  return {};
}
