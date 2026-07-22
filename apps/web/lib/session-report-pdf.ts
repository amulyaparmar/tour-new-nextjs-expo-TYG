import PDFDocument from "pdfkit";

import type { AnalysisResult, SessionDetail } from "@tour/shared";

type SessionReportInput = {
  session: SessionDetail;
  analysis: AnalysisResult;
  propertyName: string;
  organizationName: string;
  rubricName: string | null;
  analysisVersion: number;
  analysisCreatedAt: string;
  sessionUrl: string;
  audioDownloadUrl: string;
};

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 46;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const CONTENT_BOTTOM = PAGE_HEIGHT - 48;

const COLORS = {
  ink: "#172033",
  muted: "#667085",
  line: "#D9E0EA",
  soft: "#F5F7FB",
  indigo: "#4d8ae5",
  indigoDark: "#214985",
  indigoSoft: "#eef5ff",
  green: "#16855B",
  greenSoft: "#EAF8F1",
  amber: "#B76B00",
  amberSoft: "#FFF6E5",
  red: "#C83D4D",
  redSoft: "#FFF0F2",
  white: "#FFFFFF",
};

const TOUR_WORDMARK_PATH = "M55.9764 15.0621V10.2087H79.2562V15.0621H70.372V39H64.8194V15.0621H55.9764ZM99.6292 28.3884C99.6292 34.5579 94.4057 39.5758 87.9482 39.5758C81.5319 39.5758 76.2672 34.5579 76.2672 28.3884C76.2672 22.2188 81.5319 17.2009 87.9482 17.2009C94.4057 17.2009 99.6292 22.1777 99.6292 28.3884ZM94.2823 28.3884C94.2823 24.81 91.4854 21.972 87.9482 21.972C84.4521 21.972 81.6141 24.81 81.6141 28.3884C81.6141 31.9667 84.4521 34.8047 87.9482 34.8047C91.4854 34.8047 94.2823 31.9667 94.2823 28.3884ZM102.594 31.2675V17.7356H107.982V30.1981C107.982 32.8304 109.75 34.7636 112.383 34.7636C115.015 34.7636 116.825 32.9127 116.825 30.1981V17.7356H122.213V39H116.825V37.108C115.344 38.6298 113.287 39.4936 110.984 39.4936C106.007 39.4936 102.594 35.8741 102.594 31.2675ZM137.776 22.4656H135.843C133.293 22.4656 131.318 24.3165 131.318 27.5658V39H125.93V17.7356H131.277V20.0389C132.347 18.476 134.033 17.53 136.336 17.53H137.776V22.4656Z";
const TOUR_MARK_PATH = "M42.6672 22.0773C44.7765 23.184 44.8772 26.1666 42.8474 27.413L17.6136 42.9079C15.607 44.1401 13.0174 42.7482 12.938 40.3948L11.9505 11.142C11.8711 8.78865 14.3609 7.2253 16.4461 8.31934L42.6672 22.0773Z";

export async function buildSessionReportPdf(input: SessionReportInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "LETTER",
      margins: { top: 82, right: MARGIN, bottom: 48, left: MARGIN },
      bufferPages: true,
      info: {
        Title: `${plain(input.session.title)} - Session Evaluation`,
        Author: "Tour.you",
        Subject: `Grading report for ${plain(input.propertyName)}`,
      },
    });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("pageAdded", () => drawPageHeader(doc, input));

    drawPageHeader(doc, input);
    drawOverview(doc, input);
    drawRubricScorecard(doc, input.analysis, input.session.notes);
    drawCoachingReview(doc, input.analysis);
    drawFooters(doc);
    doc.end();
  });
}

