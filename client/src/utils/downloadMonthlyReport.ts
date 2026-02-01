import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

type MonthlyRow = { month: string; monthKey: string; amount: number; count: number };

export function downloadMonthlyReportPDF(
  data: MonthlyRow[],
  options?: { totalMembers?: number; overallFees?: number; monthlyFees?: number }
) {
  const doc = new jsPDF();
  const date = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

  doc.setFontSize(18);
  doc.text('Monthly Collection Report', 14, 22);
  doc.setFontSize(10);
  doc.text(`Generated on ${date}`, 14, 30);

  if (options) {
    doc.setFontSize(11);
    doc.text(`This Month: ₹${(options.monthlyFees ?? 0).toLocaleString('en-IN')}`, 14, 40);
    doc.text(`Overall: ₹${(options.overallFees ?? 0).toLocaleString('en-IN')}`, 14, 47);
    doc.text(`Total Members: ${(options.totalMembers ?? 0).toLocaleString()}`, 14, 54);
  }

  const tableData = data.map((r) => [r.month, String(r.count), `₹${r.amount.toLocaleString('en-IN')}`]);

  autoTable(doc, {
    startY: options ? 60 : 36,
    head: [['Month', 'New Members', 'Collection (₹)']],
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: [59, 130, 246] },
    styles: { fontSize: 9 },
  });

  const totalAmount = data.reduce((s, r) => s + r.amount, 0);
  const lastTable = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable;
  const finalY = (lastTable?.finalY ?? 60) + 10;
  doc.setFontSize(10);
  doc.text(`Total (12 months): ₹${totalAmount.toLocaleString('en-IN')}`, 14, finalY);

  doc.save(`monthly-collection-report-${new Date().toISOString().slice(0, 10)}.pdf`);
}
