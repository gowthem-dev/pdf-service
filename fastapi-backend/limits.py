from datetime import date

# In-memory store (MVP)
scan_usage = {}

FREE_DAILY_LIMIT = 10

def can_scan(user_id: str, paid: bool):
    today = str(date.today())
    key = f"{user_id}:{today}"

    if paid:
        return True, None

    used = scan_usage.get(key, 0)

    if used >= FREE_DAILY_LIMIT:
        return False, "Free daily scan limit reached (10 scans/day)"

    scan_usage[key] = used + 1
    return True, None