function drawPageHeader(doc: PDFKit.PDFDocument, input: SessionReportInput) {
  const previousY = doc.y;
  drawTourLogo(doc, MARGIN, 20, 0.52);
  doc
    .save()
    .moveTo(MARGIN + 82, 23)
    .lineTo(MARGIN + 82, 48)
    .lineWidth(0.8)
    .strokeColor(COLORS.line)
    .stroke()
    .fillColor("#24205A")
    .font("Helvetica-Bold")
    .fontSize(13)
    .text("leasemagnets", MARGIN + 94, 29, { lineBreak: false });
  doc
    .fillColor(COLORS.muted)
    .font("Helvetica")
    .fontSize(8)
    .text(plain(input.propertyName).toUpperCase(), MARGIN + 292, 25, {
      width: CONTENT_WIDTH - 292,
      align: "right",
      lineBreak: false,
    });
  drawHeaderLink(doc, "VIEW SESSION", input.sessionUrl, MARGIN + 342, 42, 74);
  doc
    .moveTo(MARGIN + 424, 41)
    .lineTo(MARGIN + 424, 51)
    .lineWidth(0.6)
    .strokeColor(COLORS.line)
    .stroke();
  drawHeaderLink(doc, "DOWNLOAD AUDIO", input.audioDownloadUrl, MARGIN + 436, 42, 84);
  doc
    .moveTo(MARGIN, 62)
    .lineTo(PAGE_WIDTH - MARGIN, 62)
    .lineWidth(1)
    .strokeColor(COLORS.line)
    .stroke()
    .restore();
  doc.y = Math.max(previousY, 80);
}

function drawHeaderLink(
  doc: PDFKit.PDFDocument,
  label: string,
  url: string,
  x: number,
  y: number,
  width: number
) {
  doc
    .fillColor(COLORS.indigo)
    .font("Helvetica-Bold")
    .fontSize(6.5)
    .text(label, x, y, {
      width,
      align: "right",
      link: url,
      underline: true,
      lineBreak: false,
    });
}

function drawTourLogo(doc: PDFKit.PDFDocument, x: number, y: number, scale: number) {
  doc
    .save()
    .translate(x, y)
    .scale(scale)
    .path(TOUR_WORDMARK_PATH)
    .fill("#312A2A")
    .path(TOUR_MARK_PATH)
    .fill("#4D8AE5")
    .restore();
}

