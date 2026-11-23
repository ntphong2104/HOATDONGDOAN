'use client';

/**
 * Pure OpenXML (.xlsx) workbook builder with official Đoàn TNCS Hồ Chí Minh – PTIT HCM
 * administrative formatting (banner, frozen styled table header, zebra rows, borders,
 * number formatting, semantic status tones, wrapText auto-heights, summary footer,
 * signature block, and landscape A4 print setup).
 *
 * Zero external dependencies — generates valid ECMA-376 OpenXML parts packaged via PKZIP STORE.
 */

import { sanitizeSpreadsheetCell } from '@/lib/security/redirect';

export type CellTone =
  | 'default'
  | 'bold'
  | 'code'
  | 'success'
  | 'warning'
  | 'danger'
  | 'gold'
  | 'muted';

export type ColumnAlign = 'left' | 'center' | 'right';

export interface StyledColumnSpec {
  key: string;
  label?: string;
  align?: ColumnAlign;
  width?: number;
  numFmt?: 'text' | 'int' | 'rawInt' | 'float';
  tone?: CellTone;
}

export interface StyledSheetSpec {
  sheetName: string;
  reportTitle: string;
  reportSubtitle?: string;
  unitTitle?: string;
  columns?: StyledColumnSpec[];
  rows: Record<string, unknown>[];
  summaryRow?: Record<string, unknown>;
  showSignatureBlock?: boolean;
}

export interface StyledWorkbookOptions {
  filename: string;
  sheets: StyledSheetSpec[];
}

const DEFAULT_AGENCY_TOP = 'HỌC VIỆN CÔNG NGHỆ BƯU CHÍNH VIỄN THÔNG';
const DEFAULT_UNIT_TITLE = 'BCH ĐOÀN HỌC VIỆN CƠ SỞ TẠI TP. HCM';
const QUOC_HIEU = 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM';
const TIEU_NGU = 'Độc lập - Tự do - Hạnh phúc';

function colLetter(colIdx0: number): string {
  let n = colIdx0 + 1;
  let res = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    res = String.fromCharCode(65 + rem) + res;
    n = Math.floor((n - 1) / 26);
  }
  return res;
}

function cellRef(row1: number, colIdx0: number): string {
  return `${colLetter(colIdx0)}${row1}`;
}

function stripXmlControlChars(str: string): string {
  return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
}

