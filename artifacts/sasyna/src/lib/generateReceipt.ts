import jsPDF from "jspdf";
import { formatCurrency, formatDate } from "./utils";

const LOGO_URL = "/sasyna-logo.jpeg";
const SIGNATURE_URL = "/dmg-signature.jpeg";

type ReceiptOrder = {
  orderId?: string;
  id?: string;
  studentName?: string;
  studentEmail?: string;
  levelOfStudy?: string;
  department?: string;
  courseName?: string;
  serviceType?: string;
  researchTopic?: string;
  totalAmount?: number;
  depositAmount?: number;
  depositPaid?: boolean;
  balancePaid?: boolean;
  paymentOption?: string;
  createdAt?: string;
  completedAt?: string;
  status?: string;
};

function hexToRgb(hex: string): [number, number, number] {
  if (/^#[0-9A-Fa-f]{3}$/.test(hex)) {
    hex = "#" + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
  }
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [
    isNaN(r) ? 0 : r,
    isNaN(g) ? 0 : g,
    isNaN(b) ? 0 : b,
  ];
}

async function loadImageAsBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function drawOfficialStamp(
  doc: jsPDF,
  cx: number,
  cy: number,
  r: number,
  dateStr: string,
  sigBase64?: string | null
) {
  const NAVY: [number, number, number] = [10, 25, 100];
  const GOLD: [number, number, number] = [180, 130, 20];
  const LIGHT: [number, number, number] = [200, 210, 255];

  doc.setDrawColor(...GOLD);
  doc.setLineWidth(1.8);
  doc.circle(cx, cy, r + 2, "S");

  doc.setDrawColor(...NAVY);
  doc.setLineWidth(1.4);
  doc.circle(cx, cy, r, "S");

  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.5);
  doc.circle(cx, cy, r - 3, "S");

  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.3);
  doc.circle(cx, cy, r - 4.5, "S");

  const decorR = r - 1.5;
  for (let i = 0; i < 12; i++) {
    const theta = (i / 12) * 2 * Math.PI - Math.PI / 2;
    const dx = cx + decorR * Math.cos(theta);
    const dy = cy + decorR * Math.sin(theta);
    if (i % 3 === 0) {
      doc.setFillColor(...GOLD);
      doc.circle(dx, dy, 0.8, "F");
    } else {
      doc.setFillColor(...NAVY);
      doc.circle(dx, dy, 0.45, "F");
    }
  }

  const topText = "SASYNA RESEARCH PLATFORM";
  const topChars = topText.split("");
  const arcR = r - 2.5;
  const totalArc = Math.PI * 0.95;
  const startAngle = -Math.PI / 2 - totalArc / 2;
  const anglePerChar = totalArc / (topChars.length - 1);

  doc.setFontSize(4.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...NAVY);
  topChars.forEach((ch, i) => {
    const theta = startAngle + i * anglePerChar;
    const tx = cx + arcR * Math.cos(theta);
    const ty = cy + arcR * Math.sin(theta);
    const rot = theta * (180 / Math.PI) + 90;
    doc.text(ch, tx, ty, { angle: -rot });
  });

  const botText = "OFFICIAL RECEIPT";
  const botChars = botText.split("");
  const botArc = Math.PI * 0.65;
  const botStart = Math.PI / 2 - botArc / 2;
  const botAnglePerChar = botArc / (botChars.length - 1);

  doc.setFontSize(4.3);
  doc.setTextColor(...GOLD);
  botChars.forEach((ch, i) => {
    const theta = botStart + i * botAnglePerChar;
    const tx = cx + arcR * Math.cos(theta);
    const ty = cy + arcR * Math.sin(theta);
    const rot = theta * (180 / Math.PI) - 90;
    doc.text(ch, tx, ty, { angle: -rot });
  });

  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.55);
  doc.line(cx - 8.5, cy - 4, cx + 8.5, cy - 4);
  doc.line(cx - 8.5, cy + 6.5, cx + 8.5, cy + 6.5);

  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.2);
  doc.line(cx - 6.5, cy - 3.2, cx + 6.5, cy - 3.2);
  doc.line(cx - 6.5, cy + 5.7, cx + 6.5, cy + 5.7);

  if (sigBase64) {
    try {
      doc.addImage(sigBase64, "JPEG", cx - 9, cy - 3.8, 18, 6.5);
    } catch {
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...NAVY);
      doc.text("VERIFIED", cx, cy + 1, { align: "center" });
    }
  } else {
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...NAVY);
    doc.text("VERIFIED", cx, cy + 1, { align: "center" });
  }

  doc.setFontSize(4.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...NAVY);
  doc.text(dateStr, cx, cy + 5, { align: "center" });

  const starPositions = [
    { x: cx - 11, y: cy - 4 },
    { x: cx + 11, y: cy - 4 },
    { x: cx - 11, y: cy + 6.5 },
    { x: cx + 11, y: cy + 6.5 },
  ];
  starPositions.forEach((p) => {
    doc.setFillColor(...GOLD);
    doc.circle(p.x, p.y, 1.0, "F");
    doc.setFillColor(...LIGHT);
    doc.circle(p.x, p.y, 0.4, "F");
  });
}

