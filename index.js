const express = require("express");
const cors = require("cors");
const puppeteer = require("puppeteer");

const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" }));

/* ======================================================
   AI EXPLANATION ENGINE (SINGLE SOURCE)
====================================================== */
function explainIssue(issue) {
  const map = {
    "SQL Injection": {
      impact:
        "Attackers could read, modify, or delete sensitive database records without authorization.",
      fix:
        "Use parameterized queries or prepared statements.\n\n" +
        "Example:\n" +
        "cursor.execute(\n" +
        "  'SELECT * FROM users WHERE id=%s',\n" +
        "  (user_id,)\n" +
        ")"
    },
    "Hardcoded Secret": {
      impact:
        "Exposed secrets may be abused to access systems, APIs, or cloud resources.",
      fix:
        "Move secrets to environment variables or a secure secrets manager.\n\n" +
        "Example:\n" +
        "API_KEY = os.getenv('API_KEY')"
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
   👉 LAUNCH MODE: FULL REPORT FOR ALL
====================================================== */
app.post("/generate-pdf", async (req, res) => {
  try {
    const scan_result = req.body.scan_result;

    // 🚀 LAUNCH MODE: ignore paid flag completely
    const paid = true;

    console.log("📄 PDF generation | LAUNCH MODE (FULL)");

    if (!scan_result || !Array.isArray(scan_result.issues)) {
      return res.status(400).json({ error: "Invalid scan_result" });
    }

    /* ==================================================
       NORMALIZE ISSUES (FINAL SHAPE)
    ================================================== */
    const issues = scan_result.issues.map(issue => {
      const ai = explainIssue(issue);

      return {
        type: issue.type,
        severity: issue.severity || "low",
        message: issue.message,
        impact: ai.impact,
        fix: ai.fix
      };
    });

    const highCount = issues.filter(i => i.severity === "high").length;
    const mediumCount = issues.filter(i => i.severity === "medium").length;
    const lowCount = issues.filter(i => i.severity === "low").length;

    const browser = await puppeteer.launch({
  headless: "new",
  args: [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--single-process"
  ],
  executablePath:
    process.env.NODE_ENV === "production"
      ? "/usr/bin/chromium"
      : undefined
});


    const page = await browser.newPage();

    /* ================= PDF HTML ================= */
    const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<title>Security Audit Report</title>

<style>
body {
  font-family: "Segoe UI", Arial, sans-serif;
  background: #f4f6fb;
  margin: 0;
  padding: 40px;
  color: #1f2937;
}
.header {
  background: #0f172a;
  color: white;
  padding: 28px;
}
.card {
  background: white;
  padding: 20px;
  border-radius: 12px;
  margin-bottom: 20px;
}
.summary {
  display: flex;
  gap: 16px;
}
.summary .card {
  flex: 1;
  text-align: center;
}
table {
  width: 100%;
  border-collapse: collapse;
  background: white;
  border-radius: 12px;
  overflow: hidden;
}
th {
  background: #f1f5f9;
}
th, td {
  padding: 14px;
  border-bottom: 1px solid #e5e7eb;
  vertical-align: top;
}
.badge {
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: bold;
}
.high { background:#fee2e2; color:#b91c1c; }
.medium { background:#ffedd5; color:#c2410c; }
.low { background:#dcfce7; color:#166534; }

.fix-box {
  background: #f8fafc;
  padding: 14px;
  border-radius: 8px;
  font-family: monospace;
  font-size: 14px;
  white-space: pre-wrap;
  margin-top: 8px;
}

.footer {
  margin-top: 40px;
  font-size: 11px;
  text-align: center;
  color: #64748b;
}
</style>
</head>

<body>

<div class="header">
  <h1>Security Audit Report</h1>
  <p>Automated Code Vulnerability Scan</p>
</div>

<div class="card">
  <b>Project:</b> ${scan_result.project || "N/A"}<br/>
  <b>Score:</b> ${scan_result.score ?? "N/A"} / 100<br/>
  <b>Report Type:</b> Full Security Audit
</div>

<div class="summary">
  <div class="card"><b>Total Issues</b><br/>${issues.length}</div>
  <div class="card"><b>High</b><br/>${highCount}</div>
  <div class="card"><b>Medium</b><br/>${mediumCount}</div>
  <div class="card"><b>Low</b><br/>${lowCount}</div>
</div>

<table>
<tr>
  <th>#</th>
  <th>Issue</th>
  <th>Severity</th>
  <th>Details</th>
</tr>

${issues.map((i, idx) => `
<tr>
  <td>${idx + 1}</td>
  <td>${i.type}</td>
  <td><span class="badge ${i.severity}">${i.severity.toUpperCase()}</span></td>
  <td>
    <b>Description:</b> ${i.message}<br/><br/>
    <b>Impact:</b> ${i.impact}<br/><br/>
    <b>Recommended Fix:</b>
    <div class="fix-box">${i.fix}</div>
  </td>
</tr>
`).join("")}

</table>

<div class="card">
  <b>Recommended Next Steps</b>
  <ul>
    <li>Fix all HIGH severity issues immediately</li>
    <li>Rotate exposed secrets and credentials</li>
    <li>Re-run scan after fixes</li>
    <li>Enable continuous monitoring for production systems</li>
  </ul>
</div>

<div class="footer">
  Generated on ${new Date().toLocaleString()}<br/>
  © 2025 AI Code Security Scanner
</div>

</body>
</html>
`;

    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdf = await page.pdf({ format: "A4", printBackground: true });

    await browser.close();

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=security-audit-report.pdf"
    );
    res.send(pdf);
  } catch (err) {
    console.error("PDF ERROR:", err);
    res.status(500).json({ error: "PDF generation failed" });
  }
});

/* ====================================================== */

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`PDF service running on port ${PORT}`);
});

