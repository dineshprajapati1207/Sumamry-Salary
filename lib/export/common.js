export const REPORT_SLUG = {
  fieldSales: 'Field-Sales',
  misEntry: 'MIS-Entry',
  reclassification: 'Reclassification',
  tallyEntry: 'Tally-Entry',
  comparison: 'Comparison',
};

/** Rows as they should appear in a file: a repeated group label (e.g. Segment) is shown once. */
export function exportRows(block) {
  let prev = null;
  return block.rows.map((r) => {
    const cells = { ...r.cells };
    if (block.groupKey) {
      if (r.kind === 'data') {
        if (cells[block.groupKey] === prev) cells[block.groupKey] = '';
        else prev = cells[block.groupKey];
      } else if (r.kind === 'subtotal') {
        cells[block.groupKey] = '';
      }
    }
    return { kind: r.kind, emphasis: !!r.emphasis, cells };
  });
}

/** Flattens side-by-side panels into a plain list of tables (for Word / PDF). */
export const flatTables = (report) => report.blocks.flatMap((b) => (b.type === 'panels' ? b.panels : [b]));

/** e.g. Salary-Report_Tally-Entry_Oct-2026.xlsx  |  Salary-Report_Comparison_Quarterly_Q3-FY26-27_vs_Q2-FY26-27.pdf */
export function fileName(reportId, slug, ext) {
  const name = reportId === 'all' ? 'All-Reports' : REPORT_SLUG[reportId];
  return `Salary-Report_${name}_${slug}.${ext}`.replace(/[^A-Za-z0-9._-]+/g, '-');
}
