"""everything that talks to claude, the prompt, request building and streaming"""

from typing import AsyncIterator

from .config import settings
from .modes import modes
from .store import stored_file

base_prompt = """You are Rahah, a study companion for students. You help people understand things, \
not just get answers: explain ideas clearly, match the student's level, and check their \
understanding when it helps. You can help with any subject, with code, and with documents \
the student uploads.

When the student attaches documents, base your answer on them and cite the parts you use. \
If the documents don't cover the question, say so before answering from general knowledge.

Format answers in Markdown. Write maths in LaTeX using \\( ... \\) inline and \\[ ... \\] for \
display, never with dollar signs, since dollar signs are kept for money. Name the language \
on every code block.

If someone asks what you are, you are Rahah, built on Claude by Anthropic."""

fallback_beta = "server-side-fallback-2026-07-01"
marker_open, marker_close = "⟦", "⟧"


def mode_note(mode: str) -> dict:
    # sent as a mid conversation system message, so changing mode keeps the cached history
    return {"role": "system", "content": modes[mode]["instruction"]}


def user_content(text: str, files: list[stored_file]) -> list[dict]:
    # documents go before the question, which is where claude reads them best
    blocks = []
    for f in files:
        if f.kind == "document":
            blocks.append({
                "type": "document",
                "source": {"type": "file", "file_id": f.id},
                "title": f.name,
                "citations": {"enabled": True},
            })
        else:
            blocks.append({"type": "image", "source": {"type": "file", "file_id": f.id}})
    blocks.append({"type": "text", "text": text})
    return blocks


def history_blocks(content: list) -> list[dict]:
    """turn claude's reply into blocks that can be sent back next turn

    blocks are kept as returned with two exceptions
    citations are taken off text blocks, because the api rejects page citations into
    files api documents when they are sent back, the page keeps its own copy for display
    after a mid answer fallback only text survives from before the last fallback marker,
    as the api requires
    """
    blocks = [b.to_dict(mode="json") for b in content]
    for b in blocks:
        if b.get("type") == "text":
            b.pop("citations", None)
    last_fallback = max((i for i, b in enumerate(blocks) if b.get("type") == "fallback"), default=-1)
    return [
        b for i, b in enumerate(blocks)
        if i >= last_fallback or b.get("type") in ("text", "fallback")
    ]


class citation_list:
    """numbers each distinct source once per answer, in the order they first appear"""

    def __init__(self):
        self.sources: list[dict] = []
        self._numbers: dict[tuple, int] = {}

    def add(self, citation) -> tuple[int, dict | None]:
        source = describe_citation(citation)
        key = (source["title"], source["where"], source["quote"])
        if key in self._numbers:
            return self._numbers[key], None
        source["n"] = len(self.sources) + 1
        self._numbers[key] = source["n"]
        self.sources.append(source)
        return source["n"], source

    def marks_for(self, citations) -> tuple[str, list[dict]]:
        # the marker text to put after a cited block, plus any sources seen for the first time
        numbers, new = [], []
        for c in citations or []:
            n, source = self.add(c)
            if n not in numbers:
                numbers.append(n)
            if source:
                new.append(source)
        return "".join(f"{marker_open}{n}{marker_close}" for n in numbers), new


def describe_citation(citation) -> dict:
    where = ""
    start = getattr(citation, "start_page_number", None)
    end = getattr(citation, "end_page_number", None)
    if start is not None:
        # end_page_number is exclusive
        last = max(start, (end or start + 1) - 1)
        where = f"p. {start}" if last == start else f"pp. {start}–{last}"
    return {
        "title": getattr(citation, "document_title", None) or "Document",
        "where": where,
        "quote": (getattr(citation, "cited_text", "") or "").strip(),
    }


def display_from_content(content) -> dict:
    # rebuilds the text and sources the page showed while streaming
    cites = citation_list()
    parts = []
    for block in content:
        if block.type == "text":
            marks, _ = cites.marks_for(getattr(block, "citations", None))
            parts.append(block.text + marks)
    return {"text": "".join(parts), "sources": cites.sources}


async def stream_reply(client, cfg: settings, messages: list[dict]) -> AsyncIterator[dict]:
    """streams one answer as small events for the page, then a final event with the full message

    events are text, cite, and final
    """
    cites = citation_list()
    options = {}
    # haiku has no fallback model, so the retry setting is only sent to the bigger models
    if not cfg.model.startswith("claude-haiku"):
        options = {"fallbacks": "default", "betas": [fallback_beta]}
    async with client.beta.messages.stream(
        model=cfg.model,
        max_tokens=cfg.max_tokens,
        system=base_prompt,
        messages=messages,
        output_config={"effort": cfg.effort},
        cache_control={"type": "ephemeral"},
        **options,
    ) as stream:
        async for event in stream:
            if event.type == "text":
                yield {"t": "text", "v": event.text}
            elif event.type == "content_block_stop" and event.content_block.type == "text":
                marks, new = cites.marks_for(getattr(event.content_block, "citations", None))
                if marks:
                    yield {"t": "cite", "v": {"marks": marks, "sources": new}}
        final = await stream.get_final_message()
    yield {"t": "final", "v": final}