function drawOverview(doc: PDFKit.PDFDocument, input: SessionReportInput) {
  const { session, analysis } = input;
  const totalPossible = numberOr(analysis.totalPointsPossible, sumSectionPoints(analysis, "possible"));
  const totalEarned = numberOr(
    analysis.totalPointsEarned,
    totalPossible > 0 ? Math.round((analysis.overallScore / 100) * totalPossible) : 0
  );

  doc
    .fillColor(COLORS.indigo)
    .font("Helvetica-Bold")
    .fontSize(9)
    .text("SESSION EVALUATION", MARGIN, doc.y, { characterSpacing: 1.3 });
  doc
    .moveDown(0.4)
    .fillColor(COLORS.ink)
    .font("Helvetica-Bold")
    .fontSize(23)
    .text(plain(session.title), { width: CONTENT_WIDTH });
  doc.moveDown(0.65);

  const cardY = doc.y;
  const scoreCardWidth = 164;
  const detailX = MARGIN + scoreCardWidth + 18;
  const detailWidth = CONTENT_WIDTH - scoreCardWidth - 18;
  const scoreColor = colorForScore(analysis.overallScore);

  roundedBox(doc, MARGIN, cardY, scoreCardWidth, 138, scoreColor.soft, scoreColor.main);
  doc
    .fillColor(COLORS.muted)
    .font("Helvetica-Bold")
    .fontSize(9)
    .text("YOUR SCORE", MARGIN + 14, cardY + 15, { width: scoreCardWidth - 28 });
  doc
    .fillColor(scoreColor.main)
    .font("Helvetica-Bold")
    .fontSize(38)
    .text(`${formatScore(analysis.overallScore)}%`, MARGIN + 14, cardY + 39, {
      width: scoreCardWidth - 28,
    });
  doc
    .fillColor(COLORS.ink)
    .font("Helvetica-Bold")
    .fontSize(11)
    .text(`${formatNumber(totalEarned)}/${formatNumber(totalPossible)} points`, MARGIN + 14, cardY + 92, {
      width: scoreCardWidth - 28,
    });
  doc
    .fillColor(COLORS.muted)
    .font("Helvetica")
    .fontSize(8)
    .text(`Analysis v${input.analysisVersion} | ${formatDateOnly(input.analysisCreatedAt)}`, MARGIN + 14, cardY + 113, {
      width: scoreCardWidth - 28,
    });

  const details = [
    ["Property", input.propertyName],
    ["Company", input.organizationName],
    ["Leasing professional", session.agentName || "Not provided"],
    ["Prospect", session.prospectName || session.leads[0]?.name || "Not provided"],
    ["Session date", formatSessionDate(session.scheduledAt || session.createdAt)],
    ["Duration", formatDuration(session.duration)],
    ["Location / unit", [session.location, session.unitLabel].filter(Boolean).join(" / ") || "Not provided"],
    ["Rubric", input.rubricName || "Default rubric"],
  ] as const;
  drawDetailGrid(doc, detailX, cardY, detailWidth, details);
  doc.y = cardY + 158;

  sectionTitle(doc, "SECTIONAL SCORES");
  doc.moveDown(0.55);
  for (const section of analysis.sectionScores) {
    const y = doc.y;
    const percentage = clampScore(section.score);
    const sectionColor = colorForScore(percentage);
    doc
      .fillColor(COLORS.ink)
      .font("Helvetica-Bold")
      .fontSize(9)
      .text(plain(section.section), MARGIN, y, { width: 215, lineBreak: false });
    doc
      .fillColor(COLORS.muted)
      .font("Helvetica")
      .fontSize(8)
      .text(`${formatNumber(section.pointsEarned)}/${formatNumber(section.pointsPossible)} pts`, MARGIN + 215, y + 1, {
        width: 72,
        align: "right",
        lineBreak: false,
      });
    const barX = MARGIN + 304;
    const barWidth = 168;
    doc.roundedRect(barX, y + 1, barWidth, 8, 4).fill(COLORS.line);
    if (percentage > 0) {
      doc.roundedRect(barX, y + 1, Math.max(4, barWidth * percentage / 100), 8, 4).fill(sectionColor.main);
    }
    doc
      .fillColor(sectionColor.main)
      .font("Helvetica-Bold")
      .fontSize(9)
      .text(`${formatScore(percentage)}%`, barX + barWidth + 8, y - 1, { width: 40, align: "right" });
    doc.y = y + 22;
  }

  doc.moveDown(0.7);
  ensureSpace(doc, 95);
  sectionTitle(doc, "EXECUTIVE SUMMARY");
  doc.moveDown(0.55);
  paragraph(doc, analysis.summary || "No summary was generated for this analysis.");
  doc.moveDown(0.6);
  drawCallout(
    doc,
    "PRIMARY COACHING FOCUS",
    analysis.needsImprovement || analysis.opportunities[0] || "No coaching focus was identified.",
    COLORS.indigoSoft,
    COLORS.indigo
  );

  doc.addPage();
}

