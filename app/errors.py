"""short, plain messages for every error a student can meet, so nothing raw from the server or a library
reaches the page. errors the app raises on purpose already carry their own message and pass through"""

from http import HTTPStatus

# what a status means to a student, used when nothing more specific was said
status_messages = {
    400: "That didn't work. Check it and try again.",
    401: "Sign in to keep going.",
    403: "You can't do that.",
    404: "That isn't here any more.",
    405: "That can't be done here.",
    408: "That took too long. Try again.",
    409: "That changed while you were on it. Refresh and try again.",
    413: "That's too big to send.",
    415: "That file type isn't supported.",
    422: "Something in that form isn't right.",
    429: "Too many tries. Wait a moment, then try again.",
    500: "Something broke on our side. Try again.",
    502: "Rahah couldn't reach a service it needs. Try again soon.",
    503: "Rahah is busy or restarting. Try again in a minute.",
    504: "That took too long. Try again.",
}

server_error = status_messages[500]


def message_for(status: int) -> str:
    return status_messages.get(status) or (server_error if status >= 500 else status_messages[400])


def plain_detail(status: int, detail) -> str:
    """the detail to send, a stock phrase like Not Found swapped for a plain message"""
    if not isinstance(detail, str) or not detail.strip():
        return message_for(status)
    try:
        stock = HTTPStatus(status).phrase
    except ValueError:
        stock = ""
    return message_for(status) if detail == stock else detail


# form fields as a student would name them
field_names = {
    "text": "Your message", "answer": "Your answer", "topic": "Topic", "title": "Title", "notes": "Notes",
    "name": "Name", "username": "Username", "login": "Username or email", "email": "Email", "password": "Password",
    "current": "Current password", "new": "New password", "confirm": "Confirmation", "code": "Code",
    "mode": "Subject", "model": "Model", "language": "Language", "count": "Number", "kind": "Type", "style": "Style",
    "pages": "Pages", "file": "File", "photo": "Photo", "file_ids": "Attached files", "note_ids": "Notes",
    "due_date": "Date", "due_time": "Time", "date": "Date", "day": "Day", "days": "Days", "start_time": "Start time",
    "end_time": "End time", "every_days": "Repeat", "lead_days": "Reminder days", "daily_cap": "Daily limit",
    "rating": "Rating", "score": "Score", "plan": "Plan", "tier": "Plan", "timezone": "Time zone", "zone": "Time zone",
    "place": "Place", "q": "Search", "scope": "View", "offset": "Week", "index": "Question", "topics": "Topics",
}


def field_label(loc) -> str:
    names = [str(part) for part in loc if isinstance(part, str) and part not in ("body", "query", "form", "path")]
    if not names:
        return ""
    name = names[-1]
    return field_names.get(name, name.replace("_", " ").capitalize())


def validation_message(errors: list[dict]) -> str:
    """one short sentence for the first thing wrong with a form"""
    if not errors:
        return status_messages[422]
    first = errors[0]
    kind, ctx = first.get("type", ""), first.get("ctx") or {}
    label = field_label(first.get("loc", ()))
    if kind == "value_error":
        # the app's own checks already word their message for a student
        return str(first.get("msg", "")).removeprefix("Value error, ") or status_messages[422]
    if kind == "json_invalid" or not label:
        return "That couldn't be read. Refresh and try again."
    if kind == "missing":
        return f"{label} is missing."
    if kind == "string_too_short":
        return f"{label} can't be empty." if ctx.get("min_length", 1) <= 1 else f"{label} is too short."
    if kind == "string_too_long":
        return f"{label} is too long. Keep it under {ctx.get('max_length')} characters." if ctx.get("max_length") else f"{label} is too long."
    if kind == "too_long":
        return f"Too many {label.lower()}."
    if kind == "too_short":
        return f"{label} needs at least {ctx.get('min_length', 1)}."
    if kind in ("greater_than", "greater_than_equal", "less_than", "less_than_equal"):
        return f"{label} is out of range."
    if kind in ("int_parsing", "int_type", "float_parsing", "float_type", "int_from_float"):
        return f"{label} must be a number."
    if kind in ("literal_error", "enum"):
        return f"Pick a valid {label.lower()}."
    if kind == "string_pattern_mismatch":
        return f"{label} isn't in the right format."
    if kind in ("bool_parsing", "bool_type"):
        return f"{label} must be on or off."
    return f"{label} isn't right."