function drawSecurityBorder(doc: jsPDF, W: number, H: number) {
  const NAVY: [number, number, number] = [10, 25, 100];
  const GOLD: [number, number, number] = [180, 130, 20];

  doc.setDrawColor(...GOLD);
  doc.setLineWidth(1.4);
  doc.roundedRect(3, 3, W - 6, H - 6, 4, 4, "S");

  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.35);
  doc.roundedRect(5.5, 5.5, W - 11, H - 11, 3, 3, "S");

  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.2);
  doc.roundedRect(4.5, 4.5, W - 9, H - 9, 3.5, 3.5, "S");
}

function drawCornerOrnament(doc: jsPDF, x: number, y: number, flipX: boolean, flipY: boolean) {
  const GOLD: [number, number, number] = [180, 130, 20];
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.55);
  const sx = flipX ? -1 : 1;
  const sy = flipY ? -1 : 1;
  doc.moveTo(x, y);
  doc.lineTo(x + sx * 7, y);
  doc.stroke();
  doc.moveTo(x, y);
  doc.lineTo(x, y + sy * 7);
  doc.stroke();
  doc.setFillColor(...GOLD);
  doc.circle(x, y, 1.1, "F");
}

export async function generateReceipt(order: ReceiptOrder) {
  const W = 210;

  const DARKNAVY = "#0a1964";
  const NAVY = "#0f2878";
  const GOLD = "#b48214";
  const LIGHTGOLD = "#f5e6c0";
  const LIGHTBLUE = "#e8ecf8";
  const MIDBLUE = "#c5ceee";

  const totalAmount = order.totalAmount || 0;
  const depositAmount = order.depositAmount || 0;
  const balance = totalAmount - depositAmount;
  const amountPaid = (order.depositPaid ? depositAmount : 0) + (order.balancePaid ? balance : 0);
  const amountDue = totalAmount - amountPaid;

  const issueDate = new Date().toLocaleDateString("en-KE", { day: "numeric", month: "long", year: "numeric" });
  const stampDate = new Date().toLocaleDateString("en-GB").replace(/\//g, ".");

  // ── Define fields early so we can measure before creating the real doc ──────
  const studentFields = [
    { label: "Full Name",      val: order.studentName  || "—" },
    { label: "Email Address",  val: order.studentEmail || "—" },
    { label: "Level of Study", val: order.levelOfStudy || "—" },
    { label: "Department",     val: order.department   || "—" },
    { label: "Programme",      val: order.courseName   || "—" },
  ];
  const orderFields = [
    { label: "Service Type",   val: order.serviceType   || "—" },
    { label: "Research Topic", val: order.researchTopic || "—" },
    { label: "Payment Mode",   val: order.paymentOption === "full" ? "Full Payment" : "Deposit + Balance" },
    { label: "Order Date",     val: order.createdAt ? formatDate(order.createdAt) : "—" },
    { label: "Completion",     val: order.completedAt  ? formatDate(order.completedAt) : "Pending" },
  ];

  // ── Measure field heights with a temp doc so we can size the page ───────────
  const measureDoc = new jsPDF({ unit: "mm", format: "a4" });
  measureDoc.setFont("helvetica", "normal");
  measureDoc.setFontSize(7);
  let studentContentH = 0;
  studentFields.forEach((f, i) => {
    const lines = measureDoc.splitTextToSize(f.val, 70) as string[];
    studentContentH += 4.5 + lines.length * 4.2 + 1.5 + (i < studentFields.length - 1 ? 2 : 0);
  });
  let orderContentH = 0;
  orderFields.forEach((f, i) => {
    const lines = measureDoc.splitTextToSize(f.val, 65) as string[];
    orderContentH += 4.5 + lines.length * 4.2 + 1.5 + (i < orderFields.length - 1 ? 2 : 0);
  });
  const studentCardH = Math.max(58, 18 + studentContentH + 4);
  const orderCardH   = Math.max(58, 18 + orderContentH   + 4);
  const maxCardH     = Math.max(studentCardH, orderCardH);

  // ── Compute exact page height needed ────────────────────────────────────────
  // Fixed layout consumes ~232 mm; variable part is maxCardH + 7mm gap.
  // Add 15 mm bottom breathing room.
  const H = Math.max(297, 232 + maxCardH + 7 + 15);

  // ── Load images ─────────────────────────────────────────────────────────────
  const [logoBase64, sigBase64] = await Promise.all([
    loadImageAsBase64(LOGO_URL),
    loadImageAsBase64(SIGNATURE_URL),
  ]);

  // ── Create the real doc at the computed size ─────────────────────────────────
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: [W, H] });

  doc.setFillColor(...hexToRgb("#f0f3fc"));
  doc.rect(0, 0, W, H, "F");

  doc.setDrawColor(...hexToRgb("#dde3f5"));
  doc.setLineWidth(0.15);
  for (let i = -H; i < W + H; i += 18) {
    doc.line(i, 0, i + H, H);
  }

  doc.setFillColor(...hexToRgb(LIGHTGOLD));
  doc.setGState(doc.GState({ opacity: 0.22 }));
  doc.circle(W, 0, 55, "F");
  doc.circle(0, H, 45, "F");
  doc.setGState(doc.GState({ opacity: 1 }));

  drawSecurityBorder(doc, W, H);
  drawCornerOrnament(doc, 8, 8, false, false);
  drawCornerOrnament(doc, W - 8, 8, true, false);
  drawCornerOrnament(doc, 8, H - 8, false, true);
  drawCornerOrnament(doc, W - 8, H - 8, true, true);

  doc.setFillColor(...hexToRgb(DARKNAVY));
  doc.rect(0, 0, W, 56, "F");
  doc.setFillColor(...hexToRgb(NAVY));
  doc.rect(0, 40, W, 16, "F");
  doc.setFillColor(...hexToRgb(GOLD));
  doc.rect(0, 55.5, W, 2, "F");

  doc.setFillColor(...hexToRgb("#0d2070"));
  doc.setGState(doc.GState({ opacity: 0.7 }));
  for (let i = 0; i < 5; i++) {
    doc.circle(W + 8 - i * 6, 4 - i * 3, 24 + i * 5, "F");
  }
  doc.setGState(doc.GState({ opacity: 1 }));

  doc.setFillColor(...hexToRgb(GOLD));
  doc.setGState(doc.GState({ opacity: 0.18 }));
  doc.circle(-8, 52, 30, "F");
  doc.setGState(doc.GState({ opacity: 1 }));

  if (logoBase64) {
    try { doc.addImage(logoBase64, "JPEG", 10, 4, 28, 28); } catch {}
  } else {
    doc.setFillColor(...hexToRgb(GOLD));
    doc.circle(20, 16, 10, "F");
    doc.setTextColor(10, 25, 100);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("S", 20, 20, { align: "center" });
  }

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text("SASYNA", 42, 18);

  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...hexToRgb(LIGHTGOLD));
  doc.text("THE WORLD OF RESEARCH", 42, 25);

  doc.setFontSize(6);
  doc.setTextColor(...hexToRgb(MIDBLUE));
  doc.text("www.sasyna.com  |  support@sasyna.com", 42, 31);

  doc.setFillColor(...hexToRgb(GOLD));
  doc.roundedRect(W - 68, 8, 56, 16, 3.5, 3.5, "F");
  doc.setDrawColor(255, 255, 230);
  doc.setLineWidth(0.35);
  doc.roundedRect(W - 67, 9, 54, 14, 2.5, 2.5, "S");
  doc.setTextColor(10, 25, 100);
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "bold");
  doc.text("OFFICIAL RECEIPT", W - 40, 18, { align: "center" });

  doc.setFontSize(7.5);
  doc.setTextColor(...hexToRgb(MIDBLUE));
  doc.setFont("helvetica", "normal");
  doc.text("Payment Receipt & Acknowledgment", 14, 47);

  const receiptNo = `RCT-${(order.orderId || order.id || "").replace(/[^A-Z0-9]/gi, "").toUpperCase()}`;
  doc.setTextColor(...hexToRgb(LIGHTGOLD));
  doc.text(`Receipt No: ${receiptNo}`, W - 14, 47, { align: "right" });

  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.3);
  doc.line(14, 41, W - 14, 41);
  doc.setFillColor(...hexToRgb(GOLD));
  for (let i = 0; i < 5; i++) {
    doc.circle(14 + i * 46, 41, 0.7, "F");
  }

  let y = 62;

  doc.setFillColor(...hexToRgb(LIGHTGOLD));
  doc.setDrawColor(...hexToRgb(GOLD));
  doc.setLineWidth(0.5);
  doc.roundedRect(14, y, W - 28, 14, 3.5, 3.5, "FD");
  doc.setFillColor(...hexToRgb(GOLD));
  doc.roundedRect(14, y, 4.5, 14, 2, 2, "F");
  doc.setTextColor(...hexToRgb(DARKNAVY));
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.text("ORDER REFERENCE:", 23, y + 6);
  doc.setFontSize(12);
  doc.setTextColor(...hexToRgb(NAVY));
  doc.text(order.orderId || order.id || "—", 78, y + 6);
  doc.setTextColor(...hexToRgb("#555555"));
  doc.setFontSize(6.5);
  doc.setFont("helvetica", "normal");
  doc.text(`Issued: ${issueDate}`, W - 18, y + 5, { align: "right" });
  doc.text(`Status: ${(order.status || "").replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}`, W - 18, y + 11, { align: "right" });

  y += 20;

  // Helper: render a labelled field with word-wrap, returns height consumed
  function renderField(
    x: number, startY: number, label: string, val: string,
    maxW: number, lineEndX: number, isLast: boolean
  ): number {
    doc.setTextColor(...hexToRgb(NAVY));
    doc.setFont("helvetica", "bold");
    doc.setFontSize(5.5);
    doc.text(label.toUpperCase(), x, startY);
    doc.setTextColor(20, 20, 60);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    const lines: string[] = doc.splitTextToSize(val, maxW);
    lines.forEach((line: string, li: number) => {
      doc.text(line, x, startY + 4.5 + li * 4.2);
    });
    const fieldH = 4.5 + lines.length * 4.2 + 1.5;
    if (!isLast) {
      doc.setDrawColor(...hexToRgb("#eef0f8"));
      doc.setLineWidth(0.18);
      doc.line(x, startY + fieldH + 0.5, lineEndX, startY + fieldH + 0.5);
    }
    return fieldH + 2;
  }

  // ── Draw student card ─────────────────────────────────────────────────────
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...hexToRgb(MIDBLUE));
  doc.setLineWidth(0.4);
  doc.roundedRect(14, y, 90, maxCardH, 3.5, 3.5, "FD");
  doc.setFillColor(...hexToRgb(DARKNAVY));
  doc.roundedRect(14, y, 90, 10, 3.5, 3.5, "F");
  doc.rect(14, y + 7, 90, 3, "F");
  doc.setFillColor(...hexToRgb(GOLD));
  doc.rect(14, y + 9.5, 90, 0.7, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.text("STUDENT DETAILS", 20, y + 7.5);

  let sfY = y + 18;
  studentFields.forEach((f, i) => {
    const h = renderField(20, sfY, f.label, f.val, 70, 97, i === studentFields.length - 1);
    sfY += h;
  });

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...hexToRgb(MIDBLUE));
  doc.setLineWidth(0.4);
  doc.roundedRect(110, y, 86, maxCardH, 3.5, 3.5, "FD");
  doc.setFillColor(...hexToRgb(NAVY));
  doc.roundedRect(110, y, 86, 10, 3.5, 3.5, "F");
  doc.rect(110, y + 7, 86, 3, "F");
  doc.setFillColor(...hexToRgb(GOLD));
  doc.rect(110, y + 9.5, 86, 0.7, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.text("ORDER DETAILS", 116, y + 7.5);

  let ofY = y + 18;
  orderFields.forEach((f, i) => {
    const h = renderField(116, ofY, f.label, f.val, 65, 190, i === orderFields.length - 1);
    ofY += h;
  });

  y += maxCardH + 7;

  doc.setFillColor(...hexToRgb(DARKNAVY));
  doc.roundedRect(14, y, W - 28, 10, 2.5, 2.5, "F");
  doc.setFillColor(...hexToRgb(GOLD));
  doc.rect(14, y + 8.5, W - 28, 1.2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("PAYMENT BREAKDOWN", 20, y + 7.5);

  const gdPos = [W - 22, W - 32, W - 42];
  gdPos.forEach(gx => {
    doc.setFillColor(...hexToRgb(GOLD));
    doc.setGState(doc.GState({ opacity: 0.5 }));
    doc.circle(gx, y + 5, 1.4, "F");
    doc.setGState(doc.GState({ opacity: 1 }));
  });

  y += 13;

  const rows = [
    { label: "Research Service Fee", sub: "Total contract amount", amount: formatCurrency(totalAmount), highlight: true },
    { label: "Deposit Amount", sub: `${totalAmount > 0 ? Math.round((depositAmount / totalAmount) * 100) : 50}% of total`, amount: formatCurrency(depositAmount), highlight: false },
    { label: "Balance Amount", sub: "Remaining after deposit", amount: formatCurrency(balance), highlight: false },
  ];

  const rowH = 9;
  rows.forEach((row, i) => {
    const rowY = y + i * rowH;
    doc.setFillColor(...hexToRgb(i % 2 === 0 ? "#f4f6fd" : "#ffffff"));
    doc.rect(14, rowY - 1, W - 28, rowH, "F");
    doc.setFillColor(...hexToRgb(row.highlight ? GOLD : NAVY));
    doc.rect(14, rowY - 1, 2.5, rowH, "F");
    doc.setTextColor(20, 20, 60);
    doc.setFontSize(8);
    doc.setFont("helvetica", row.highlight ? "bold" : "normal");
    doc.text(row.label, 21, rowY + 3.5);
    doc.setFontSize(6);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...hexToRgb(NAVY));
    doc.text(row.sub, 21, rowY + 7);
    doc.setFontSize(8.5);
    doc.setFont("helvetica", row.highlight ? "bold" : "normal");
    doc.setTextColor(...hexToRgb(row.highlight ? DARKNAVY : NAVY));
    doc.text(row.amount, W - 18, rowY + 3.5, { align: "right" });
    doc.setDrawColor(...hexToRgb(MIDBLUE));
    doc.setLineWidth(0.2);
    doc.line(14, rowY + rowH - 1, W - 14, rowY + rowH - 1);
  });

  y += rows.length * rowH + 2;

  doc.setFillColor(...hexToRgb(DARKNAVY));
  doc.roundedRect(14, y, W - 28, 14, 2.5, 2.5, "F");
  doc.setFillColor(...hexToRgb(GOLD));
  doc.roundedRect(14, y, 3.5, 14, 1.5, 1.5, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9.5);
  doc.setFont("helvetica", "bold");
  doc.text("TOTAL AMOUNT PAID", 21, y + 10);
  doc.setTextColor(...hexToRgb(LIGHTGOLD));
  doc.text(formatCurrency(amountPaid), W - 18, y + 10, { align: "right" });

  if (amountDue > 0) {
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...hexToRgb("#f5c842"));
    doc.text(`Balance due: ${formatCurrency(amountDue)}`, W - 18, y + 13.5, { align: "right" });
  }

  y += 17;

  const badges = [
    {
      label: order.depositPaid ? "✓  Deposit Paid" : "○  Deposit Pending",
      bg: order.depositPaid ? "#d4f5e4" : "#fdf3d8",
      border: order.depositPaid ? "#2d9e6b" : GOLD,
      text: order.depositPaid ? "#0d5c38" : "#7a4800",
    },
    {
      label: order.balancePaid ? "✓  Balance Paid" : "○  Balance Pending",
      bg: order.balancePaid ? "#d4f5e4" : "#fdf3d8",
      border: order.balancePaid ? "#2d9e6b" : GOLD,
      text: order.balancePaid ? "#0d5c38" : "#7a4800",
    },
  ];

  y += 2;
  badges.forEach((b, i) => {
    const bx = 14 + i * 99;
    doc.setFillColor(...hexToRgb(b.bg));
    doc.setDrawColor(...hexToRgb(b.border));
    doc.setLineWidth(0.5);
    doc.roundedRect(bx, y, 92, 10, 2.5, 2.5, "FD");
    doc.setTextColor(...hexToRgb(b.text));
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text(b.label, bx + 7, y + 7);
  });
  y += 14;

  // ── Signature + Stamp panel ───────────────────────────────────────────────
  const panelH = 50;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...hexToRgb(MIDBLUE));
  doc.setLineWidth(0.4);
  doc.roundedRect(14, y, W - 28, panelH, 3.5, 3.5, "FD");

  doc.setFillColor(...hexToRgb(GOLD));
  doc.rect(14, y, W - 28, 1.4, "F");
  doc.setFillColor(...hexToRgb(DARKNAVY));
  doc.roundedRect(14, y, 4.5, panelH, 2, 2, "F");

  doc.setTextColor(...hexToRgb(NAVY));
  doc.setFontSize(6);
  doc.setFont("helvetica", "bold");
  doc.text("AUTHORIZED SIGNATORY", 23, y + 9);

  doc.setDrawColor(...hexToRgb(GOLD));
  doc.setLineWidth(0.5);
  doc.line(23, y + 11, 88, y + 11);

  if (sigBase64) {
    try {
      doc.addImage(sigBase64, "JPEG", 21, y + 14, 68, 25);
    } catch {
      doc.setTextColor(...hexToRgb(NAVY));
      doc.setFontSize(9);
      doc.setFont("helvetica", "italic");
      doc.text("DMG", 55, y + 28);
    }
  }

  doc.setTextColor(10, 20, 80);
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "bold");
  doc.text("Sasyna Research Platform", 23, y + 41);
  doc.setFontSize(6.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...hexToRgb(NAVY));
  doc.text("Director of Research Services", 23, y + 47);

  doc.setDrawColor(...hexToRgb(MIDBLUE));
  doc.setLineWidth(0.4);
  doc.line(W / 2 + 6, y + 7, W / 2 + 6, y + panelH - 4);

  doc.setFillColor(...hexToRgb("#f8f5ff"));
  doc.roundedRect(W / 2 + 12, y + 3, 70, panelH - 6, 2.5, 2.5, "F");

  drawOfficialStamp(doc, W - 46, y + 26, 20, stampDate, sigBase64);

  // ── Decorative rule ───────────────────────────────────────────────────────
  y += panelH + 4;
  doc.setFillColor(...hexToRgb(GOLD));
  doc.rect(14, y, W - 28, 1.4, "F");
  doc.setFillColor(...hexToRgb(DARKNAVY));
  doc.rect(14, y + 2, W - 28, 0.4, "F");

  // ── Footer ────────────────────────────────────────────────────────────────
  y += 6;
  if (logoBase64) {
    try { doc.addImage(logoBase64, "JPEG", 13, y, 12, 12); } catch {}
  }
  doc.setTextColor(...hexToRgb(DARKNAVY));
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "bold");
  doc.text("Sasyna Research Platform", 28, y + 4);
  doc.setFontSize(6);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...hexToRgb(NAVY));
  doc.text("This is an official payment receipt. Please retain for your records.", 28, y + 9);
  doc.text("www.sasyna.com  |  support@sasyna.com", 28, y + 13.5);

  doc.setTextColor(...hexToRgb(GOLD));
  doc.setFontSize(5.5);
  doc.text("AUTHENTIC DOCUMENT", W - 18, y + 4, { align: "right" });
  doc.setTextColor(...hexToRgb(NAVY));
  doc.setFontSize(5);
  doc.text("Verify at www.sasyna.com/verify", W - 18, y + 9, { align: "right" });

  // ── Watermark ─────────────────────────────────────────────────────────────
  doc.saveGraphicsState();
  doc.setTextColor(...hexToRgb(NAVY));
  doc.setFontSize(65);
  doc.setFont("helvetica", "bold");
  doc.setGState(doc.GState({ opacity: 0.03 }));
  doc.text("RECEIVED", W / 2, 168, { align: "center", angle: 35 });
  doc.restoreGraphicsState();

  const filename = `Sasyna_Receipt_${(order.orderId || order.id || "order").toUpperCase()}.pdf`;
  doc.save(filename);
}