function drawRubricScorecard(
  doc: PDFKit.PDFDocument,
  analysis: AnalysisResult,
  customNotes: string | null
) {
  doc
    .fillColor(COLORS.ink)
    .font("Helvetica-Bold")
    .fontSize(19)
    .text("Rubric scorecard", MARGIN, doc.y);
  doc
    .moveDown(0.25)
    .fillColor(COLORS.muted)
    .font("Helvetica")
    .fontSize(9)
    .text("Question-level results reflect only the criteria available in the selected Tour.you rubric.");
  doc.moveDown(1.1);

  if (!analysis.sectionScores.length) {
    paragraph(doc, "No section-level grading was available for this analysis.");
    return;
  }

  analysis.sectionScores.forEach((section, sectionIndex) => {
    const sectionHeadingHeight = 44;
    ensureSpace(doc, sectionHeadingHeight + 44);
    const headingY = doc.y;
    const sectionColor = colorForScore(section.score);
    roundedBox(doc, MARGIN, headingY, CONTENT_WIDTH, sectionHeadingHeight, COLORS.indigoDark, COLORS.indigoDark);
    doc
      .fillColor(COLORS.white)
      .font("Helvetica-Bold")
      .fontSize(12)
      .text(plain(section.section).toUpperCase(), MARGIN + 14, headingY + 10, {
        width: CONTENT_WIDTH - 155,
        lineBreak: false,
      });
    doc
      .fillColor("#D8DBFF")
      .font("Helvetica")
      .fontSize(8)
      .text(`${formatNumber(section.pointsEarned)}/${formatNumber(section.pointsPossible)} points`, MARGIN + 14, headingY + 27, {
        width: CONTENT_WIDTH - 155,
        lineBreak: false,
      });
    doc
      .roundedRect(PAGE_WIDTH - MARGIN - 82, headingY + 9, 68, 26, 7)
      .fill(COLORS.white);
    doc
      .fillColor(sectionColor.main)
      .font("Helvetica-Bold")
      .fontSize(12)
      .text(`${formatScore(section.score)}%`, PAGE_WIDTH - MARGIN - 82, headingY + 16, {
        width: 68,
        align: "center",
        lineBreak: false,
      });
    doc.y = headingY + sectionHeadingHeight + 10;

    if (!section.questions?.length) {
      paragraph(doc, `This legacy analysis scored the section at ${Math.round(section.score)}%; question-level evidence is not available.`);
      doc.moveDown(1);
      return;
    }

    section.questions.forEach((question, questionIndex) => {
      drawQuestionRow(doc, question, questionIndex + 1);
    });

    if (sectionIndex < analysis.sectionScores.length - 1) doc.moveDown(0.7);
  });

  drawCustomNotes(doc, customNotes);
}

function drawCustomNotes(doc: PDFKit.PDFDocument, notes: string | null) {
  const safeNotes = plain(notes);
  const notesWidth = CONTENT_WIDTH - 28;
  const notesHeight = safeNotes
    ? doc.heightOfString(safeNotes, { width: notesWidth, lineGap: 2 })
    : 0;
  const boxHeight = safeNotes ? Math.max(125, Math.min(300, notesHeight + 48)) : 150;

  doc.moveDown(0.9);
  ensureSpace(doc, boxHeight + 46);
  sectionTitle(doc, "CUSTOM NOTES");
  doc
    .fillColor(COLORS.muted)
    .font("Helvetica")
    .fontSize(8)
    .text(
      safeNotes
        ? "Session notes added by the leasing or coaching team."
        : "Use this space for manager feedback, coaching commitments, or follow-up notes.",
      MARGIN,
      doc.y + 3,
      { width: CONTENT_WIDTH }
    );
  doc.moveDown(0.8);

  const y = doc.y;
  doc.roundedRect(MARGIN, y, CONTENT_WIDTH, boxHeight, 7).fillAndStroke(COLORS.white, COLORS.line);
  if (safeNotes) {
    doc
      .fillColor(COLORS.ink)
      .font("Helvetica")
      .fontSize(9)
      .text(safeNotes, MARGIN + 14, y + 15, {
        width: notesWidth,
        height: boxHeight - 28,
        lineGap: 2,
        ellipsis: true,
      });
  } else {
    for (let line = 1; line <= 5; line += 1) {
      const lineY = y + 20 + line * 21;
      doc
        .moveTo(MARGIN + 14, lineY)
        .lineTo(PAGE_WIDTH - MARGIN - 14, lineY)
        .lineWidth(0.6)
        .strokeColor(COLORS.line)
        .stroke();
    }
  }
  doc.y = y + boxHeight;
}

