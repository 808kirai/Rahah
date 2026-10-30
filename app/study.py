"""flashcards and tests, made by claude as structured json and checked before they are saved,
and written answers marked by claude against the question's mark scheme"""

import base64
import json
import random
import re
from dataclasses import dataclass

from .config import settings
from .modes import modes
from .routing import pick
from .tutor import fallback_options
from .usage import usage_of

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
                    "type": {"type": "string", "enum": ["choice", "written"]},
                    "question": {"type": "string"},
                    "options": {"type": "array", "items": {"type": "string"}},
                    "answer": {"type": "integer"},
                    "explanation": {"type": "string"},
                    "marks": {"type": "integer"},
                    "mark_scheme": {"type": "string"},
                    "model_answer": {"type": "string"},
                },
                "required": ["type", "question", "options", "answer", "explanation", "marks", "mark_scheme", "model_answer"],
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
        "ask": "{style}",
    },
}

choice_rule = (
    "A multiple choice question has type choice, four options with exactly one correct, the index of the "
    "correct option in answer counting from 0, and plausible wrong options. Its explanation says in one or "
    "two sentences why the answer is right. Set its marks to 1 and leave mark_scheme and model_answer empty."
)
written_rule = (
    "A written question has type written and is answered in a sentence, a paragraph or worked steps, like a "
    "short answer or structured exam question. Set its options to an empty list, answer to -1 and leave "
    "explanation empty. Give it marks from 1 to 6 to suit its size, a mark_scheme listing the points that each "
    "earn a mark, and a model_answer that would get full marks. In maths and science, questions that need "
    "working are good, the student can send a photo of it."
)

# what kind of questions a test has, picked when it's made
styles = {
    "choice": f"Write exactly {{count}} multiple choice questions. {choice_rule}",
    "written": f"Write exactly {{count}} written questions. {written_rule}",
    "mixed": (
        f"Write exactly {{count}} questions, about half multiple choice and half written, mixed through the test. "
        f"{choice_rule} {written_rule}"
    ),
    # a real exam paper turned into a test, its own questions in its own order
    "paper": (
        "The attached notes are a past exam paper. Turn its questions into this test, at most {count} of them, "
        "in the paper's order, keeping each question's wording and any data or diagrams it describes. A question "
        f"the paper gives options for becomes a choice question. {choice_rule} Every other question becomes a "
        "written question worth the marks the paper gives it, or your best estimate when it gives none, with a "
        "mark_scheme listing the points that each earn a mark and a model_answer that would get full marks. Set its "
        "options to an empty list, answer to -1 and leave explanation empty. Give the test the paper's subject and "
        "year as its title when the paper shows them."
    ),
}

max_items = 25


class study_error(Exception):
    """a problem with the material itself, the message is shown to the student as it is"""


@dataclass
class upload:
    name: str
    media_type: str
    kind: str
    data: bytes = b""
    file_id: str = ""  # a note from the library, already kept with claude


def source_blocks(uploads: list[upload]) -> list[dict]:
    # notes are sent inline, since a set is made once and never replayed
    blocks = []
    for u in uploads:
        if u.file_id:
            block_type = "document" if u.kind == "document" else "image"
            block = {"type": block_type, "source": {"type": "file", "file_id": u.file_id}}
            if block_type == "document":
                block["title"] = u.name
            blocks.append(block)
        elif u.media_type == "text/plain":
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


def request_text(kind: str, topic: str, count: int, mode: str, has_notes: bool, style: str = "choice", language: str = "") -> str:
    ask = styles[style] if kind == "quiz" else kinds[kind]["ask"]
    parts = [modes[mode]["instruction"], ask.format(count=count)]
    if topic and has_notes:
        parts.append(f"Use the attached notes and focus on: {topic}")
    elif topic:
        parts.append(f"Topic: {topic}")
    else:
        parts.append("Use the attached notes.")
    parts.append("Give the set a short title of a few words.")
    if language:
        parts.append(f"Write the whole set, title included, in {language}. Keep formulas and symbols as they are.")
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


def clean_written(q: dict) -> dict | None:
    question, scheme, model = clean_text(q.get("question")), clean_text(q.get("mark_scheme")), clean_text(q.get("model_answer"))
    marks = q.get("marks")
    if not question or not scheme or not model or not isinstance(marks, int):
        return None
    # exam papers can give a long question many marks, so up to 20 are kept
    return {"type": "written", "question": question, "marks": max(1, min(marks, 20)), "mark_scheme": scheme, "model_answer": model}


