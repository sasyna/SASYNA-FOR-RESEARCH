import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const BRAND_COLOR: [number, number, number] = [99, 102, 241];
const HEADER_BG: [number, number, number] = [30, 30, 46];
const TEXT_DARK: [number, number, number] = [15, 15, 30];
const TEXT_MID: [number, number, number] = [90, 90, 110];

type Column = { header: string; dataKey: string; width?: number };

export function exportToPdf(options: {
  title: string;
  subtitle?: string;
  columns: Column[];
  rows: Record<string, string | number>[];
  filename?: string;
}) {
  const { title, subtitle, columns, rows, filename } = options;

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
  const timeStr = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

  const addHeader = (pageNumber: number, totalPages: number) => {
    doc.setFillColor(...HEADER_BG);
    doc.rect(0, 0, pageW, 22, "F");

    doc.setFillColor(...BRAND_COLOR);
    doc.roundedRect(8, 4, 14, 14, 3, 3, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("S", 15, 12.5, { align: "center" });

    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text("Sasyna", 26, 10);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(180, 180, 200);
    doc.text("The World of Research", 26, 15.5);

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text(title, pageW / 2, 10, { align: "center" });
    if (subtitle) {
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(200, 200, 220);
      doc.text(subtitle, pageW / 2, 16, { align: "center" });
    }

    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(180, 180, 200);
    doc.text(`Generated: ${dateStr} at ${timeStr}`, pageW - 10, 10, { align: "right" });
    doc.text(`Page ${pageNumber} of ${totalPages}`, pageW - 10, 16, { align: "right" });
  };

  autoTable(doc, {
    head: [columns.map(c => c.header)],
    body: rows.map(row => columns.map(c => String(row[c.dataKey] ?? "—"))),
    startY: 27,
    margin: { left: 8, right: 8, bottom: 14 },
    columnStyles: Object.fromEntries(columns.map((c, i) => [i, { cellWidth: c.width ?? "auto" }])),
    headStyles: {
      fillColor: BRAND_COLOR,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8.5,
      cellPadding: { top: 4, bottom: 4, left: 4, right: 4 },
    },
    bodyStyles: {
      fontSize: 8,
      textColor: TEXT_DARK,
      cellPadding: { top: 3.5, bottom: 3.5, left: 4, right: 4 },
    },
    alternateRowStyles: {
      fillColor: [245, 245, 252],
    },
    tableLineColor: [220, 220, 230],
    tableLineWidth: 0.2,
    didDrawPage: (data) => {
      const pageCount = (doc as unknown as { internal: { getNumberOfPages: () => number } }).internal.getNumberOfPages();
      addHeader(data.pageNumber, pageCount);

      const fY = doc.internal.pageSize.getHeight() - 8;
      doc.setFillColor(245, 245, 252);
      doc.rect(0, fY - 3, pageW, 12, "F");
      doc.setFontSize(7);
      doc.setTextColor(...TEXT_MID);
      doc.setFont("helvetica", "normal");
      doc.text(
        `© ${now.getFullYear()} Sasyna — The World of Research  ·  ${rows.length} record${rows.length !== 1 ? "s" : ""} exported`,
        pageW / 2, fY + 2, { align: "center" }
      );
    },
  });

  doc.save(filename || `${title.toLowerCase().replace(/\s+/g, "-")}-${now.toISOString().slice(0, 10)}.pdf`);
}
