const express = require("express");
const cors = require("cors");
const puppeteer = require("puppeteer");

const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" }));

/* ======================================================
   AI EXPLANATION ENGINE
====================================================== */
function explainIssue(issue) {
  const map = {
    "SQL Injection": {
      impact:
        "Attackers could read, modify, or delete sensitive database records without authorization.",
      fix:
        "Use parameterized queries or prepared statements.\n\n" +
        "Example:\n" +
        "cursor.execute('SELECT * FROM users WHERE id=%s', (user_id,))"
    },
    "Hardcoded Secret": {
      impact:
        "Exposed secrets may be abused to access systems, APIs, or cloud resources.",
      fix:
        "Move secrets to environment variables or a secure secrets manager."
    },
    "XSS": {
      impact:
        "Malicious scripts could be injected, allowing attackers to steal user data.",
      fix:
        "Sanitize user input and escape output before rendering HTML."
    }
  };

  return map[issue.type] || {
    impact: "This issue may pose a security risk.",
    fix: "Apply standard security best practices."
  };
}

/* ======================================================
   POST /generate-pdf
====================================================== */
app.post("/generate-pdf", async (req, res) => {
  let browser;

  try {
    const scan_result = req.body.scan_result;

    if (!scan_result || !Array.isArray(scan_result.issues)) {
      return res.status(400).json({ error: "Invalid scan_result" });
    }

    const issues = scan_result.issues.map(issue => {
      const ai = explainIssue(issue);
      return {
        type: issue.type,
        severity: issue.severity || "low",
        message: issue.message || "",
        impact: ai.impact,
        fix: ai.fix
      };
    });

    const highCount = issues.filter(i => i.severity === "high").length;
    const mediumCount = issues.filter(i => i.severity === "medium").length;
    const lowCount = issues.filter(i => i.severity === "low").length;

    /* ====== CRITICAL FIX HERE ====== */
    browser = await puppeteer.launch({
      headless: true, // ❗ DO NOT use "new" on Render
      executablePath: "/usr/bin/chromium",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--single-process"
      ]
    });

    const page = await browser.newPage();

    const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<title>Security Audit Report</title>
<style>
body { font-family: Arial; padding: 40px; }
h1 { background:#0f172a; color:white; padding:20px; }
table { width:100%; border-collapse:collapse; }
th, td { border:1px solid #ccc; padding:10px; }
</style>
</head>
<body>
<h1>Security Audit Report</h1>
<p><b>Project:</b> ${scan_result.project || "N/A"}</p>
<p><b>Total Issues:</b> ${issues.length}</p>
<p><b>High:</b> ${highCount} | <b>Medium:</b> ${mediumCount} | <b>Low:</b> ${lowCount}</p>

<table>
<tr><th>#</th><th>Issue</th><th>Severity</th><th>Details</th></tr>
${issues.map((i, idx) => `
<tr>
<td>${idx + 1}</td>
<td>${i.type}</td>
<td>${i.severity}</td>
<td>${i.message}<br/><br/><b>Fix:</b><pre>${i.fix}</pre></td>
</tr>`).join("")}
</table>
</body>
</html>
`;

    await page.setContent(html, { waitUntil: "load" });

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true
    });

    await browser.close();

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=security-audit-report.pdf"
    );
    res.send(pdf);
  } catch (err) {
    if (browser) await browser.close();
    console.error("PDF ERROR:", err);
    res.status(500).json({ error: "PDF generation failed" });
  }
});

/* ====================================================== */

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ PDF service running on port ${PORT}`);
});