def question_marks(item: dict) -> int:
    # a multiple choice question is worth one mark, a written one what its mark scheme says
    return item["marks"] if item.get("type") == "written" else 1


def total_marks(items: list[dict]) -> int:
    return sum(question_marks(i) for i in items)


def clean_quiz(data: dict, count: int) -> list[dict]:
    questions = []
    for q in data.get("questions", []):
        if q.get("type") == "written":
            written = clean_written(q)
            if written:
                questions.append(written)
            continue
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
            "type": "choice",
            "question": question,
            "options": options,
            "answer": options.index(right),
            "explanation": clean_text(q.get("explanation")),
        })
    return questions[:count]


async def make_set(
    client, cfg: settings, kind: str, topic: str, count: int, mode: str, uploads: list[upload], style: str = "choice",
    on_usage=None, language: str = "",
) -> dict:
    """asks claude for a set and returns its title and checked items"""
    text = request_text(kind, topic, count, mode, bool(uploads), style, language)
    content = source_blocks(uploads) + [{"type": "text", "text": text}]
    use = pick(cfg, "tools")
    async with client.beta.messages.stream(
        model=use.model,
        max_tokens=cfg.max_tokens,
        system=study_prompt,
        messages=[{"role": "user", "content": content}],
        output_config={"effort": use.effort, "format": {"type": "json_schema", "schema": kinds[kind]["schema"]}},
        **fallback_options(use.model),
    ) as stream:
        final = await stream.get_final_message()
    if on_usage:
        on_usage(usage_of(final))

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
    title = clean_text(data.get("title"))[:80] or topic[:60] or ("Flashcards" if kind == "flashcards" else "Test")
    return {"title": title, "items": items}


# marking a written answer, typed, spoken or a photo of working, against the question's mark scheme

mark_prompt = """You mark students' answers as part of Rahah, a study companion built on Claude by \
Anthropic. Mark fairly and the way an examiner would, using the mark scheme: award a mark for each \
point the answer makes correctly, even in different words, and give no marks for points it misses or \
gets wrong. An answer may be typed, spoken and turned into text, so ignore small slips in wording from \
that, or a photo of handwritten working, so read it carefully and credit correct working. If the photo \
is unreadable or doesn't answer the question, say so and give 0. Write the feedback to the student as \
you, in two to four short sentences: what earned marks, what was missing, and one tip to get full \
marks. Write maths in LaTeX using \\( ... \\) inline, never with dollar signs."""

mark_schema = {
    "type": "object",
    "properties": {"score": {"type": "integer"}, "feedback": {"type": "string"}},
    "required": ["score", "feedback"],
    "additionalProperties": False,
}


async def mark_answer(client, cfg: settings, item: dict, mode: str, answer: str, photo: upload | None, on_usage=None) -> dict:
    """marks one written answer and returns its score, clamped to the question's marks, and feedback"""
    lines = [
        modes[mode]["instruction"],
        f"Question, worth {item['marks']} marks:\n{item['question']}",
        f"Mark scheme:\n{item['mark_scheme']}",
        f"A model answer:\n{item['model_answer']}",
        f"The student's answer:\n{answer}" if answer else "The student's answer is in the photo.",
    ]
    if answer and photo:
        lines.append("The photo shows their working.")
    content = (source_blocks([photo]) if photo else []) + [{"type": "text", "text": "\n\n".join(lines)}]
    use = pick(cfg, "marking")
    async with client.beta.messages.stream(
        model=use.model,
        max_tokens=4000,
        system=mark_prompt,
        messages=[{"role": "user", "content": content}],
        output_config={"effort": use.effort, "format": {"type": "json_schema", "schema": mark_schema}},
        **fallback_options(use.model),
    ) as stream:
        final = await stream.get_final_message()
    if on_usage:
        on_usage(usage_of(final))

    if final.stop_reason == "refusal":
        raise study_error("Rahah can't mark that answer. Try rewording it.")
    text = "".join(b.text for b in final.content if b.type == "text")
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        raise study_error("Something went wrong marking that. Try again.")
    score = data.get("score") if isinstance(data.get("score"), int) else 0
    return {
        "score": max(0, min(score, item["marks"])),
        "marks": item["marks"],
        "feedback": clean_text(data.get("feedback")) or "Marked.",
        "model_answer": item["model_answer"],
    }