function escapeXml(str: string): string {
  return stripXmlControlChars(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function sanitizeForExcelText(val: string): string {
  return sanitizeSpreadsheetCell(stripXmlControlChars(val));
}

function sanitizeSheetName(raw: string, usedNames: Set<string>): string {
  let cleaned = stripXmlControlChars(String(raw || 'Sheet'))
    .replace(/[\[\]:*?/\\]/g, '_')
    .trim()
    .slice(0, 31);
  if (!cleaned) cleaned = 'Sheet';

  let candidate = cleaned;
  let counter = 2;
  while (usedNames.has(candidate.toLowerCase())) {
    const suffix = `_${counter}`;
    candidate = `${cleaned.slice(0, Math.max(1, 31 - suffix.length))}${suffix}`;
    counter++;
  }
  usedNames.add(candidate.toLowerCase());
  return candidate;
}

function formatNowVN(): string {
  try {
    const d = new Date();
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Ho_Chi_Minh',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(d);
    const get = (t: string) => parts.find((p) => p.type === t)?.value || '';
    return `${get('day')}/${get('month')}/${get('year')} ${get('hour')}:${get('minute')}`;
  } catch {
    return new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 16).replace('T', ' ');
  }
}

function inferAlign(col: StyledColumnSpec, sampleValues: unknown[]): ColumnAlign {
  if (col.align) return col.align;
  const label = `${col.key} ${col.label || ''}`.toLowerCase();
  if (
    /\b(stt|hạng|rank|mssv|mã|code|lớp|khóa|cohort|ca|giới tính|ngày|thời gian|giờ|độ phủ|tỷ lệ|trạng thái|mức độ|đánh giá|phân loại|bch)\b/i.test(
      label
    )
  ) {
    return 'center';
  }
  const hasNumericSample = sampleValues.some((v) => typeof v === 'number' && Number.isFinite(v));
  if (hasNumericSample) return 'right';
  return 'left';
}

function inferNumFmtId(col: StyledColumnSpec, val: number): number {
  if (col.numFmt === 'rawInt') return 0;
  if (col.numFmt === 'int') return 3; // #,##0
  if (col.numFmt === 'float') return 4; // #,##0.00
  const label = `${col.key} ${col.label || ''}`.toLowerCase();
  if (/^(stt|hạng|rank|hang|năm)$/i.test(col.key.trim()) || /\b(stt|hạng)\b/i.test(label)) {
    return 0;
  }
  return Number.isInteger(val) ? 3 : 4;
}

function inferTone(
  col: StyledColumnSpec,
  rawVal: unknown,
  isSummary: boolean
): CellTone {
  if (isSummary) return 'bold';
  if (col.tone) return col.tone;

  const keyLower = `${col.key} ${col.label || ''}`.toLowerCase();
  if (/\b(mssv|mã số sinh viên|mã đơn vị|mã tháng|mã lcđ)\b/i.test(keyLower) || keyLower.trim() === 'code') {
    return 'code';
  }
  if (/\b(hạng|rank)\b/i.test(keyLower) && typeof rawVal === 'number') {
    if (rawVal >= 1 && rawVal <= 3) return 'gold';
  }

  const text = String(rawVal ?? '').trim();
  if (!text) return 'default';
  const lower = text.toLowerCase();

  if (lower.includes('chưa tham gia sự kiện nào') || lower === 'chưa có' || lower === '—') {
    return 'muted';
  }

  const isStatusColumn =
    /(trạng thái|status|đánh giá|mức độ|health|duyệt|kết quả|ghi nhận|bch)/i.test(keyLower);
  if (!isStatusColumn) {
    return 'default';
  }

  if (
    lower.includes('đang hoạt động') ||
    lower.includes('đã điểm danh') ||
    lower.includes('hoàn thành') ||
    lower.includes('trúng tuyển') ||
    lower.includes('hợp lệ') ||
    lower === 'tốt' ||
    lower === 'đạt' ||
    lower === 'ổn định'
  ) {
    return 'success';
  }

  if (
    lower.includes('chờ duyệt') ||
    lower.includes('chưa điểm danh') ||
    lower.includes('chưa check-out') ||
    lower.includes('chưa đánh giá') ||
    lower === 'khá' ||
    lower.includes('cần chú ý')
  ) {
    return 'warning';
  }

  if (
    lower.includes('cần đôn đốc') ||
    lower.includes('chưa có sk') ||
    lower.includes('từ chối') ||
    lower.includes('quá hạn') ||
    lower.includes('vi phạm') ||
    lower.includes('cấm mượn') ||
    lower.includes('vắng')
  ) {
    return 'danger';
  }

  if (
    lower.startsWith('🥇') ||
    lower.startsWith('🥈') ||
    lower.startsWith('🥉') ||
    lower === 'hạng 1' ||
    lower === 'hạng 2' ||
    lower === 'hạng 3'
  ) {
    return 'gold';
  }

  return 'default';
}

/* ── Dynamic Style Registry (maps directly to xl/styles.xml <cellXfs>) ── */

interface XfDef {
  numFmtId: number;
  fontId: number;
  fillId: number;
  borderId: number;
  alignH: ColumnAlign;
  alignV: 'center' | 'top' | 'bottom';
  wrapText: boolean;
}

class StyleRegistry {
  private xfs: XfDef[] = [];
  private keyToId = new Map<string, number>();

  constructor() {
    // xfId 0: Normal baseline (required by ECMA-376)
    this.register({
      numFmtId: 0,
      fontId: 0,
      fillId: 0,
      borderId: 0,
      alignH: 'left',
      alignV: 'center',
      wrapText: false,
    });
  }

  register(def: XfDef): number {
    const k = `${def.numFmtId}|${def.fontId}|${def.fillId}|${def.borderId}|${def.alignH}|${def.alignV}|${def.wrapText ? 1 : 0}`;
    const existing = this.keyToId.get(k);
    if (existing !== undefined) return existing;
    const id = this.xfs.length;
    this.xfs.push(def);
    this.keyToId.set(k, id);
    return id;
  }

  getDataStyleId(params: {
    tone: CellTone;
    align: ColumnAlign;
    zebra: boolean;
    numFmtId: number;
    isSummary: boolean;
  }): number {
    const { tone, align, zebra, numFmtId, isSummary } = params;
    let fontId = 0;
    let fillId = zebra ? 3 : 4;
    let borderId = 1;

    if (isSummary) {
      fillId = 5; // soft blue footer
      borderId = 2; // top/bottom medium navy border
      fontId = 3; // 11pt bold #1E3A8A
    } else if (tone === 'success') {
      fillId = 6;
      fontId = 8;
    } else if (tone === 'warning' || tone === 'gold') {
      fillId = 7;
      fontId = 9;
    } else if (tone === 'danger') {
      fillId = 8;
      fontId = 10;
    } else if (tone === 'bold') {
      fontId = 1;
    } else if (tone === 'code') {
      fontId = 7;
    } else if (tone === 'muted') {
      fontId = 11;
    }

    return this.register({
      numFmtId,
      fontId,
      fillId,
      borderId,
      alignH: align,
      alignV: 'center',
      wrapText: true,
    });
  }

  buildStylesXml(): string {
    // Font order inside <font>: b?, i?, u?, sz, color, name (strict ECMA-376 CT_Font sequence)
    const fontsXml = [
      // 0: Body regular 10.5pt Slate-900
      '<font><sz val="10.5"/><color rgb="FF0F172A"/><name val="Arial"/></font>',
      // 1: Bold 10.5pt Slate-900
      '<font><b/><sz val="10.5"/><color rgb="FF0F172A"/><name val="Arial"/></font>',
      // 2: Agency Top 10.5pt Navy
      '<font><sz val="10.5"/><color rgb="FF1E3A8A"/><name val="Arial"/></font>',
      // 3: Unit Title & Summary Row 11pt Bold Navy
      '<font><b/><sz val="11"/><color rgb="FF1E3A8A"/><name val="Arial"/></font>',
      // 4: Report Title 14pt Bold Navy
      '<font><b/><sz val="14"/><color rgb="FF1E3A8A"/><name val="Arial"/></font>',
      // 5: Subtitle & Signature Hint 10.5pt Italic Slate-600
      '<font><i/><sz val="10.5"/><color rgb="FF475569"/><name val="Arial"/></font>',
      // 6: Table Header 11pt Bold White
      '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Arial"/></font>',
      // 7: Code / MSSV 10pt Bold Blue-700
      '<font><b/><sz val="10"/><color rgb="FF1D4ED8"/><name val="Consolas"/></font>',
      // 8: Success 10.5pt Bold Emerald-700
      '<font><b/><sz val="10.5"/><color rgb="FF15803D"/><name val="Arial"/></font>',
      // 9: Warning / Gold 10.5pt Bold Amber-700
      '<font><b/><sz val="10.5"/><color rgb="FFB45309"/><name val="Arial"/></font>',
      // 10: Danger 10.5pt Bold Red-700
      '<font><b/><sz val="10.5"/><color rgb="FFB91C1C"/><name val="Arial"/></font>',
      // 11: Muted 10.5pt Slate-500
      '<font><sz val="10.5"/><color rgb="FF64748B"/><name val="Arial"/></font>',
      // 12: Tiêu ngữ underlined bold 10.5pt Slate-900
      '<font><b/><u/><sz val="10.5"/><color rgb="FF0F172A"/><name val="Arial"/></font>',
    ];

    // Fill 0 MUST be none, Fill 1 MUST be gray125 (ECMA-376 requirement)
    const fillsXml = [
      '<fill><patternFill patternType="none"/></fill>',
      '<fill><patternFill patternType="gray125"/></fill>',
      '<fill><patternFill patternType="solid"><fgColor rgb="FF1E3A8A"/><bgColor indexed="64"/></patternFill></fill>',
      '<fill><patternFill patternType="solid"><fgColor rgb="FFF8FAFC"/><bgColor indexed="64"/></patternFill></fill>',
      '<fill><patternFill patternType="solid"><fgColor rgb="FFFFFFFF"/><bgColor indexed="64"/></patternFill></fill>',
      '<fill><patternFill patternType="solid"><fgColor rgb="FFEFF6FF"/><bgColor indexed="64"/></patternFill></fill>',
      '<fill><patternFill patternType="solid"><fgColor rgb="FFDCFCE7"/><bgColor indexed="64"/></patternFill></fill>',
      '<fill><patternFill patternType="solid"><fgColor rgb="FFFEF3C7"/><bgColor indexed="64"/></patternFill></fill>',
      '<fill><patternFill patternType="solid"><fgColor rgb="FFFEE2E2"/><bgColor indexed="64"/></patternFill></fill>',
    ];

    // Border child order: left, right, top, bottom, diagonal
    const bordersXml = [
      '<border><left/><right/><top/><bottom/><diagonal/></border>',
      '<border>' +
        '<left style="thin"><color rgb="FFCBD5E1"/></left>' +
        '<right style="thin"><color rgb="FFCBD5E1"/></right>' +
        '<top style="thin"><color rgb="FFCBD5E1"/></top>' +
        '<bottom style="thin"><color rgb="FFCBD5E1"/></bottom>' +
        '<diagonal/>' +
      '</border>',
      '<border>' +
        '<left style="thin"><color rgb="FFCBD5E1"/></left>' +
        '<right style="thin"><color rgb="FFCBD5E1"/></right>' +
        '<top style="medium"><color rgb="FF1E3A8A"/></top>' +
        '<bottom style="medium"><color rgb="FF1E3A8A"/></bottom>' +
        '<diagonal/>' +
      '</border>',
    ];

    const cellXfsXml = this.xfs.map((xf) => {
      const attrs = [
        `numFmtId="${xf.numFmtId}"`,
        `fontId="${xf.fontId}"`,
        `fillId="${xf.fillId}"`,
        `borderId="${xf.borderId}"`,
        'xfId="0"',
        xf.fontId > 0 ? 'applyFont="1"' : '',
        xf.fillId > 0 ? 'applyFill="1"' : '',
        xf.borderId > 0 ? 'applyBorder="1"' : '',
        xf.numFmtId > 0 ? 'applyNumberFormat="1"' : '',
        'applyAlignment="1"',
      ]
        .filter(Boolean)
        .join(' ');
      return `<xf ${attrs}><alignment horizontal="${xf.alignH}" vertical="${xf.alignV}" wrapText="${xf.wrapText ? 1 : 0}"/></xf>`;
    });

    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      `<fonts count="${fontsXml.length}">${fontsXml.join('')}</fonts>` +
      `<fills count="${fillsXml.length}">${fillsXml.join('')}</fills>` +
      `<borders count="${bordersXml.length}">${bordersXml.join('')}</borders>` +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      `<cellXfs count="${cellXfsXml.length}">${cellXfsXml.join('')}</cellXfs>` +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      '</styleSheet>'
    );
  }
}

