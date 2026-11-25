import type { AssistantReport } from './assistantReport';
import { assistantReportRows } from './assistantReportCsv';

export async function createAssistantReportPdf(
  report: AssistantReport,
  currencyCode: string,
  explanation: string,
): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
  const canvas = document.createElement('canvas');
  canvas.width = 1240;
  canvas.height = 1754;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This device cannot render a PDF report.');
  const margin = 80;
  const lineHeight = 38;
  const width = canvas.width - 2 * margin;
  let y = margin;
  let page = 0;
  const reset = () => {
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#111111';
    context.font = '26px sans-serif';
    context.textBaseline = 'top';
    y = margin;
  };
  const flush = () => {
    if (page++ > 0) pdf.addPage();
    pdf.addImage(canvas, 'JPEG', 0, 0, pdf.internal.pageSize.getWidth(), pdf.internal.pageSize.getHeight());
    reset();
  };
  const writeLine = (line: string) => {
    if (y + lineHeight > canvas.height - margin) flush();
    context.fillText(line, margin, y);
    y += lineHeight;
  };
  const writeText = (text: string) => {
    for (const paragraph of text.split(/\r?\n/)) {
      let line = '';
      for (const word of paragraph.split(/\s+/).filter(Boolean)) {
        const next = line ? `${line} ${word}` : word;
        if (context.measureText(next).width <= width) {
          line = next;
          continue;
        }
        if (line) writeLine(line);
        line = '';
        for (const character of Array.from(word)) {
          if (context.measureText(line + character).width > width && line) {
            writeLine(line);
            line = '';
          }
          line += character;
        }
      }
      writeLine(line);
    }
  };
  reset();
  writeText(`MINARTH financial report: ${report.month}`);
  writeText(`Transactions and budgets: ${report.month}. Other balances are current snapshots as of ${report.asOfDate}.`);
  y += lineHeight / 2;
  for (const [section, item, value, period] of assistantReportRows(report, currencyCode, explanation)) {
    writeText([section, item, value === '' ? '' : String(value), period].filter(part => part !== '').join(' | '));
  }
  flush();
  return pdf.output('blob');
}
