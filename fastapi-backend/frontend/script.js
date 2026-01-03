/* ======================================================
   CONFIG
====================================================== */
const API_BASE = "https://pdf-security-backend.onrender.com";

let lastScanResult = null;
const resultBox = document.getElementById("result");

function setLoading(message) {
  resultBox.textContent = message;
}

/* ======================================================
   BASIC GITHUB URL VALIDATION (FRONTEND SAFETY)
====================================================== */
function isValidGitHubRepo(url) {
  if (!url) return false;
  if (!url.startsWith("https://github.com/")) return false;

  // Remove trailing slash
  const cleanUrl = url.replace(/\/$/, "");

  const parts = cleanUrl.replace("https://github.com/", "").split("/");

  // Must be exactly owner/repo
  if (parts.length !== 2) return false;

  // No empty, no spaces
  if (!parts[0] || !parts[1]) return false;
  if (parts[0].includes(" ") || parts[1].includes(" ")) return false;

  return true;
}

/* ======================================================
   CODE SCAN
====================================================== */
async function scanCode() {
  const code = document.getElementById("codeInput").value;

  if (!code.trim()) {
    alert("Please paste some code first");
    return;
  }

  setLoading("🔍 Scanning code...");

  try {
    const res = await fetch(`${API_BASE}/scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: "demo_user",
        paid: false,
        code: code,
        project: "Frontend Demo"
      })
    });

    const data = await res.json();
    lastScanResult = data;

    resultBox.textContent = JSON.stringify(data, null, 2);
  } catch (err) {
    resultBox.textContent = "❌ Scan failed";
    console.error(err);
  }
}

/* ======================================================
   CODE → PDF
====================================================== */
async function downloadPDF() {
  if (!lastScanResult) {
    alert("Scan code first");
    return;
  }

  setLoading("📄 Generating PDF...");

  try {
    const res = await fetch(`${API_BASE}/generate-pdf`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scan_result: lastScanResult,
        paid: false
      })
    });

    const blob = await res.blob();

    if (blob.type !== "application/pdf") {
      throw new Error("Invalid PDF response");
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "security-report.pdf";
    a.click();
  } catch (err) {
    alert("PDF generation failed");
    console.error(err);
  }
}

/* ======================================================
   GITHUB → PDF (WITH FRONTEND SAFETY)
====================================================== */
async function scanGitHubPDF() {
  const repoUrl = document.getElementById("repoUrl").value.trim();

  // 🔐 FRONTEND SAFETY CHECK
  if (!isValidGitHubRepo(repoUrl)) {
    alert(
      "Invalid GitHub repository URL.\n\n" +
      "Example:\nhttps://github.com/owner/repository"
    );
    return;
  }

  setLoading("🐙 Scanning GitHub repository...");

  try {
    const res = await fetch(`${API_BASE}/scan/github/pdf`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        repo_url: repoUrl,
        user_id: "demo_user"
      })
    });

    const blob = await res.blob();

    // 🔐 Prevent broken downloads
    if (blob.type !== "application/pdf") {
      throw new Error("Invalid PDF generated");
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "github-security-report.pdf";
    a.click();
  } catch (err) {
    alert("GitHub scan failed. Please try another repository.");
    console.error(err);
  }
}

/* ======================================================
   DEBUG (OPTIONAL – YOU CAN REMOVE LATER)
====================================================== */
console.log("Frontend connected to:", API_BASE);
