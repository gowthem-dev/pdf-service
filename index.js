const express = require("express");
const cors = require("cors");
const puppeteer = require("puppeteer");

const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" }));

function explainIssue(issue) {
  return {
    impact: "This issue may pose a security risk.",
    fix: "Apply standard security best practices."
  };
}

app.post("/generate-pdf", async (req, res) => {
  let browser;

  try {
    const scan_result = req.body.scan_result;

    if (!scan_result || !Array.isArray(scan_result.issues)) {
      return res.status(400).json({ error: "Invalid scan_result" });
    }

    const issues = scan_result.issues.map(issue => ({
      type: issue.type || "Unknown",
      severity: issue.severity || "low",
      message: issue.message || "No description",
      ...explainIssue(issue)
    }));

    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu"
      ]
    });

    const page = await browser.newPage();

    const html = `
      <html>
        <body>
          <h1>Security Report</h1>
          <ul>
            ${issues.map(i => `<li>${i.type} - ${i.severity}</li>`).join("")}
          </ul>
        </body>
      </html>
    `;

    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdf = await page.pdf({ format: "A4" });

    await browser.close();

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=security-report.pdf"
    );
    res.send(pdf);

  } catch (err) {
    console.error("🔥 PDF ERROR:", err);

    if (browser) await browser.close();

    res.status(500).json({
      error: "PDF generation failed",
      details: err.message
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`✅ PDF service running on port ${PORT}`)
);