/* ── Sheet XML Builder ── */

function renderStringCell(ref: string, xfId: number, text: string): string {
  const safeText = escapeXml(sanitizeForExcelText(text));
  return `<c r="${ref}" t="inlineStr" s="${xfId}"><is><t xml:space="preserve">${safeText}</t></is></c>`;
}

function renderBannerStringCell(ref: string, xfId: number, text: string): string {
  const safeText = escapeXml(stripXmlControlChars(text));
  return `<c r="${ref}" t="inlineStr" s="${xfId}"><is><t xml:space="preserve">${safeText}</t></is></c>`;
}

function renderNumberCell(ref: string, xfId: number, num: number): string {
  return `<c r="${ref}" s="${xfId}"><v>${num}</v></c>`;
}

function estimateRowHeight(
  rowObj: Record<string, unknown>,
  columns: StyledColumnSpec[],
  widths: number[]
): number {
  let maxLines = 1;
  columns.forEach((col, cIdx) => {
    const raw = rowObj[col.key];
    if (raw === null || raw === undefined) return;
    const str = String(raw);
    if (!str) return;
    const colW = Math.max(8, (widths[cIdx] || 14) - 3);
    const lines = str.split('\n');
    let wrappedCount = 0;
    for (const line of lines) {
      wrappedCount += Math.max(1, Math.ceil(line.length / colW));
    }
    if (wrappedCount > maxLines) maxLines = wrappedCount;
  });
  if (maxLines <= 1) return 24;
  return Math.min(Math.max(24, maxLines * 16 + 8), 400);
}

