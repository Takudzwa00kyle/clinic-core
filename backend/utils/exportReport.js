const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { Document, Packer, Paragraph, TextRun } = require('docx');

const EXPORT_DIR = path.join(__dirname, '../exports');
if (!fs.existsSync(EXPORT_DIR)) fs.mkdirSync(EXPORT_DIR);

const createExcelReport = async (data, filename = 'report.xlsx') => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Summary');

  sheet.columns = Object.keys(data[0] || {}).map(key => ({ header: key, key }));
  data.forEach(item => sheet.addRow(item));

  const filePath = path.join(EXPORT_DIR, filename);
  await workbook.xlsx.writeFile(filePath);
  return filePath;
};

const createPDFReport = async (data, filename = 'report.pdf') => {
  const filePath = path.join(EXPORT_DIR, filename);
  const doc = new PDFDocument();
  doc.pipe(fs.createWriteStream(filePath));

  doc.fontSize(16).text('Clinic Summary Report', { underline: true }).moveDown();
  data.forEach((item, i) => {
    doc.fontSize(12).text(`${i + 1}. ${JSON.stringify(item)}`);
  });

  doc.end();
  return filePath;
};

const createWordReport = async (data, filename = 'report.docx') => {
  const doc = new Document();
  const children = data.map((item, i) =>
    new Paragraph({
      children: [new TextRun(`${i + 1}. ${JSON.stringify(item)}`)]
    })
  );

  doc.addSection({ children });

  const filePath = path.join(EXPORT_DIR, filename);
  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(filePath, buffer);
  return filePath;
};

module.exports = { createExcelReport, createPDFReport, createWordReport };
