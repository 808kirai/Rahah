"""what each request to claude used and cost, kept so the owner can see spending and so per student
limits can be built on it later

prices are dollars per million tokens, from the claude price list, and a web search is a cent
"""

prices = {
    "claude-opus-5-5": {"input": 4.00, "output": 20.00, "cache_read": 0.20},
    "claude-sonnet-5-5": {"input": 2.00, "output": 10.00, "cache_read": 0.20},
    "claude-haiku-5-5": {"input": 0.10, "output": 0.50, "cache_read": 0.01},
}
# writing to the five minute cache costs a quarter more than plain input
cache_write_rate = 1.25
search_price = 0.01


def usage_of(message) -> dict:
    """the counts from one api reply, zero where the reply leaves a field out"""
    usage = getattr(message, "usage", None)
    count = lambda name: int(getattr(usage, name, 0) or 0)
    tools = getattr(usage, "server_tool_use", None)
    return {
        "model": getattr(message, "model", "") or "",
        "input_tokens": count("input_tokens"),
        "output_tokens": count("output_tokens"),
        "cache_read": count("cache_read_input_tokens"),
        "cache_write": count("cache_creation_input_tokens"),
        "searches": int(getattr(tools, "web_search_requests", 0) or 0),
    }


def add_up(parts: list[dict]) -> dict:
    """one request can take several replies, a paused turn is resumed, so their counts are summed"""
    total = {"model": parts[-1]["model"] if parts else "", "input_tokens": 0, "output_tokens": 0,
             "cache_read": 0, "cache_write": 0, "searches": 0}
    for part in parts:
        for key in ("input_tokens", "output_tokens", "cache_read", "cache_write", "searches"):
            total[key] += part[key]
    return total


def cost_of(use: dict) -> float | None:
    """dollars for one request, or None for a model without a known price"""
    price = next((p for name, p in prices.items() if use["model"].startswith(name)), None)
    if not price:
        return None
    tokens = (
        use["input_tokens"] * price["input"]
        + use["cache_write"] * price["input"] * cache_write_rate
        + use["cache_read"] * price["cache_read"]
        + use["output_tokens"] * price["output"]
    ) / 1_000_000
    return round(tokens + use["searches"] * search_price, 6)


def saved_by_cache(use: dict) -> float:
    """what the cached part would have cost as plain input, less what it did cost"""
    price = next((p for name, p in prices.items() if use["model"].startswith(name)), None)
    if not price:
        return 0.0
    return use["cache_read"] * (price["input"] - price["cache_read"]) / 1_000_000


def summarise(rows: list[dict], since: dict[str, float]) -> dict:
    """totals for each window, like today and the last 7 days, from rows that carry created and cost"""
    result = {}
    for name, start in since.items():
        picked = [r for r in rows if r["created"] >= start]
        read = sum(r["cache_read"] for r in picked)
        fresh = sum(r["input_tokens"] + r["cache_write"] for r in picked)
        kinds: dict[str, dict] = {}
        for r in picked:
            k = kinds.setdefault(r["kind"], {"kind": r["kind"], "requests": 0, "cost": 0.0})
            k["requests"] += 1
            k["cost"] += r["cost"] or 0
        result[name] = {
            "requests": len(picked),
            "cost": round(sum(r["cost"] or 0 for r in picked), 4),
            "saved": round(sum(saved_by_cache(r) for r in picked), 4),
            "input_tokens": fresh + read,
            "output_tokens": sum(r["output_tokens"] for r in picked),
            "searches": sum(r["searches"] for r in picked),
            # how much of what was read came from the cache
            "cache_share": round(100 * read / (fresh + read)) if fresh + read else 0,
            "kinds": sorted(({**k, "cost": round(k["cost"], 4)} for k in kinds.values()), key=lambda k: -k["cost"]),
        }
    return result
