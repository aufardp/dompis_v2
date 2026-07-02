'use client';

export type CaptureFormat = 'png' | 'jpeg' | 'jpg';

type CaptureOptions = {
  format?: CaptureFormat;
  filename: string;
  scale?: number;
};

type CellRender = {
  left: number;
  top: number;
  width: number;
  height: number;
  text: string;
  align: CanvasTextAlign;
  fontSize: number;
  fontWeight: number | string;
  fontFamily: string;
  color: string;
  backgroundColor: string;
  borderColor: string;
  paddingLeft: number;
  paddingRight: number;
  paddingTop: number;
  paddingBottom: number;
  uppercase: boolean;
  italic: boolean;
};

function normalizeFormat(format: CaptureFormat): 'png' | 'jpeg' {
  return format === 'jpg' || format === 'jpeg' ? 'jpeg' : 'png';
}

function toDownloadFileName(filename: string, format: 'png' | 'jpeg') {
  return filename.endsWith(`.${format}`) ? filename : `${filename}.${format}`;
}

function parsePx(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function resolveCssColor(property: string, value: string, fallback: string) {
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  if (/^(transparent|inherit|initial|unset|revert)$/i.test(trimmed)) {
    return trimmed;
  }

  const probe = document.createElement('span');
  probe.style.position = 'absolute';
  probe.style.left = '-9999px';
  probe.style.top = '-9999px';
  probe.style.opacity = '0';

  if (property === 'background-color') probe.style.backgroundColor = trimmed;
  else if (property === 'border-color') probe.style.borderColor = trimmed;
  else if (property === 'outline-color') probe.style.outlineColor = trimmed;
  else if (property === 'text-decoration-color') probe.style.textDecorationColor = trimmed;
  else if (property === 'caret-color') probe.style.caretColor = trimmed;
  else if (property === 'column-rule-color') probe.style.columnRuleColor = trimmed;
  else if (property === 'fill') probe.style.fill = trimmed;
  else if (property === 'stroke') probe.style.stroke = trimmed;
  else probe.style.color = trimmed;

  document.body.appendChild(probe);
  const computed = getComputedStyle(probe);
  const resolved =
    property === 'background-color'
      ? computed.backgroundColor
      : property === 'border-color'
        ? computed.borderColor
        : property === 'outline-color'
          ? computed.outlineColor
          : property === 'text-decoration-color'
            ? computed.textDecorationColor
            : property === 'caret-color'
              ? computed.caretColor
              : property === 'column-rule-color'
                ? computed.columnRuleColor
                : property === 'fill'
                  ? computed.fill
                  : property === 'stroke'
                    ? computed.stroke
                    : computed.color;
  probe.remove();
  return resolved || fallback;
}

function measureWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  fontSize: number,
) {
  const lines: string[] = [];
  const paragraphs = text.split(/\n+/g);

  for (const paragraph of paragraphs) {
    const words = paragraph.trim().split(/\s+/g).filter(Boolean);
    if (!words.length) {
      lines.push('');
      continue;
    }

    let current = words[0];
    for (let index = 1; index < words.length; index += 1) {
      const next = `${current} ${words[index]}`;
      if (ctx.measureText(next).width <= maxWidth) {
        current = next;
      } else {
        lines.push(current);
        current = words[index];
      }
    }
    lines.push(current);
  }

  const lineHeight = Math.max(12, Math.round(fontSize * 1.2));
  return { lines, lineHeight };
}

function getVisibleTable(element: HTMLElement): HTMLTableElement {
  const table = element.querySelector('table');
  if (table instanceof HTMLTableElement) return table;
  if (element instanceof HTMLTableElement) return element;
  throw new Error('Capture target table not found');
}