function buildWorksheetXml(
  spec: StyledSheetSpec,
  sheetIdx0: number,
  styles: StyleRegistry
): string {
  // Resolve columns
  const baseRows = spec.rows || [];
  const inferredKeys =
    spec.columns && spec.columns.length > 0
      ? spec.columns.map((c) => c.key)
      : Object.keys(baseRows[0] || spec.summaryRow || { 'Thông tin': '' });

  const columns: StyledColumnSpec[] =
    spec.columns && spec.columns.length > 0
      ? spec.columns
      : inferredKeys.map((k) => ({ key: k, label: k }));

  const colCount = Math.max(1, columns.length);
  const lastCol = colLetter(colCount - 1);

  // Alignments & widths
  const alignments = columns.map((col) =>
    inferAlign(
      col,
      baseRows.map((r) => r[col.key])
    )
  );

  let widths = columns.map((col) => {
    if (typeof col.width === 'number' && col.width > 0) return col.width;
    const headerLabel = col.label || col.key;
    let maxLen = headerLabel.length + 3; // extra room for sort/filter icon
    for (const row of baseRows) {
      const valStr = row[col.key] !== null && row[col.key] !== undefined ? String(row[col.key]) : '';
      for (const line of valStr.split('\n')) {
        if (line.length > maxLen) maxLen = line.length;
      }
    }
    if (spec.summaryRow) {
      const sVal =
        spec.summaryRow[col.key] !== null && spec.summaryRow[col.key] !== undefined
          ? String(spec.summaryRow[col.key])
          : '';
      if (sVal.length > maxLen) maxLen = sVal.length;
    }
    return Math.min(Math.max(maxLen + 4, 10), 60);
  });

  // Ensure total width is wide enough so administrative banner & report title never clip
  const totalWidth = widths.reduce((sum, w) => sum + w, 0);
  const MIN_BANNER_TOTAL_WIDTH = 96;
  if (totalWidth < MIN_BANNER_TOTAL_WIDTH && totalWidth > 0) {
    const scale = MIN_BANNER_TOTAL_WIDTH / totalWidth;
    widths = widths.map((w) => Math.min(64, Math.ceil(w * scale)));
  }

  // Register administrative styles
  const xfAgencyTop = styles.register({
    numFmtId: 0,
    fontId: 2,
    fillId: 0,
    borderId: 0,
    alignH: 'center',
    alignV: 'center',
    wrapText: true,
  });
  const xfAgencyMain = styles.register({
    numFmtId: 0,
    fontId: 3,
    fillId: 0,
    borderId: 0,
    alignH: 'center',
    alignV: 'center',
    wrapText: true,
  });
  const xfQuocHieu = styles.register({
    numFmtId: 0,
    fontId: 1,
    fillId: 0,
    borderId: 0,
    alignH: 'center',
    alignV: 'center',
    wrapText: true,
  });
  const xfTieuNgu = styles.register({
    numFmtId: 0,
    fontId: 12,
    fillId: 0,
    borderId: 0,
    alignH: 'center',
    alignV: 'center',
    wrapText: true,
  });
  const xfReportTitle = styles.register({
    numFmtId: 0,
    fontId: 4,
    fillId: 0,
    borderId: 0,
    alignH: 'center',
    alignV: 'center',
    wrapText: true,
  });
  const xfReportSub = styles.register({
    numFmtId: 0,
    fontId: 5,
    fillId: 0,
    borderId: 0,
    alignH: 'center',
    alignV: 'center',
    wrapText: true,
  });
  const xfTableHeader = styles.register({
    numFmtId: 0,
    fontId: 6,
    fillId: 2,
    borderId: 1,
    alignH: 'center',
    alignV: 'center',
    wrapText: true,
  });
  const xfSignTitle = styles.register({
    numFmtId: 0,
    fontId: 1,
    fillId: 0,
    borderId: 0,
    alignH: 'center',
    alignV: 'center',
    wrapText: true,
  });
  const xfSignHint = styles.register({
    numFmtId: 0,
    fontId: 5,
    fillId: 0,
    borderId: 0,
    alignH: 'center',
    alignV: 'center',
    wrapText: true,
  });

  const merges: string[] = [];
  const addMerge = (rStart: number, cStart0: number, rEnd: number, cEnd0: number) => {
    if (rEnd > rStart || cEnd0 > cStart0) {
      merges.push(`${cellRef(rStart, cStart0)}:${cellRef(rEnd, cEnd0)}`);
    }
  };

  const rowsXml: string[] = [];
  const unitTitle = (spec.unitTitle || DEFAULT_UNIT_TITLE).trim();
  const timestampStr = formatNowVN();
  const rawSubtitle = (spec.reportSubtitle || '').trim();
  const subtitleText = rawSubtitle
    ? rawSubtitle.toLowerCase().includes('kết xuất')
      ? rawSubtitle
      : `${rawSubtitle}  •  Kết xuất lúc: ${timestampStr}`
    : `Kết xuất từ Hệ thống Hoạt Động Đoàn PTIT HCM lúc: ${timestampStr}`;

  // ── Rows 1–2: Administrative Header ──
  if (colCount >= 4) {
    const leftEnd0 = Math.floor(colCount / 2) - 1;
    const rightStart0 = leftEnd0 + 1;

    addMerge(1, 0, 1, leftEnd0);
    addMerge(1, rightStart0, 1, colCount - 1);
    addMerge(2, 0, 2, leftEnd0);
    addMerge(2, rightStart0, 2, colCount - 1);

    const row1Cells: string[] = [];
    const row2Cells: string[] = [];
    for (let c = 0; c < colCount; c++) {
      if (c === 0) {
        row1Cells.push(renderBannerStringCell(cellRef(1, c), xfAgencyTop, DEFAULT_AGENCY_TOP));
        row2Cells.push(renderBannerStringCell(cellRef(2, c), xfAgencyMain, unitTitle));
      } else if (c === rightStart0) {
        row1Cells.push(renderBannerStringCell(cellRef(1, c), xfQuocHieu, QUOC_HIEU));
        row2Cells.push(renderBannerStringCell(cellRef(2, c), xfTieuNgu, TIEU_NGU));
      } else if (c <= leftEnd0) {
        row1Cells.push(`<c r="${cellRef(1, c)}" s="${xfAgencyTop}"/>`);
        row2Cells.push(`<c r="${cellRef(2, c)}" s="${xfAgencyMain}"/>`);
      } else {
        row1Cells.push(`<c r="${cellRef(1, c)}" s="${xfQuocHieu}"/>`);
        row2Cells.push(`<c r="${cellRef(2, c)}" s="${xfTieuNgu}"/>`);
      }
    }
    rowsXml.push(`<row r="1" ht="20" customHeight="1">${row1Cells.join('')}</row>`);
    rowsXml.push(`<row r="2" ht="20" customHeight="1">${row2Cells.join('')}</row>`);
  } else {
    addMerge(1, 0, 1, colCount - 1);
    addMerge(2, 0, 2, colCount - 1);
    const r1 = [
      renderBannerStringCell('A1', xfAgencyMain, `${DEFAULT_AGENCY_TOP} — ${unitTitle}`),
      ...Array.from({ length: colCount - 1 }, (_, i) => `<c r="${cellRef(1, i + 1)}" s="${xfAgencyMain}"/>`),
    ];
    const r2 = [
      renderBannerStringCell('A2', xfQuocHieu, `${QUOC_HIEU} • ${TIEU_NGU}`),
      ...Array.from({ length: colCount - 1 }, (_, i) => `<c r="${cellRef(2, i + 1)}" s="${xfQuocHieu}"/>`),
    ];
    rowsXml.push(`<row r="1" ht="20" customHeight="1">${r1.join('')}</row>`);
    rowsXml.push(`<row r="2" ht="20" customHeight="1">${r2.join('')}</row>`);
  }

  // ── Row 3: Spacer ──
  rowsXml.push(`<row r="3" ht="8" customHeight="1"/>`);

  // ── Row 4: Report Title (14pt Bold Navy) ──
  addMerge(4, 0, 4, colCount - 1);
  const titleCells = [
    renderBannerStringCell('A4', xfReportTitle, spec.reportTitle.toUpperCase()),
    ...Array.from({ length: colCount - 1 }, (_, i) => `<c r="${cellRef(4, i + 1)}" s="${xfReportTitle}"/>`),
  ];
  rowsXml.push(`<row r="4" ht="32" customHeight="1">${titleCells.join('')}</row>`);

  // ── Row 5: Report Subtitle ──
  addMerge(5, 0, 5, colCount - 1);
  const subCells = [
    renderBannerStringCell('A5', xfReportSub, subtitleText),
    ...Array.from({ length: colCount - 1 }, (_, i) => `<c r="${cellRef(5, i + 1)}" s="${xfReportSub}"/>`),
  ];
  rowsXml.push(`<row r="5" ht="22" customHeight="1">${subCells.join('')}</row>`);

  // ── Row 6: Spacer ──
  rowsXml.push(`<row r="6" ht="8" customHeight="1"/>`);

  // ── Row 7: Table Header Row (Navy, Frozen) ──
  const headerCells = columns.map((col, cIdx) =>
    renderBannerStringCell(cellRef(7, cIdx), xfTableHeader, col.label || col.key)
  );
  rowsXml.push(`<row r="7" ht="30" customHeight="1">${headerCells.join('')}</row>`);

  // ── Data Rows (Row 8 .. ) ──
  let curRow = 8;
  const firstDataRow = 8;
  let lastDataRow = 7;

  const renderStructuredRow = (
    rowObj: Record<string, unknown>,
    rowNum1: number,
    zebra: boolean,
    isSummary: boolean
  ) => {
    const ht = isSummary ? 27 : estimateRowHeight(rowObj, columns, widths);
    const cells = columns.map((col, cIdx) => {
      const ref = cellRef(rowNum1, cIdx);
      const raw = rowObj[col.key];
      const align = alignments[cIdx];
      const tone = inferTone(col, raw, isSummary);

      if (typeof raw === 'number' && Number.isFinite(raw)) {
        const numFmtId = inferNumFmtId(col, raw);
        const xfId = styles.getDataStyleId({ tone, align, zebra, numFmtId, isSummary });
        return renderNumberCell(ref, xfId, raw);
      }

      const strVal = raw === null || raw === undefined ? '' : String(raw);
      const xfId = styles.getDataStyleId({ tone, align, zebra, numFmtId: 0, isSummary });
      return renderStringCell(ref, xfId, strVal);
    });
    rowsXml.push(`<row r="${rowNum1}" ht="${ht}" customHeight="1">${cells.join('')}</row>`);
  };

  baseRows.forEach((rowObj, idx) => {
    renderStructuredRow(rowObj, curRow, idx % 2 === 1, false);
    lastDataRow = curRow;
    curRow++;
  });

  if (spec.summaryRow) {
    renderStructuredRow(spec.summaryRow, curRow, false, true);
    curRow++;
  }

  // ── Optional Signature Block ──
  if (spec.showSignatureBlock && colCount >= 4) {
    rowsXml.push(`<row r="${curRow}" ht="14" customHeight="1"/>`);
    curRow++;

    const sigTitleRow = curRow;
    const sigHintRow = curRow + 1;
    const leftEnd0 = Math.floor(colCount / 2) - 1;
    const rightStart0 = leftEnd0 + 1;

    addMerge(sigTitleRow, 0, sigTitleRow, leftEnd0);
    addMerge(sigTitleRow, rightStart0, sigTitleRow, colCount - 1);
    addMerge(sigHintRow, 0, sigHintRow, leftEnd0);
    addMerge(sigHintRow, rightStart0, sigHintRow, colCount - 1);

    const tCells: string[] = [];
    const hCells: string[] = [];
    for (let c = 0; c < colCount; c++) {
      if (c === 0) {
        tCells.push(renderBannerStringCell(cellRef(sigTitleRow, c), xfSignTitle, 'NGƯỜI LẬP BIỂU'));
        hCells.push(renderBannerStringCell(cellRef(sigHintRow, c), xfSignHint, '(Ký, ghi rõ họ tên)'));
      } else if (c === rightStart0) {
        tCells.push(
          renderBannerStringCell(
            cellRef(sigTitleRow, c),
            xfSignTitle,
            'TM. BAN CHẤP HÀNH ĐOÀN HỌC VIỆN'
          )
        );
        hCells.push(
          renderBannerStringCell(cellRef(sigHintRow, c), xfSignHint, '(Ký tên, đóng dấu xác nhận)')
        );
      } else if (c <= leftEnd0) {
        tCells.push(`<c r="${cellRef(sigTitleRow, c)}" s="${xfSignTitle}"/>`);
        hCells.push(`<c r="${cellRef(sigHintRow, c)}" s="${xfSignHint}"/>`);
      } else {
        tCells.push(`<c r="${cellRef(sigTitleRow, c)}" s="${xfSignTitle}"/>`);
        hCells.push(`<c r="${cellRef(sigHintRow, c)}" s="${xfSignHint}"/>`);
      }
    }
    rowsXml.push(`<row r="${sigTitleRow}" ht="22" customHeight="1">${tCells.join('')}</row>`);
    rowsXml.push(`<row r="${sigHintRow}" ht="20" customHeight="1">${hCells.join('')}</row>`);
    curRow = sigHintRow + 1;
  }

  const finalRow = Math.max(7, curRow - 1);
  const colsXml = widths
    .map((w, idx) => `<col min="${idx + 1}" max="${idx + 1}" width="${w}" customWidth="1"/>`)
    .join('');

  const autoFilterXml =
    baseRows.length > 0 && lastDataRow >= firstDataRow
      ? `<autoFilter ref="A7:${lastCol}${lastDataRow}"/>`
      : '';

  const mergeCellsXml =
    merges.length > 0
      ? `<mergeCells count="${merges.length}">${merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>`
      : '';

  // Strict ECMA-376 worksheet element order:
  // sheetPr -> dimension -> sheetViews -> sheetFormatPr -> cols -> sheetData -> autoFilter -> mergeCells -> pageMargins -> pageSetup
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' +
    `<dimension ref="A1:${lastCol}${finalRow}"/>` +
    '<sheetViews>' +
    `<sheetView tabSelected="${sheetIdx0 === 0 ? 1 : 0}" workbookViewId="0">` +
    '<pane ySplit="7" topLeftCell="A8" activePane="bottomLeft" state="frozen"/>' +
    '<selection pane="bottomLeft" activeCell="A8" sqref="A8"/>' +
    '</sheetView>' +
    '</sheetViews>' +
    '<sheetFormatPr defaultRowHeight="24" customHeight="1"/>' +
    `<cols>${colsXml}</cols>` +
    `<sheetData>${rowsXml.join('')}</sheetData>` +
    autoFilterXml +
    mergeCellsXml +
    '<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.25" footer="0.25"/>' +
    '<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>' +
    '</worksheet>'
  );
}