function drawQuestionRow(
  doc: PDFKit.PDFDocument,
  question: AnalysisResult["sectionScores"][number]["questions"][number],
  index: number
) {
  const questionText = `${index}. ${plain(question.question)}`;
  const evidenceText = plain(question.evidence || "No supporting evidence was captured.");
  const textWidth = CONTENT_WIDTH - 128;
  const questionHeight = doc.heightOfString(questionText, { width: textWidth, lineGap: 1 });
  const evidenceHeight = doc.heightOfString(evidenceText, { width: textWidth, lineGap: 1 });
  const rowHeight = Math.max(58, 17 + questionHeight + 7 + evidenceHeight + 13);

  ensureSpace(doc, Math.min(rowHeight, CONTENT_BOTTOM - 82));
  const y = doc.y;
  const statusColor = question.passed
    ? { main: COLORS.green, soft: COLORS.greenSoft, label: "MET" }
    : { main: COLORS.red, soft: COLORS.redSoft, label: "NOT MET" };

  doc.roundedRect(MARGIN, y, CONTENT_WIDTH, rowHeight, 7).fillAndStroke(COLORS.white, COLORS.line);
  doc
    .fillColor(COLORS.ink)
    .font("Helvetica-Bold")
    .fontSize(9)
    .text(questionText, MARGIN + 13, y + 12, { width: textWidth, lineGap: 1 });
  const evidenceY = y + 15 + questionHeight + 6;
  doc
    .fillColor(COLORS.muted)
    .font("Helvetica-Oblique")
    .fontSize(7.7)
    .text(`Evidence: ${evidenceText}`, MARGIN + 13, evidenceY, { width: textWidth, lineGap: 1 });

  const statusX = PAGE_WIDTH - MARGIN - 102;
  doc.roundedRect(statusX, y + 11, 88, 21, 6).fill(statusColor.soft);
  doc
    .fillColor(statusColor.main)
    .font("Helvetica-Bold")
    .fontSize(8)
    .text(statusColor.label, statusX, y + 18, { width: 88, align: "center", lineBreak: false });
  doc
    .fillColor(COLORS.ink)
    .font("Helvetica-Bold")
    .fontSize(9)
    .text(`${formatNumber(question.earnedPoints)}/${formatNumber(question.maxPoints)}`, statusX, y + 39, {
      width: 88,
      align: "center",
      lineBreak: false,
    });
  doc.y = y + rowHeight + 7;
}

function drawCoachingReview(doc: PDFKit.PDFDocument, analysis: AnalysisResult) {
  doc.addPage();
  doc
    .fillColor(COLORS.ink)
    .font("Helvetica-Bold")
    .fontSize(19)
    .text("Coaching review", MARGIN, doc.y);
  doc
    .moveDown(0.25)
    .fillColor(COLORS.muted)
    .font("Helvetica")
    .fontSize(9)
    .text("Use the transcript evidence below to reinforce strengths and practice the next best response.");
  doc.moveDown(1.1);

  drawListSection(doc, "STRENGTHS", analysis.strengths, COLORS.greenSoft, COLORS.green);
  doc.moveDown(0.8);
  drawListSection(doc, "OPPORTUNITIES TO IMPROVE", analysis.opportunities, COLORS.amberSoft, COLORS.amber);
  doc.moveDown(0.8);
  drawCallout(
    doc,
    "SUGGESTED REWRITE",
    analysis.suggestedRewrite || "No suggested rewrite was generated.",
    COLORS.indigoSoft,
    COLORS.indigo
  );

  if (analysis.fairHousingFlags?.length) {
    doc.moveDown(0.8);
    drawListSection(doc, "FAIR HOUSING REVIEW", analysis.fairHousingFlags, COLORS.redSoft, COLORS.red);
  }

  if (analysis.exactMoments.length) {
    doc.moveDown(1.2);
    ensureSpace(doc, 55);
    sectionTitle(doc, "EXACT COACHING MOMENTS");
    doc.moveDown(0.6);
    analysis.exactMoments.forEach((moment, index) => {
      drawMoment(doc, moment, index + 1);
    });
  }

  doc.moveDown(1.2);
  ensureSpace(doc, 68);
  doc
    .fillColor(COLORS.muted)
    .font("Helvetica-Oblique")
    .fontSize(7.5)
    .text(
      "This report is generated from the selected rubric and recorded-session analysis. Managers should review transcript evidence before using results for formal performance decisions.",
      MARGIN,
      doc.y,
      { width: CONTENT_WIDTH, align: "center", lineGap: 1 }
    );
}

