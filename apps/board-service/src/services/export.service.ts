import sharp from 'sharp';
import { query } from '../utils/db.js';
import { logger } from '../utils/logger.js';
import { NotFoundError, BadRequestError } from '../utils/errors.js';
import { config } from '../config.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExportFormat = 'png' | 'svg' | 'pdf';

export interface ExportOptions {
  format: ExportFormat;
  width?: number;
  height?: number;
  scale?: number;
  background?: string;
  padding?: number;
}

interface ElementRow {
  id: string;
  type: string;
  properties: Record<string, unknown>;
  style: {
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    opacity?: number;
    fontSize?: number;
    fontFamily?: string;
    textAlign?: string;
    borderRadius?: number;
    dashPattern?: number[];
    arrowHead?: string;
  };
  position: {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
  };
  z_index: number;
}

// ---------------------------------------------------------------------------
// SVG builders for each element type
// ---------------------------------------------------------------------------

function buildTransform(pos: ElementRow['position']): string {
  if (pos.rotation && pos.rotation !== 0) {
    const cx = pos.x + pos.width / 2;
    const cy = pos.y + pos.height / 2;
    return ` transform="rotate(${pos.rotation}, ${cx}, ${cy})"`;
  }
  return '';
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildDashArray(pattern?: number[]): string {
  if (pattern && pattern.length > 0) {
    return ` stroke-dasharray="${pattern.join(',')}"`;
  }
  return '';
}

function elementToSvg(el: ElementRow): string {
  const { type, style, position: pos, properties } = el;
  const fill = style.fill ?? 'transparent';
  const stroke = style.stroke ?? '#000000';
  const strokeWidth = style.strokeWidth ?? 2;
  const opacity = style.opacity ?? 1;
  const transform = buildTransform(pos);
  const dash = buildDashArray(style.dashPattern);

  switch (type) {
    case 'rectangle': {
      const rx = style.borderRadius ?? 0;
      return `<rect x="${pos.x}" y="${pos.y}" width="${pos.width}" height="${pos.height}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}"${dash}${transform}/>`;
    }

    case 'ellipse': {
      const cx = pos.x + pos.width / 2;
      const cy = pos.y + pos.height / 2;
      const rx = pos.width / 2;
      const ry = pos.height / 2;
      return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}"${dash}${transform}/>`;
    }

    case 'triangle': {
      const x1 = pos.x + pos.width / 2;
      const y1 = pos.y;
      const x2 = pos.x;
      const y2 = pos.y + pos.height;
      const x3 = pos.x + pos.width;
      const y3 = pos.y + pos.height;
      return `<polygon points="${x1},${y1} ${x2},${y2} ${x3},${y3}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}"${dash}${transform}/>`;
    }

    case 'line': {
      const x1 = pos.x;
      const y1 = pos.y;
      const x2 = pos.x + pos.width;
      const y2 = pos.y + pos.height;
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}"${dash}${transform}/>`;
    }

    case 'arrow': {
      const arrowId = `arrow-${el.id}`;
      const x1 = pos.x;
      const y1 = pos.y;
      const x2 = pos.x + pos.width;
      const y2 = pos.y + pos.height;
      return `<defs><marker id="${arrowId}" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="${stroke}"/></marker></defs><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}" marker-end="url(#${arrowId})"${dash}${transform}/>`;
    }

    case 'text': {
      const text = (properties.text as string) ?? '';
      const fontSize = style.fontSize ?? 16;
      const fontFamily = style.fontFamily ?? 'Inter, sans-serif';
      const textAnchor = style.textAlign === 'center' ? 'middle' : style.textAlign === 'right' ? 'end' : 'start';
      const tx = style.textAlign === 'center' ? pos.x + pos.width / 2 : style.textAlign === 'right' ? pos.x + pos.width : pos.x;
      const ty = pos.y + fontSize;

      const lines = text.split('\n');
      const tspans = lines
        .map((line, i) => `<tspan x="${tx}" dy="${i === 0 ? 0 : fontSize * 1.2}">${escapeXml(line)}</tspan>`)
        .join('');

      return `<text x="${tx}" y="${ty}" font-size="${fontSize}" font-family="${fontFamily}" text-anchor="${textAnchor}" fill="${stroke}" opacity="${opacity}"${transform}>${tspans}</text>`;
    }

    case 'sticky_note': {
      const text = (properties.text as string) ?? '';
      const fontSize = style.fontSize ?? 14;
      const fontFamily = style.fontFamily ?? 'Inter, sans-serif';
      const shadowId = `shadow-${el.id}`;
      return `<defs><filter id="${shadowId}"><feDropShadow dx="2" dy="2" stdDeviation="3" flood-opacity="0.15"/></filter></defs><rect x="${pos.x}" y="${pos.y}" width="${pos.width}" height="${pos.height}" rx="4" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}" filter="url(#${shadowId})"${transform}/><text x="${pos.x + 8}" y="${pos.y + fontSize + 8}" font-size="${fontSize}" font-family="${fontFamily}" fill="#1e293b" opacity="${opacity}"${transform}>${escapeXml(text)}</text>`;
    }

    case 'image': {
      const href = (properties.src as string) ?? '';
      if (!href) return '';
      return `<image x="${pos.x}" y="${pos.y}" width="${pos.width}" height="${pos.height}" href="${escapeXml(href)}" preserveAspectRatio="xMidYMid meet" opacity="${opacity}"${transform}/>`;
    }

    case 'freehand': {
      const points = (properties.points as Array<{ x: number; y: number }>) ?? [];
      if (points.length < 2) return '';
      const d = points
        .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
        .join(' ');
      return `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}" stroke-linecap="round" stroke-linejoin="round"${dash}/>`;
    }

    case 'connector': {
      const calculatedPath = (properties.calculatedPath as Array<{ x: number; y: number }>) ?? [];
      const pathType = (properties.pathType as string) ?? 'straight';
      const arrowId = `connector-arrow-${el.id}`;

      let d: string;
      if (calculatedPath.length < 2) {
        d = `M ${pos.x} ${pos.y} L ${pos.x + pos.width} ${pos.y + pos.height}`;
      } else if (pathType === 'curved' && calculatedPath.length >= 4) {
        d = `M ${calculatedPath[0].x} ${calculatedPath[0].y} C ${calculatedPath[1].x} ${calculatedPath[1].y}, ${calculatedPath[2].x} ${calculatedPath[2].y}, ${calculatedPath[3].x} ${calculatedPath[3].y}`;
      } else {
        d = calculatedPath
          .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
          .join(' ');
      }

      const marker = `<defs><marker id="${arrowId}" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="${stroke}"/></marker></defs>`;
      return `${marker}<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}" marker-end="url(#${arrowId})"${dash}/>`;
    }

    case 'group':
    case 'frame': {
      const label = (properties.label as string) ?? (properties.name as string) ?? '';
      const fontSize = style.fontSize ?? 14;
      let svg = `<rect x="${pos.x}" y="${pos.y}" width="${pos.width}" height="${pos.height}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}" stroke-dasharray="${type === 'group' ? '5,5' : 'none'}" rx="4"${transform}/>`;
      if (label) {
        svg += `<text x="${pos.x + 8}" y="${pos.y - 4}" font-size="${fontSize}" font-family="Inter, sans-serif" fill="${stroke}">${escapeXml(label)}</text>`;
      }
      return svg;
    }

    default:
      return '';
  }
}