/* ── PKZIP 2.0 STORE Packager ── */

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC32_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

interface ZipEntryInput {
  path: string;
  data: Uint8Array;
}

function createZipStore(entries: ZipEntryInput[]): Uint8Array {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  const dosTime = 0;
  const dosDate = 0x5421; // 2022-01-01 valid MS-DOS date

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.path);
    const data = entry.data;
    const sum = crc32(data);

    // Local File Header (30 bytes + nameBytes.length)
    const lfh = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(lfh.buffer);
    lv.setUint32(0, 0x04034b50, true); // signature
    lv.setUint16(4, 20, true); // version needed 2.0
    lv.setUint16(6, 0x0800, true); // UTF-8 filename flag
    lv.setUint16(8, 0, true); // compression: STORE (0)
    lv.setUint16(10, dosTime, true);
    lv.setUint16(12, dosDate, true);
    lv.setUint32(14, sum, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true); // extra len
    lfh.set(nameBytes, 30);

    localParts.push(lfh, data);

    // Central Directory Header (46 bytes + nameBytes.length)
    const cdh = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cdh.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true); // version made by
    cv.setUint16(6, 20, true); // version needed
    cv.setUint16(8, 0x0800, true); // UTF-8 flag
    cv.setUint16(10, 0, true); // STORE
    cv.setUint16(12, dosTime, true);
    cv.setUint16(14, dosDate, true);
    cv.setUint32(16, sum, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true); // extra len
    cv.setUint16(32, 0, true); // comment len
    cv.setUint16(34, 0, true); // disk number start
    cv.setUint16(36, 0, true); // internal file attrs
    cv.setUint32(38, 0, true); // external file attrs
    cv.setUint32(42, offset, true); // relative offset of local header
    cdh.set(nameBytes, 46);

    centralParts.push(cdh);
    offset += lfh.length + data.length;
  }

  const centralSize = centralParts.reduce((s, p) => s + p.length, 0);

  // End of Central Directory (22 bytes)
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  const totalBytes = offset + centralSize + eocd.length;
  const out = new Uint8Array(totalBytes);
  let pos = 0;
  for (const part of localParts) {
    out.set(part, pos);
    pos += part.length;
  }
  for (const part of centralParts) {
    out.set(part, pos);
    pos += part.length;
  }
  out.set(eocd, pos);
  return out;
}