function collectCells(table: HTMLTableElement): CellRender[] {
  const tableRect = table.getBoundingClientRect();
  const cells: CellRender[] = [];
  const allCells = Array.from(table.querySelectorAll('th, td'));

  for (const cell of allCells) {
    const rect = cell.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    const style = getComputedStyle(cell);
    const computedText = (cell.textContent ?? '').trim();
    cells.push({
      left: rect.left - tableRect.left,
      top: rect.top - tableRect.top,
      width: rect.width,
      height: rect.height,
      text: computedText,
      align: (style.textAlign as CanvasTextAlign) || 'left',
      fontSize: parsePx(style.fontSize) || 12,
      fontWeight: style.fontWeight || '400',
      fontFamily: style.fontFamily || 'sans-serif',
      color: resolveCssColor('color', style.color, '#111827'),
      backgroundColor: resolveCssColor(
        'background-color',
        style.backgroundColor,
        '#ffffff',
      ),
      borderColor: resolveCssColor(
        'border-color',
        style.borderColor || style.borderTopColor,
        '#d1d5db',
      ),
      paddingLeft: parsePx(style.paddingLeft),
      paddingRight: parsePx(style.paddingRight),
      paddingTop: parsePx(style.paddingTop),
      paddingBottom: parsePx(style.paddingBottom),
      uppercase: style.textTransform === 'uppercase',
      italic: style.fontStyle === 'italic',
    });
  }

  return cells;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function renderTableToCanvas(
  table: HTMLTableElement,
  scale: number,
): HTMLCanvasElement {
  const rect = table.getBoundingClientRect();
  const width = Math.max(
    1,
    Math.ceil(Math.max(rect.width, table.scrollWidth, table.offsetWidth)),
  );
  const height = Math.max(
    1,
    Math.ceil(Math.max(rect.height, table.scrollHeight, table.offsetHeight)),
  );
  const exportZoom = 1.18;
  const renderScale = scale * exportZoom;

  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(width * renderScale);
  canvas.height = Math.ceil(height * renderScale);

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to create canvas context');
  }

  ctx.scale(renderScale, renderScale);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  const cells = collectCells(table);

  for (const cell of cells) {
    const isHeader = cell.text.toUpperCase() === cell.text && cell.text.length > 0;
    const bg = isHeader
      ? 'rgba(241,245,249,1)'
      : cell.backgroundColor && cell.backgroundColor !== 'rgba(0, 0, 0, 0)'
        ? cell.backgroundColor
        : '#ffffff';
    const stroke = cell.borderColor || '#d1d5db';

    ctx.fillStyle = bg;
    ctx.fillRect(cell.left, cell.top, cell.width, cell.height);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.strokeRect(cell.left + 0.5, cell.top + 0.5, cell.width - 1, cell.height - 1);

    const text = cell.uppercase ? cell.text.toUpperCase() : cell.text;
    if (!text) continue;

    const availableWidth = Math.max(
      12,
      cell.width - cell.paddingLeft - cell.paddingRight - 6,
    );
    const { lines, lineHeight } = measureWrappedText(
      ctx,
      text,
      availableWidth,
      cell.fontSize,
    );
    const totalTextHeight = lines.length * lineHeight;
    let textY = cell.top + (cell.height - totalTextHeight) / 2 + lineHeight * 0.78;
    const maxLines = Math.max(1, Math.floor((cell.height - 4) / lineHeight));
    const renderLines = lines.slice(0, maxLines);

    ctx.fillStyle = cell.color;
    ctx.font = `${cell.italic ? 'italic ' : ''}${cell.fontWeight} ${cell.fontSize}px ${cell.fontFamily}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = cell.align;

    for (const line of renderLines) {
      const x =
        cell.align === 'center'
          ? cell.left + cell.width / 2
          : cell.align === 'right'
            ? cell.left + cell.width - cell.paddingRight - 2
            : cell.left + cell.paddingLeft + 2;
      ctx.fillText(line, x, textY);
      textY += lineHeight;
    }
  }

  return canvas;
}

export async function captureElementAsImage(
  element: HTMLElement,
  options: CaptureOptions,
) {
  if (!element) {
    throw new Error('Capture target not found');
  }

  const format = normalizeFormat(options.format ?? 'png');
  const scale = options.scale ?? 2;
  const filename = toDownloadFileName(options.filename, format);
  const table = getVisibleTable(element);
  const canvas = renderTableToCanvas(table, scale);
  const dataUrl = canvas.toDataURL(
    format === 'png' ? 'image/png' : 'image/jpeg',
    format === 'png' ? undefined : 0.96,
  );

  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
}
