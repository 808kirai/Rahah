"""student accounts, passwords, sign in checks and sessions

passwords are hashed with scrypt from python's own library, so nothing extra is installed
a session is a random token kept in a cookie the page's script can't read, and only its hash is stored
"""

import base64
import hashlib
import hmac
import re
import secrets
import time
from collections import defaultdict, deque

session_cookie = "rahah_session"
session_days = 30

# scrypt settings, about a tenth of a second per check, which slows down guessing without slowing sign in
scrypt_n, scrypt_r, scrypt_p = 2 ** 14, 8, 1

username_rule = re.compile(r"^[A-Za-z0-9_.]{3,24}$")
email_rule = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
min_password = 8


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=scrypt_n, r=scrypt_r, p=scrypt_p, dklen=32)
    encode = lambda b: base64.b64encode(b).decode()
    return f"scrypt${scrypt_n}${scrypt_r}${scrypt_p}${encode(salt)}${encode(digest)}"


def check_password(password: str, stored: str | None) -> bool:
    if not stored or not stored.startswith("scrypt$"):
        return False
    try:
        _, n, r, p, salt, digest = stored.split("$")
        found = hashlib.scrypt(password.encode(), salt=base64.b64decode(salt), n=int(n), r=int(r), p=int(p), dklen=32)
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(found, base64.b64decode(digest))


def new_token() -> str:
    return secrets.token_urlsafe(32)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def clean_username(value: str) -> str:
    # kept exactly as typed, so signing in needs the same capitals
    return value.strip()


def clean_email(value: str) -> str:
    return value.strip().lower()


def username_problem(username: str) -> str | None:
    if not username_rule.match(username):
        return "Usernames are 3 to 24 letters, numbers, dots or underscores."
    return None


def email_problem(email: str) -> str | None:
    if len(email) > 200 or not email_rule.match(email):
        return "That email address doesn't look right."
    return None


def password_problem(password: str) -> str | None:
    if len(password) < min_password:
        return f"Passwords need at least {min_password} characters."
    if len(password) > 200:
        return "That password is too long."
    if not re.search(r"[^A-Za-z0-9\s]", password):
        return "Passwords need at least one special character, like ! # @ or ?."
    return None


def username_from(text: str) -> str:
    """a username made from a name or an email, for accounts made with google or apple"""
    base = re.sub(r"[^a-z0-9_.]", "", text.split("@")[0].lower())[:18]
    return base if len(base) >= 3 else (base + "student")[:18]


class sign_in_guard:
    """slows down guessing, a name or an address gets a few tries, then a short wait"""

    def __init__(self, tries: int = 5, window: int = 15 * 60):
        self.tries = tries
        self.window = window
        self.fails: dict[str, deque] = defaultdict(deque)

    def _recent(self, key: str, now: float) -> deque:
        fails = self.fails[key]
        while fails and now - fails[0] > self.window:
            fails.popleft()
        return fails

    def blocked(self, *keys: str) -> bool:
        now = time.time()
        return any(len(self._recent(k, now)) >= self.tries for k in keys if k)

    def failed(self, *keys: str) -> bool:
        """counts a wrong try, and says whether a name or address has just run out of tries"""
        now = time.time()
        locked = False
        for k in keys:
            if k:
                recent = self._recent(k, now)
                recent.append(now)
                locked = locked or len(recent) == self.tries
        # endless made up names can't fill the server's memory, old entries are cleared out
        if len(self.fails) > 50_000:
            for k in [k for k, v in self.fails.items() if not v or now - v[-1] > self.window]:
                del self.fails[k]
        return locked

    def cleared(self, *keys: str) -> None:
        for k in keys:
            self.fails.pop(k, None)