// ---------------------------------------------------------------------------
// Main export functions
// ---------------------------------------------------------------------------

function calculateBounds(elements: ElementRow[]): { minX: number; minY: number; maxX: number; maxY: number } {
  if (elements.length === 0) {
    return { minX: 0, minY: 0, maxX: 800, maxY: 600 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const el of elements) {
    const pos = el.position;
    minX = Math.min(minX, pos.x);
    minY = Math.min(minY, pos.y);
    maxX = Math.max(maxX, pos.x + pos.width);
    maxY = Math.max(maxY, pos.y + pos.height);
  }

  return { minX, minY, maxX, maxY };
}

export async function buildSvg(boardId: string, options: ExportOptions): Promise<string> {
  const result = await query<ElementRow>(
    `SELECT * FROM board_elements WHERE board_id = $1 ORDER BY z_index ASC`,
    [boardId],
  );

  if (result.rows.length === 0) {
    // Return empty board SVG
    const w = options.width ?? 800;
    const h = options.height ?? 600;
    const bg = options.background ?? '#ffffff';
    return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${bg}"/></svg>`;
  }

  const padding = options.padding ?? 40;
  const bounds = calculateBounds(result.rows);
  const contentWidth = bounds.maxX - bounds.minX + padding * 2;
  const contentHeight = bounds.maxY - bounds.minY + padding * 2;

  const scale = options.scale ?? 1;
  const viewWidth = options.width ?? contentWidth;
  const viewHeight = options.height ?? contentHeight;
  const bg = options.background ?? '#ffffff';

  const viewBox = `${bounds.minX - padding} ${bounds.minY - padding} ${contentWidth} ${contentHeight}`;

  const svgElements = result.rows.map(elementToSvg).filter(Boolean).join('\n  ');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     xmlns:xlink="http://www.w3.org/1999/xlink"
     width="${viewWidth * scale}"
     height="${viewHeight * scale}"
     viewBox="${viewBox}">
  <rect x="${bounds.minX - padding}" y="${bounds.minY - padding}" width="${contentWidth}" height="${contentHeight}" fill="${bg}"/>
  ${svgElements}
</svg>`;
}

export async function exportAsSvg(boardId: string, options: ExportOptions): Promise<Buffer> {
  await verifyBoardExists(boardId);
  const svg = await buildSvg(boardId, options);
  return Buffer.from(svg, 'utf-8');
}

export async function exportAsPng(boardId: string, options: ExportOptions): Promise<Buffer> {
  await verifyBoardExists(boardId);

  const scale = options.scale ?? 2; // Default 2x for high-res
  const svgOptions = { ...options, scale };
  const svg = await buildSvg(boardId, svgOptions);

  const width = Math.min((options.width ?? 1920) * scale, config.exportMaxWidth);
  const height = Math.min((options.height ?? 1080) * scale, config.exportMaxHeight);

  try {
    const pngBuffer = await sharp(Buffer.from(svg))
      .resize(width, height, { fit: 'inside', withoutEnlargement: false })
      .png({ quality: 90, compressionLevel: 6 })
      .toBuffer();

    logger.info('Exported board as PNG', { boardId, width, height, size: pngBuffer.length });
    return pngBuffer;
  } catch (err) {
    logger.error('PNG export failed', { boardId, message: (err as Error).message });
    throw new BadRequestError('Failed to export board as PNG. The board may contain unsupported elements.');
  }
}

export async function exportAsPdf(boardId: string, options: ExportOptions): Promise<Buffer> {
  await verifyBoardExists(boardId);

  // Build SVG first
  const svg = await buildSvg(boardId, options);

  // Convert SVG to PDF-compatible format using sharp
  // sharp can output to various formats; for PDF we render to a high-quality PNG
  // and wrap it in a minimal PDF structure
  try {
    const scale = options.scale ?? 2;
    const width = Math.min((options.width ?? 1920) * scale, config.exportMaxWidth);
    const height = Math.min((options.height ?? 1080) * scale, config.exportMaxHeight);

    const pngBuffer = await sharp(Buffer.from(svg))
      .resize(width, height, { fit: 'inside', withoutEnlargement: false })
      .png()
      .toBuffer();

    // Build a minimal PDF with the PNG image embedded
    const pdfBuffer = buildMinimalPdf(pngBuffer, width, height);

    logger.info('Exported board as PDF', { boardId, width, height, size: pdfBuffer.length });
    return pdfBuffer;
  } catch (err) {
    logger.error('PDF export failed', { boardId, message: (err as Error).message });
    throw new BadRequestError('Failed to export board as PDF.');
  }
}

// ---------------------------------------------------------------------------
// Minimal PDF builder (embeds PNG image)
// ---------------------------------------------------------------------------

function buildMinimalPdf(pngData: Buffer, width: number, height: number): Buffer {
  // Scale to 72 DPI points (PDF standard)
  const ptWidth = Math.round(width * 0.75);
  const ptHeight = Math.round(height * 0.75);

  const objects: string[] = [];
  const offsets: number[] = [];

  // Object 1: Catalog
  objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  // Object 2: Pages
  objects.push(`2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n`);

  // Object 3: Page
  objects.push(`3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${ptWidth} ${ptHeight}] /Contents 4 0 R /Resources << /XObject << /Img 5 0 R >> >> >>\nendobj\n`);

  // Object 4: Content stream
  const contentStream = `q ${ptWidth} 0 0 ${ptHeight} 0 0 cm /Img Do Q`;
  objects.push(`4 0 obj\n<< /Length ${contentStream.length} >>\nstream\n${contentStream}\nendstream\nendobj\n`);

  // Object 5: Image XObject
  const imgHeader = `5 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${pngData.length} >>\nstream\n`;
  const imgFooter = `\nendstream\nendobj\n`;

  // Build PDF
  let pdf = '%PDF-1.4\n';

  for (let i = 0; i < objects.length; i++) {
    offsets.push(pdf.length);
    pdf += objects[i];
  }

  // For image, handle binary data separately
  const pdfPart1 = Buffer.from(pdf, 'binary');
  const imgHeaderBuf = Buffer.from(imgHeader, 'binary');
  const imgFooterBuf = Buffer.from(imgFooter, 'binary');

  const imgOffset = pdfPart1.length;
  offsets.push(imgOffset);

  // Cross-reference table
  const xrefOffset = pdfPart1.length + imgHeaderBuf.length + pngData.length + imgFooterBuf.length;
  const numObjects = offsets.length + 1;

  let xref = `xref\n0 ${numObjects}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    xref += `${off.toString().padStart(10, '0')} 00000 n \n`;
  }

  xref += `trailer\n<< /Size ${numObjects} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.concat([
    pdfPart1,
    imgHeaderBuf,
    pngData,
    imgFooterBuf,
    Buffer.from(xref, 'binary'),
  ]);
}

// ---------------------------------------------------------------------------
// Main export dispatcher
// ---------------------------------------------------------------------------

export async function exportBoard(
  boardId: string,
  options: ExportOptions,
): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
  const boardResult = await query<{ title: string }>(
    `SELECT title FROM boards WHERE id = $1 AND deleted_at IS NULL`,
    [boardId],
  );
  if (boardResult.rows.length === 0) {
    throw new NotFoundError('Board not found');
  }

  const title = boardResult.rows[0].title.replace(/[^a-zA-Z0-9-_]/g, '_');

  switch (options.format) {
    case 'svg': {
      const buffer = await exportAsSvg(boardId, options);
      return { buffer, contentType: 'image/svg+xml', filename: `${title}.svg` };
    }
    case 'png': {
      const buffer = await exportAsPng(boardId, options);
      return { buffer, contentType: 'image/png', filename: `${title}.png` };
    }
    case 'pdf': {
      const buffer = await exportAsPdf(boardId, options);
      return { buffer, contentType: 'application/pdf', filename: `${title}.pdf` };
    }
    default:
      throw new BadRequestError(`Unsupported export format: ${options.format}`);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function verifyBoardExists(boardId: string): Promise<void> {
  const result = await query(
    `SELECT id FROM boards WHERE id = $1 AND deleted_at IS NULL`,
    [boardId],
  );
  if (result.rows.length === 0) {
    throw new NotFoundError('Board not found');
  }
}
