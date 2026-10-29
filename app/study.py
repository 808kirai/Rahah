"""flashcards and quizzes, made by claude as structured json and checked before they are saved"""

import base64
import json
import random
import re
from dataclasses import dataclass

from .config import settings
from .modes import modes
from .tutor import fallback_options

study_prompt = """You make study material for students as part of Rahah, a study companion built on \
Claude by Anthropic. Everything you write must be accurate, clear and pitched at the student's level. \
When the student gives notes, base the material on them and stay within what they cover. Write maths \
in LaTeX using \\( ... \\) inline and \\[ ... \\] for display, never with dollar signs. Keep every \
field short enough to read at a glance."""

card_schema = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "cards": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"front": {"type": "string"}, "back": {"type": "string"}},
                "required": ["front", "back"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["title", "cards"],
    "additionalProperties": False,
}

quiz_schema = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "questions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "question": {"type": "string"},
                    "options": {"type": "array", "items": {"type": "string"}},
                    "answer": {"type": "integer"},
                    "explanation": {"type": "string"},
                },
                "required": ["question", "options", "answer", "explanation"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["title", "questions"],
    "additionalProperties": False,
}

kinds = {
    "flashcards": {
        "schema": card_schema,
        "ask": (
            "Make exactly {count} flashcards. Put one question, term or prompt on the front and a "
            "short, complete answer on the back. Cover the most important ideas first and don't repeat a card."
        ),
    },
    "quiz": {
        "schema": quiz_schema,
        "ask": (
            "Write exactly {count} multiple choice questions. Give each one four options with exactly one "
            "correct, put the index of the correct option in answer, counting from 0, and make the wrong "
            "options plausible. The explanation says in one or two sentences why the answer is right."
        ),
    },
}

max_items = 25


class study_error(Exception):
    """a problem with the material itself, the message is shown to the student as it is"""


@dataclass
class upload:
    name: str
    media_type: str
    kind: str
    data: bytes


def source_blocks(uploads: list[upload]) -> list[dict]:
    # notes are sent inline, since a set is made once and never replayed
    blocks = []
    for u in uploads:
        if u.media_type == "text/plain":
            source = {"type": "text", "media_type": "text/plain", "data": u.data.decode("utf-8")}
            blocks.append({"type": "document", "source": source, "title": u.name})
        else:
            source = {"type": "base64", "media_type": u.media_type, "data": base64.standard_b64encode(u.data).decode()}
            block_type = "document" if u.kind == "document" else "image"
            block = {"type": block_type, "source": source}
            if block_type == "document":
                block["title"] = u.name
            blocks.append(block)
    return blocks


def request_text(kind: str, topic: str, count: int, mode: str, has_notes: bool) -> str:
    parts = [modes[mode]["instruction"], kinds[kind]["ask"].format(count=count)]
    if topic and has_notes:
        parts.append(f"Use the attached notes and focus on: {topic}")
    elif topic:
        parts.append(f"Topic: {topic}")
    else:
        parts.append("Use the attached notes.")
    parts.append("Give the set a short title of a few words.")
    return "\n\n".join(parts)


doubled_math = re.compile(r"\\\\[(\[]")


def clean_text(value) -> str:
    if not isinstance(value, str):
        return ""
    # inside json claude sometimes escapes latex twice, which would show \\( on the page
    if doubled_math.search(value):
        value = value.replace("\\\\", "\\")
    return value.strip()


def clean_cards(data: dict, count: int) -> list[dict]:
    cards = []
    for card in data.get("cards", []):
        front, back = clean_text(card.get("front")), clean_text(card.get("back"))
        if front and back:
            cards.append({"front": front, "back": back})
    return cards[:count]


def clean_quiz(data: dict, count: int) -> list[dict]:
    questions = []
    for q in data.get("questions", []):
        question = clean_text(q.get("question"))
        options = [clean_text(o) for o in q.get("options", [])]
        answer = q.get("answer")
        if not question or not 2 <= len(options) <= 6 or not all(options) or len(set(options)) != len(options):
            continue
        if not isinstance(answer, int) or not 0 <= answer < len(options):
            continue
        # shuffled so the right answer isn't always in the same place
        right = options[answer]
        random.shuffle(options)
        questions.append({
            "question": question,
            "options": options,
            "answer": options.index(right),
            "explanation": clean_text(q.get("explanation")),
        })
    return questions[:count]


async def make_set(client, cfg: settings, kind: str, topic: str, count: int, mode: str, uploads: list[upload]) -> dict:
    """asks claude for a set and returns its title and checked items"""
    content = source_blocks(uploads) + [{"type": "text", "text": request_text(kind, topic, count, mode, bool(uploads))}]
    async with client.beta.messages.stream(
        model=cfg.model,
        max_tokens=cfg.max_tokens,
        system=study_prompt,
        messages=[{"role": "user", "content": content}],
        output_config={"effort": cfg.effort, "format": {"type": "json_schema", "schema": kinds[kind]["schema"]}},
        **fallback_options(cfg),
    ) as stream:
        final = await stream.get_final_message()

    if final.stop_reason == "refusal":
        raise study_error("Rahah can't make study material on that. Try a different topic.")
    if final.stop_reason == "max_tokens":
        raise study_error("That was too much to make in one go. Try a smaller number.")
    text = "".join(b.text for b in final.content if b.type == "text")
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        raise study_error("Something went wrong making that. Try again.")

    items = clean_cards(data, count) if kind == "flashcards" else clean_quiz(data, count)
    if not items:
        raise study_error("Rahah couldn't make questions on that. Try again or change the topic.")
    title = clean_text(data.get("title"))[:80] or topic[:60] or ("Flashcards" if kind == "flashcards" else "Quiz")
    return {"title": title, "items": items}
