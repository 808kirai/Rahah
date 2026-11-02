"""rahah pro and max: passes paid by m-pesa or card through paystack

a pass lasts a week, a month or a term. pro gives ten times the daily limit with unlimited mage, max gives
twenty times and adds archmage. on top of the bigger daily limit each pass has a cap on what it can use in
total, about seventy percent of its price, so a student never costs more than they paid. once that's used up
they're back on the free daily limit until the pass ends
"""

import hashlib
import hmac
import secrets

import httpx

# the two paid tiers, max ranks above pro
tiers = {
    "pro": {"name": "Pro", "multiplier": 10, "rank": 1},
    "max": {"name": "Max", "multiplier": 20, "rank": 2},
}

# shillings to a dollar. prices are set in dollars ending in .99 and charged in shillings at this rate,
# since paystack charges kenyan students in shillings. change it if the shilling moves a lot
kes_per_usd = 129

# what each pass costs in dollars, how long it lasts, and the most it can use in dollars, about seventy
# percent of its price
passes = {
    "day": {"name": "Exam day", "tier": "pro", "usd": 0.49, "days": 1, "budget": 0.34, "multiplier": 5},
    "pro_week": {"name": "Pro week", "tier": "pro", "usd": 1.99, "days": 7, "budget": 1.40},
    "pro_month": {"name": "Pro month", "tier": "pro", "usd": 3.99, "days": 30, "budget": 2.80},
    "pro_term": {"name": "Pro term", "tier": "pro", "usd": 11.49, "days": 91, "budget": 8.05},
    "max_week": {"name": "Max week", "tier": "max", "usd": 2.99, "days": 7, "budget": 2.10},
    "max_month": {"name": "Max month", "tier": "max", "usd": 5.99, "days": 30, "budget": 4.20},
    "max_term": {"name": "Max term", "tier": "max", "usd": 16.99, "days": 91, "budget": 11.90},
}
# the price in shillings, worked out once from the dollar price
for p in passes.values():
    if "usd" in p:
        p["price"] = round(p["usd"] * kes_per_usd)
    else:
        p["usd"] = round(p["price"] / kes_per_usd, 2)
# passes nobody pays for: a three day trial of pro once per account, and 24 hours of pro for bringing a friend who buys
free_passes = {
    "trial": {"name": "Free trial", "tier": "pro", "days": 3, "budget": 0.30},
    "gift": {"name": "Friend reward", "tier": "pro", "days": 1, "budget": 0.20},
}
# passes bought before max existed were all pro
old_passes = {"week": "pro_week", "month": "pro_month", "term": "pro_term"}
pro_multiplier = tiers["pro"]["multiplier"]
currency = "KES"

# what the free plan has, and what pro and max open up
free_recent_chats = 5
free_searches_a_day = 5
free_photo_marks_a_day = 5
free_mage_a_day = 10
free_notes = 25
# the most one question can send on pro and max, about 100 pdf pages. free uses the server's cap, about 40.
# their pass's own total keeps a big file from costing more than they paid
paid_prompt_tokens = 250_000
pro_notes = 200
max_notes = 500
trials_per_address = 2


def plan_info(plan: str) -> dict:
    """a pass's details with its tier's name and multiplier filled in"""
    p = passes.get(old_passes.get(plan, plan)) or free_passes.get(plan) or {"name": "Pro", "tier": "pro"}
    tier = tiers[p["tier"]]
    return {**p, "tier_name": tier["name"], "multiplier": p.get("multiplier", tier["multiplier"]), "rank": tier["rank"]}


def plans_below(tier: str) -> set[str]:
    """every pass of a lower tier, which waits while a better pass runs"""
    rank = tiers[tier]["rank"]
    every = {**passes, **free_passes, **{k: passes[v] for k, v in old_passes.items()}}
    return {k for k, p in every.items() if tiers[p["tier"]]["rank"] < rank}


def new_reference() -> str:
    return f"rahah_{secrets.token_hex(10)}"


def signature_ok(secret: str, body: bytes, signature: str | None) -> bool:
    """paystack signs every webhook with the secret key, so only real ones are believed"""
    if not secret or not signature:
        return False
    expected = hmac.new(secret.encode(), body, hashlib.sha512).hexdigest()
    return hmac.compare_digest(expected, signature)


class paystack:
    """the two calls rahah makes: start a payment, and ask paystack how it went"""

    base = "https://api.paystack.co"

    def __init__(self, secret: str):
        self.secret = secret

    def _headers(self) -> dict:
        return {"Authorization": f"Bearer {self.secret}", "Content-Type": "application/json"}

    def start(self, email: str, amount: int, reference: str, callback: str, plan: str) -> dict:
        """a payment for this amount in shillings, m-pesa and card. gives paystack's page address, for when the
        popup can't open, and the access code the popup opens it with"""
        reply = httpx.post(
            f"{self.base}/transaction/initialize",
            headers=self._headers(),
            json={
                "email": email, "amount": amount * 100, "currency": currency, "reference": reference,
                "callback_url": callback, "channels": ["mobile_money", "card"], "metadata": {"plan": plan},
            },
            timeout=20,
        )
        body = reply.json()
        if reply.status_code != 200 or not body.get("status"):
            raise RuntimeError(body.get("message") or "Paystack didn't start the payment.")
        return {"url": body["data"]["authorization_url"], "access_code": body["data"].get("access_code", "")}

    def check(self, reference: str) -> dict:
        """what paystack knows about a payment: its status, amount in cents and currency"""
        reply = httpx.get(f"{self.base}/transaction/verify/{reference}", headers=self._headers(), timeout=20)
        body = reply.json()
        if reply.status_code != 200 or not body.get("status"):
            raise RuntimeError(body.get("message") or "Paystack couldn't find that payment.")
        return body["data"]