/* ── Workbook Assembly & Download Triggers ── */

export function buildStyledWorkbookBuffer(sheets: StyledSheetSpec[]): Uint8Array {
  const safeSheets = sheets.length > 0 ? sheets : [{ sheetName: 'BaoCao', reportTitle: 'BÁO CÁO', rows: [] }];
  const styles = new StyleRegistry();
  const usedNames = new Set<string>();
  const resolvedSheetNames = safeSheets.map((s) => sanitizeSheetName(s.sheetName, usedNames));

  const worksheetXmls = safeSheets.map((s, idx) => buildWorksheetXml(s, idx, styles));
  const stylesXml = styles.buildStylesXml();

  const contentTypesXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    safeSheets
      .map(
        (_, idx) =>
          `<Override PartName="/xl/worksheets/sheet${idx + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
      )
      .join('') +
    '</Types>';

  const rootRelsXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '</Relationships>';

  const workbookXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheets>' +
    resolvedSheetNames
      .map((name, idx) => `<sheet name="${escapeXml(name)}" sheetId="${idx + 1}" r:id="rId${idx + 1}"/>`)
      .join('') +
    '</sheets>' +
    '</workbook>';

  const workbookRelsXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    safeSheets
      .map(
        (_, idx) =>
          `<Relationship Id="rId${idx + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${idx + 1}.xml"/>`
      )
      .join('') +
    `<Relationship Id="rId${safeSheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    '</Relationships>';

  const encoder = new TextEncoder();
  const entries: ZipEntryInput[] = [
    { path: '[Content_Types].xml', data: encoder.encode(contentTypesXml) },
    { path: '_rels/.rels', data: encoder.encode(rootRelsXml) },
    { path: 'xl/workbook.xml', data: encoder.encode(workbookXml) },
    { path: 'xl/_rels/workbook.xml.rels', data: encoder.encode(workbookRelsXml) },
    { path: 'xl/styles.xml', data: encoder.encode(stylesXml) },
    ...worksheetXmls.map((xml, idx) => ({
      path: `xl/worksheets/sheet${idx + 1}.xml`,
      data: encoder.encode(xml),
    })),
  ];

  return createZipStore(entries);
}

export function downloadStyledWorkbook({ filename, sheets }: StyledWorkbookOptions): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const buffer = buildStyledWorkbookBuffer(sheets);
  const finalFilename = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  const copy = new Uint8Array(buffer.byteLength);
  copy.set(buffer);
  const blob = new Blob([copy.buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = finalFilename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadStyledSheet(options: StyledSheetSpec & { filename: string }): void {
  const { filename, ...sheetSpec } = options;
  downloadStyledWorkbook({ filename, sheets: [sheetSpec] });
}