function drawMoment(
  doc: PDFKit.PDFDocument,
  moment: AnalysisResult["exactMoments"][number],
  index: number
) {
  const quote = plain(moment.transcriptQuote || "No quote captured.");
  const explanation = plain(moment.explanation || "No explanation captured.");
  const improvement = plain(moment.suggestedImprovement || "No suggested improvement captured.");
  const width = CONTENT_WIDTH - 28;
  const contentHeight =
    doc.heightOfString(quote, { width, lineGap: 1 }) +
    doc.heightOfString(explanation, { width, lineGap: 1 }) +
    doc.heightOfString(improvement, { width, lineGap: 1 }) + 62;
  const height = Math.max(92, contentHeight);
  ensureSpace(doc, Math.min(height, CONTENT_BOTTOM - 82));
  const y = doc.y;

  doc.roundedRect(MARGIN, y, CONTENT_WIDTH, height, 7).fillAndStroke(COLORS.soft, COLORS.line);
  doc
    .fillColor(COLORS.indigo)
    .font("Helvetica-Bold")
    .fontSize(8)
    .text(`MOMENT ${index}  |  ${plain(moment.timestamp || "--:--")}`, MARGIN + 14, y + 12, {
      width,
      characterSpacing: 0.5,
    });
  doc
    .fillColor(COLORS.ink)
    .font("Helvetica-Oblique")
    .fontSize(8.5)
    .text(`"${quote}"`, MARGIN + 14, doc.y + 6, { width, lineGap: 1 });
  doc
    .fillColor(COLORS.muted)
    .font("Helvetica")
    .fontSize(8)
    .text(explanation, MARGIN + 14, doc.y + 7, { width, lineGap: 1 });
  doc
    .fillColor(COLORS.indigoDark)
    .font("Helvetica-Bold")
    .fontSize(8)
    .text(`Try instead: ${improvement}`, MARGIN + 14, doc.y + 7, { width, lineGap: 1 });
  doc.y = y + height + 8;
}

function drawListSection(
  doc: PDFKit.PDFDocument,
  title: string,
  items: string[],
  fill: string,
  accent: string
) {
  const safeItems = items.length ? items : ["No items were identified."];
  const itemHeights = safeItems.map((item) => doc.heightOfString(plain(item), { width: CONTENT_WIDTH - 50, lineGap: 1 }));
  const height = 38 + itemHeights.reduce((sum, value) => sum + Math.max(15, value + 7), 0);
  ensureSpace(doc, Math.min(height, CONTENT_BOTTOM - 82));
  const y = doc.y;
  doc.roundedRect(MARGIN, y, CONTENT_WIDTH, height, 7).fill(fill);
  doc
    .fillColor(accent)
    .font("Helvetica-Bold")
    .fontSize(9)
    .text(title, MARGIN + 14, y + 13, { characterSpacing: 0.7 });
  let itemY = y + 35;
  safeItems.forEach((item, index) => {
    doc.circle(MARGIN + 18, itemY + 4, 2.2).fill(accent);
    doc
      .fillColor(COLORS.ink)
      .font("Helvetica")
      .fontSize(8.5)
      .text(plain(item), MARGIN + 28, itemY, { width: CONTENT_WIDTH - 42, lineGap: 1 });
    itemY += Math.max(15, itemHeights[index]! + 7);
  });
  doc.y = y + height;
}

function drawCallout(
  doc: PDFKit.PDFDocument,
  title: string,
  body: string,
  fill: string,
  accent: string
) {
  const safeBody = plain(body);
  const bodyHeight = doc.heightOfString(safeBody, { width: CONTENT_WIDTH - 28, lineGap: 1 });
  const height = Math.max(68, bodyHeight + 47);
  ensureSpace(doc, Math.min(height, CONTENT_BOTTOM - 82));
  const y = doc.y;
  doc.roundedRect(MARGIN, y, CONTENT_WIDTH, height, 7).fill(fill);
  doc.rect(MARGIN, y, 4, height).fill(accent);
  doc
    .fillColor(accent)
    .font("Helvetica-Bold")
    .fontSize(8.5)
    .text(title, MARGIN + 16, y + 13, { characterSpacing: 0.7 });
  doc
    .fillColor(COLORS.ink)
    .font("Helvetica")
    .fontSize(9)
    .text(safeBody, MARGIN + 16, y + 32, { width: CONTENT_WIDTH - 30, lineGap: 1 });
  doc.y = y + height;
}

