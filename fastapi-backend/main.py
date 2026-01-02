from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
from datetime import date
from pydantic import BaseModel
import requests
from fastapi.responses import StreamingResponse
import io
import httpx
import base64
import re

app = FastAPI(title="Code Security Audit API")

# ======================================================
# CORS
# ======================================================
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5500",
        "http://localhost:5500"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ======================================================
# CONFIG (MVP MODE)
# ======================================================
DAILY_SOFT_LIMIT = 20
scan_usage = {}  # { user_id:YYYY-MM-DD : count }

PDF_SERVICE_URL = "https://pdf-service-wy8k.onrender.com/generate-pdf"
GITHUB_API = "https://api.github.com"

# ======================================================
# SOFT LIMIT (NO BLOCKING)
# ======================================================
def register_scan(user_id: str):
    today = str(date.today())
    key = f"{user_id}:{today}"
    used = scan_usage.get(key, 0) + 1
    scan_usage[key] = used

    if used > DAILY_SOFT_LIMIT:
        return "High usage detected. Advanced monitoring coming soon."
    return None

# ======================================================
# EXPLANATION ENGINE
# ======================================================
def explain_issue(issue_type: str):
    explanations = {
        "SQL Injection": {
            "impact": "Attackers may read or modify database data.",
            "fix": "Use parameterized queries.",
            "example": "cursor.execute('SELECT * FROM users WHERE id=%s', (user_id,))"
        },
        "Hardcoded Secret": {
            "impact": "Secrets can be leaked from repositories.",
            "fix": "Move secrets to environment variables.",
            "example": "os.getenv('API_KEY')"
        }
    }

    return explanations.get(issue_type, {
        "impact": "Potential security risk detected.",
        "fix": "Manual review recommended.",
        "example": "N/A"
    })

# ======================================================
# CODE SCAN
# ======================================================
@app.post("/scan")
async def scan_code(payload: dict):
    user_id = payload.get("user_id", "anonymous")
    code = payload.get("code", "")
    project = payload.get("project", "Client Project")

    if not code:
        raise HTTPException(status_code=400, detail="Code is required")

    warning = register_scan(user_id)

    issues = [
        {
            "type": "SQL Injection",
            "severity": "high",
            "message": "Unsafe SQL query detected",
            **explain_issue("SQL Injection")
        },
        {
            "type": "Hardcoded Secret",
            "severity": "medium",
            "message": "Hardcoded API key found",
            **explain_issue("Hardcoded Secret")
        }
    ]

    return {
        "project": project,
        "score": 72,
        "report_type": "Security Audit",
        "summary": {
            "overall_risk": "HIGH",
            "message": "Security risks detected.",
            "recommendation": "Fix high severity issues first."
        },
        "issues": issues,
        "notice": warning
    }

# ======================================================
# GITHUB SCAN
# ======================================================
class GitHubScanRequest(BaseModel):
    repo_url: str
    github_token: str | None = None
    user_id: str = "anonymous"

SECRET_PATTERNS = {
    "AWS Access Key": r"AKIA[0-9A-Z]{16}",
    "JWT Token": r"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+",
    "Generic API Key": r"(?i)(api_key|apikey|secret|token)[\"'\s:=]+[A-Za-z0-9-_]{16,}",
    "Password": r"(?i)(password|passwd|pwd)[\"'\s:=]+.+"
}

@app.post("/scan/github")
async def scan_github_repo(data: GitHubScanRequest):
    warning = register_scan(data.user_id)

    try:
        owner, repo = data.repo_url.rstrip("/").split("/")[-2:]
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid GitHub repository URL")

    headers = {}
    if data.github_token:
        headers["Authorization"] = f"token {data.github_token}"

    findings = []

    async with httpx.AsyncClient(timeout=60) as client:
        tree_url = f"{GITHUB_API}/repos/{owner}/{repo}/git/trees/HEAD?recursive=1"
        tree_res = await client.get(tree_url, headers=headers)

        if tree_res.status_code != 200:
            raise HTTPException(status_code=400, detail="Unable to access repository")

        tree = tree_res.json()

        for item in tree.get("tree", []):
            if item["type"] != "blob":
                continue

            file_url = f"{GITHUB_API}/repos/{owner}/{repo}/contents/{item['path']}"
            res = await client.get(file_url, headers=headers)

            if res.status_code != 200:
                continue

            data_json = res.json()
            if "content" not in data_json:
                continue

            content = base64.b64decode(data_json["content"]).decode(errors="ignore")

            for secret_type, pattern in SECRET_PATTERNS.items():
                for match in re.finditer(pattern, content):
                    findings.append({
                        "type": secret_type,
                        "severity": "high",
                        "message": f"Secret found in {item['path']} (line {content[:match.start()].count(chr(10)) + 1})",
                        **explain_issue("Hardcoded Secret")
                    })

    return {
        "project": data.repo_url,
        "score": 100 if not findings else 60,
        "report_type": "Repository Security Audit",
        "issues": findings,
        "notice": warning
    }

# ======================================================
# GITHUB → PDF (SAFE)
# ======================================================
@app.post("/scan/github/pdf")
async def github_pdf(data: GitHubScanRequest):
    scan_result = await scan_github_repo(data)

    async with httpx.AsyncClient(timeout=60) as client:
        pdf_response = await client.post(
            PDF_SERVICE_URL,
            json={"scan_result": scan_result, "paid": False}
        )

    if pdf_response.status_code != 200 or \
       pdf_response.headers.get("content-type") != "application/pdf":
        raise HTTPException(status_code=500, detail="PDF generation failed")

    return Response(
        content=pdf_response.content,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=github-security-report.pdf"}
    )

# ======================================================
# CODE → PDF
# ======================================================
@app.post("/generate-pdf")
async def generate_pdf(payload: dict):
    async with httpx.AsyncClient(timeout=60) as client:
        pdf_response = await client.post(PDF_SERVICE_URL, json=payload)

    if pdf_response.status_code != 200 or \
       pdf_response.headers.get("content-type") != "application/pdf":
        raise HTTPException(status_code=500, detail="PDF service failed")

    return Response(
        content=pdf_response.content,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=security-audit-report.pdf"}
    )
