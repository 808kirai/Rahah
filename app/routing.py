"""which claude model answers what

students pick a model by a name that says how hard it thinks, or leave it on auto
    acolyte   haiku 5.5, quick answers for everyday questions
    mage      sonnet 5.5, careful thinking for maths, science, code and essays
    archmage  opus 5.5, the deepest thinking, for the admin only

auto sends everyday questions to acolyte and maths, science and code to mage, where a slip costs the
student more. making flashcards, tests, summaries, suggestions and plans always uses acolyte, and
marking answers always uses mage, whatever the picker says

a chat stays on one model while its subject and choice stay the same, since claude's cache only works
within one model
"""

from dataclasses import dataclass

from .config import settings
from .modes import modes, runs_code

# subjects where answers are worked problems, where a stronger model makes fewer slips
deep_subjects = {"maths", "science", "coding"}

# what the picker shows, in order, archmage only for the admin
choices = [
    {"id": "auto", "name": "Auto", "word": "Rahah picks", "hint": "Acolyte for everyday questions, Mage for maths, science and code"},
    {"id": "acolyte", "name": "Acolyte", "word": "Quick", "hint": "Quick answers for everyday questions"},
    {"id": "mage", "name": "Mage", "word": "Careful", "hint": "Careful thinking for maths, science, code and essays"},
    {"id": "archmage", "name": "Archmage", "word": "Deepest", "hint": "The deepest thinking, for the hardest problems", "admin": True},
]
choice_ids = {c["id"] for c in choices}


@dataclass(frozen=True)
class route:
    model: str
    effort: str
    tier: str  # acolyte, mage or archmage, shown on the answer


def model_for(cfg: settings, tier: str) -> str:
    # with a single model set, everything uses it, handy for cheap testing
    if cfg.model:
        return cfg.model
    return {"acolyte": cfg.light_model, "mage": cfg.deep_model, "archmage": cfg.top_model}[tier]


def pick(cfg: settings, work: str) -> route:
    """the model for work that doesn't follow the picker, tools makes study material and marking marks answers"""
    tier = "mage" if work == "marking" else "acolyte"
    # making and marking things gets a bit more thought, they're checked once and kept
    return route(model_for(cfg, tier), "high", tier)


def chat_tier(choice: str, mode: str, code_ran: bool) -> str:
    """the tier for a chat answer, the student's choice, or on auto, mage for hard subjects and a chat where code ran"""
    if choice in ("acolyte", "mage", "archmage"):
        return choice
    if code_ran or mode in deep_subjects or (mode in modes and runs_code(mode)):
        return "mage"
    return "acolyte"


def chat_route(cfg: settings, choice: str, mode: str, code_ran: bool) -> route:
    tier = chat_tier(choice, mode, code_ran)
    return route(model_for(cfg, tier), cfg.effort, tier)


def choices_for(is_admin: bool) -> list[dict]:
    return [{k: v for k, v in c.items() if k != "admin"} for c in choices if is_admin or not c.get("admin")]
