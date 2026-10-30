"""protections around every request, headers that tell the browser what's allowed, a check that changes come
from rahah's own pages, a cap on request size, and limits that stop one person running up the bill

the limits here are kept in memory, so they start fresh when the server restarts, which is fine for one
server. the money limits that matter most, each student's allowance and the daily budget for everyone,
are worked out from the usage table and survive restarts
"""

import base64
import hashlib
import re
import time
import uuid
from collections import defaultdict, deque
from pathlib import Path

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse

static_dir = Path(__file__).resolve().parent.parent / "static"

# sites the page loads code, styles, fonts and sign in from, nothing else may run
script_hosts = "https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://accounts.google.com https://appleid.cdn-apple.com"
style_hosts = "https://fonts.googleapis.com https://cdnjs.cloudflare.com https://accounts.google.com"
font_hosts = "https://fonts.gstatic.com https://cdnjs.cloudflare.com"
frame_hosts = "https://accounts.google.com https://appleid.apple.com"
fetch_hosts = "https://accounts.google.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://fonts.googleapis.com https://fonts.gstatic.com"


def inline_script_hashes() -> list[str]:
    """the page has one small script written into it, for the theme and font, allowed by its exact hash"""
    page = (static_dir / "index.html").read_text(encoding="utf-8")
    hashes = []
    for body in re.findall(r"<script>(.*?)</script>", page, flags=re.S):
        digest = base64.b64encode(hashlib.sha256(body.encode("utf-8")).digest()).decode()
        hashes.append(f"'sha256-{digest}'")
    return hashes


def content_policy() -> str:
    scripts = " ".join(inline_script_hashes())
    return "; ".join([
        "default-src 'self'",
        f"script-src 'self' {scripts} {script_hosts}",
        # katex, the charts and the page's own bars set small inline styles
        f"style-src 'self' 'unsafe-inline' {style_hosts}",
        f"font-src 'self' data: {font_hosts}",
        "img-src 'self' data: blob: https://*.googleusercontent.com https://www.gstatic.com",
        f"connect-src 'self' {fetch_hosts}",
        f"frame-src {frame_hosts}",
        "media-src 'self' blob:",
        "worker-src 'self'",
        "manifest-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        # nobody can show rahah inside their own page to trick clicks
        "frame-ancestors 'none'",
    ])


def install(app, cfg, max_body_mb: int) -> None:
    policy = content_policy()
    max_body = max_body_mb * 1024 * 1024
    unsafe = {"POST", "PUT", "PATCH", "DELETE"}

    @app.middleware("http")
    async def guard_requests(request: Request, call_next):
        # a change has to come from rahah's own pages, so another site can't make a signed in student's
        # browser send one, the cookie's samesite setting already blocks this and this is a second lock
        if request.method in unsafe and request.url.path.startswith("/api/"):
            origin = request.headers.get("origin")
            if request.headers.get("sec-fetch-site") == "cross-site" or (origin and origin.split("://", 1)[-1] != request.headers.get("host", "")):
                return JSONResponse({"detail": "That request didn't come from Rahah."}, status_code=403)
            length = request.headers.get("content-length")
            if length and length.isdigit() and int(length) > max_body:
                return JSONResponse({"detail": f"That's too big to send. Files can be up to {max_body_mb - 5} MB."}, status_code=413)
        response = await call_next(request)
        headers = response.headers
        headers.setdefault("X-Content-Type-Options", "nosniff")
        headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        headers.setdefault("X-Frame-Options", "DENY")
        headers.setdefault("Permissions-Policy", "camera=(self), microphone=(self), geolocation=(), payment=(), usb=()")
        # google's sign in opens a popup that has to talk back to the page
        headers.setdefault("Cross-Origin-Opener-Policy", "same-origin-allow-popups")
        headers.setdefault("Content-Security-Policy", policy)
        if cfg.https:
            headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        return response


class counter:
    """counts events per key inside a time window, like sign ups from one address in a day"""

    def __init__(self, limit: int, window: float, max_keys: int = 50_000):
        self.limit = limit
        self.window = window
        self.max_keys = max_keys
        self.events: dict[str, deque] = defaultdict(deque)

    def _recent(self, key: str, now: float) -> deque:
        events = self.events[key]
        while events and now - events[0] > self.window:
            events.popleft()
        return events

    def full(self, key: str) -> bool:
        return self.limit > 0 and len(self._recent(key, time.time())) >= self.limit

    def add(self, key: str) -> None:
        now = time.time()
        self._recent(key, now).append(now)
        # someone sending endless made up names can't fill the server's memory
        if len(self.events) > self.max_keys:
            for k in [k for k, v in self.events.items() if not v or now - v[-1] > self.window]:
                del self.events[k]


class in_flight:
    """how many requests to claude each student has running at once

    a request that never reports back, say the page closed before its answer began, stops counting
    after a while, so nobody gets stuck
    """

    def __init__(self, limit: int, expire: float = 600):
        self.limit = limit
        self.expire = expire
        self.running: dict[str, dict[str, float]] = defaultdict(dict)

    def start(self, user_id: str) -> str:
        now = time.time()
        mine = self.running[user_id]
        for token in [t for t, started in mine.items() if now - started > self.expire]:
            del mine[token]
        if self.limit > 0 and len(mine) >= self.limit:
            raise HTTPException(429, "Rahah is still answering. Wait for that to finish, then try again.")
        token = uuid.uuid4().hex
        mine[token] = now
        return token

    def finish(self, user_id: str, token: str) -> None:
        self.running.get(user_id, {}).pop(token, None)