function drawDetailGrid(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  details: readonly (readonly [string, string])[]
) {
  const columnWidth = width / 2;
  details.forEach(([label, value], index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const itemX = x + column * columnWidth;
    const itemY = y + row * 34;
    doc
      .fillColor(COLORS.muted)
      .font("Helvetica-Bold")
      .fontSize(7)
      .text(plain(label).toUpperCase(), itemX, itemY + 1, {
        width: columnWidth - 12,
        characterSpacing: 0.4,
        lineBreak: false,
      });
    doc
      .fillColor(COLORS.ink)
      .font("Helvetica")
      .fontSize(8.5)
      .text(plain(value), itemX, itemY + 13, { width: columnWidth - 12, height: 18, ellipsis: true });
  });
}

function sectionTitle(doc: PDFKit.PDFDocument, title: string) {
  doc
    .fillColor(COLORS.ink)
    .font("Helvetica-Bold")
    .fontSize(10)
    .text(title, MARGIN, doc.y, { characterSpacing: 0.8 });
  doc
    .moveTo(MARGIN, doc.y + 4)
    .lineTo(PAGE_WIDTH - MARGIN, doc.y + 4)
    .lineWidth(1)
    .strokeColor(COLORS.line)
    .stroke();
  doc.y += 7;
}

function paragraph(doc: PDFKit.PDFDocument, text: string) {
  doc
    .fillColor(COLORS.ink)
    .font("Helvetica")
    .fontSize(9)
    .text(plain(text), MARGIN, doc.y, { width: CONTENT_WIDTH, lineGap: 2 });
}

function roundedBox(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  height: number,
  fill: string,
  stroke: string
) {
  doc.roundedRect(x, y, width, height, 7).fillAndStroke(fill, stroke);
}

function ensureSpace(doc: PDFKit.PDFDocument, height: number) {
  if (doc.y + height > CONTENT_BOTTOM) doc.addPage();
}

function drawFooters(doc: PDFKit.PDFDocument) {
  const range = doc.bufferedPageRange();
  for (let pageIndex = range.start; pageIndex < range.start + range.count; pageIndex += 1) {
    doc.switchToPage(pageIndex);
    const originalBottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc
      .moveTo(MARGIN, PAGE_HEIGHT - 37)
      .lineTo(PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 37)
      .lineWidth(0.6)
      .strokeColor(COLORS.line)
      .stroke();
    doc
      .fillColor(COLORS.muted)
      .font("Helvetica")
      .fontSize(7)
      .text("Tour.you session evaluation", MARGIN, PAGE_HEIGHT - 28, {
        width: CONTENT_WIDTH / 2,
        lineBreak: false,
      });
    doc.text(`Page ${pageIndex - range.start + 1} of ${range.count}`, PAGE_WIDTH / 2, PAGE_HEIGHT - 28, {
      width: CONTENT_WIDTH / 2,
      align: "right",
      lineBreak: false,
    });
    doc.page.margins.bottom = originalBottomMargin;
  }
}

function plain(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, "-")
    .replace(/[^\x20-\x7E\n\r\t]/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function formatSessionDate(value: string | null): string {
  if (!value) return "Not provided";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return plain(value);
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatDateOnly(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return plain(value);
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(date);
}

function formatDuration(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return "Not provided";
  const totalSeconds = Math.round(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remaining = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`
    : `${minutes}:${String(remaining).padStart(2, "0")}`;
}

function colorForScore(score: number) {
  if (score >= 75) return { main: COLORS.green, soft: COLORS.greenSoft };
  if (score >= 50) return { main: COLORS.amber, soft: COLORS.amberSoft };
  return { main: COLORS.red, soft: COLORS.redSoft };
}

function clampScore(score: number) {
  return Math.max(0, Math.min(100, Number.isFinite(score) ? score : 0));
}

function numberOr(value: number | null | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function sumSectionPoints(analysis: AnalysisResult, kind: "earned" | "possible") {
  return analysis.sectionScores.reduce(
    (total, section) => total + (kind === "earned" ? section.pointsEarned : section.pointsPossible),
    0
  );
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatScore(value: number) {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}
