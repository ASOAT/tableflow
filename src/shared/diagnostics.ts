export type Completeness = 'complete' | 'current-page' | 'visible-only' | 'possibly-incomplete' | 'unknown';
export type WarningCode = 'PAGINATION_DETECTED' | 'VIRTUALIZATION_DETECTED' | 'ROW_COUNT_MISMATCH'
  | 'COLUMN_COUNT_MISMATCH' | 'VISIBLE_ROWS_ONLY' | 'POSSIBLY_INCOMPLETE' | 'LOW_CONFIDENCE'
  | 'CROSS_ORIGIN_FRAME' | 'CLOSED_SHADOW_ROOT' | 'FIXED_COLUMN_CLONES_REMOVED'
  | 'CONTROL_COLUMNS_IGNORED' | 'UNKNOWN_GRID_STRUCTURE' | 'LOADING' | 'EXTRACTION_FAILED'
  | 'COLLECTION_ABORTED' | 'COLLECTION_LIMIT';
export interface DiagnosticWarning {
  code: WarningCode;
  metadata?: Record<string, number | string | boolean | number[]>;
}
export interface DiagnosticEvidence {
  source: string;
  value: number | string | boolean | number[];
  confidence: number;
}
export interface ExtractionDiagnostics {
  confidence: number;
  completeness: Completeness;
  extractedRows: number;
  expectedRows?: number;
  extractedColumns: number;
  expectedColumns?: number;
  paginationDetected: boolean;
  virtualizationDetected: boolean;
  warnings: DiagnosticWarning[];
  evidence: DiagnosticEvidence[];
}

export function warningText(warning: DiagnosticWarning): string {
  const info = warning.metadata ?? {};
  switch (warning.code) {
    case 'PAGINATION_DETECTED': return `当前仅包含本页 ${info.extracted ?? ''} 行${info.total !== undefined ? `，页面显示总计约 ${info.total} 行` : ''}。`;
    case 'VIRTUALIZATION_DETECTED': return '检测到虚拟滚动，DOM 中的行或列可能只是可见部分。';
    case 'ROW_COUNT_MISMATCH': return `当前读取 ${info.extracted} 行，页面声明约 ${info.expected} 行。`;
    case 'COLUMN_COUNT_MISMATCH': return `当前读取 ${info.extracted} 列，页面声明 ${info.expected} 列；横向滚动可能隐藏其他列。`;
    case 'VISIBLE_ROWS_ONLY': return '当前结果仅包含已渲染的行；可尝试收集，或确认后导出当前数据。';
    case 'POSSIBLY_INCOMPLETE': return '当前结果可能不完整，请核对缺行、缺列和页面加载状态。';
    case 'LOW_CONFIDENCE': return '此结构的识别可信度较低，请检查预览。';
    case 'CROSS_ORIGIN_FRAME': return '存在不可读取的跨域或尚未就绪的内嵌页面，其数据未包含在结果中。';
    case 'CLOSED_SHADOW_ROOT': return '存在不暴露行结构的自定义网格，可能使用封闭 Shadow DOM，其数据未包含在结果中。';
    case 'FIXED_COLUMN_CLONES_REMOVED': return `已去除固定区域的重复列${info.count !== undefined ? `（${info.count} 列）` : ''}。`;
    case 'CONTROL_COLUMNS_IGNORED': return `已忽略 ${info.count ?? ''} 个纯选择或展开控制列。`;
    case 'UNKNOWN_GRID_STRUCTURE': return info.reason === 'unreadable-business-control'
      ? '有业务单元格仅显示选择控件，缺少可读取的文字；当前导出不会转换其勾选状态，请检查预览。'
      : '此网格结构或完整性证据不足，暂不能确认完整范围。';
    case 'LOADING': return '页面仍在加载数据，请稍后重新扫描。';
    case 'EXTRACTION_FAILED': return '结构提取失败或存在冲突，不能生成可靠导出。';
    case 'COLLECTION_ABORTED': return '收集已取消或页面已变化，当前仅保留已核实的部分数据。';
    case 'COLLECTION_LIMIT': return '收集达到时间、行数或迭代上限，当前结果可能不完整。';
  }
}
