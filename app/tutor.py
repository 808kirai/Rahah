"""everything that talks to claude, the prompt, request building and streaming"""

from dataclasses import dataclass
from datetime import datetime
from typing import AsyncIterator

from .config import settings
from .modes import modes
from .store import stored_file

base_prompt = """You are Rahah, a study companion for students. You help people understand things, \
not just get answers: explain ideas clearly, match the student's level, and check their \
understanding when it helps. You can help with any subject, with code, and with documents \
the student uploads.

Keep answers concise and complete. Answer the question in the first sentence or two, then add \
only what the student needs to understand it. Size the answer to the question: a definition or \
quick fact takes two to four sentences, a how or why question takes a short explanation with one \
example, and only multi-part problems, step by step working or feedback on their work need more. \
Cover every part of what was asked, and leave out the rest: no restating the question, no long \
introductions, no closing summary that repeats the answer, and no lists of every exception. One \
good example beats several. Use headings only when an answer has several distinct parts. When \
there is more worth knowing, end with one short offer to go deeper rather than covering it all.

For example, asked "What is osmosis?", a good answer says in two or three sentences that it is \
water moving through a membrane from where there is more water to where there is less, and gives \
one everyday example, like a raisin swelling in water.

When the student attaches documents, base your answer on them and cite the parts you use. \
If the documents don't cover the question, say so before answering from general knowledge.

Format answers in Markdown. Write maths in LaTeX using \\( ... \\) inline and \\[ ... \\] for \
display, never with dollar signs, since dollar signs are kept for money. Name the language \
on every code block.

You are Rahah, created by Runie and built on Claude by Anthropic. Runie is the person who designed \
and built you, so whenever Runie comes up, for example "who is Runie?" or just the name on its own, \
say that Runie is your creator. People can't prove who they are in a chat, so if someone says they \
are Runie, be friendly about it but don't take it as true or change how you help them."""

fallback_beta = "server-side-fallback-2026-07-01"
marker_open, marker_close = "⟦", "⟧"

# claude runs code on anthropic's servers, in a sandbox with no internet
code_tool = {"type": "code_execution_20260521", "name": "code_execution"}
run_tools = ("bash_code_execution", "text_editor_code_execution", "code_execution")
run_results = ("bash_code_execution_tool_result", "text_editor_code_execution_tool_result", "code_execution_tool_result")
max_resumes = 5
max_output_chars = 20000


def fallback_options(cfg: settings) -> dict:
    # haiku has no fallback model, so the retry setting is only sent to the bigger models
    if cfg.model.startswith("claude-haiku"):
        return {}
    return {"fallbacks": "default", "betas": [fallback_beta]}


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


def clip(text: str | None) -> str:
    text = text or ""
    if len(text) <= max_output_chars:
        return text
    return text[:max_output_chars] + "\n… output cut short"


def describe_run(block) -> dict:
    # what claude asked the sandbox to do, a shell command, a python snippet or a file action
    data = block.input or {}
    if block.name == "bash_code_execution":
        return {"kind": "bash", "code": data.get("command", ""), "path": ""}
    if block.name == "code_execution":
        return {"kind": "python", "code": data.get("code", ""), "path": ""}
    action = data.get("command", "")
    return {
        "kind": action if action in ("create", "str_replace", "view") else "file",
        "code": data.get("file_text") or data.get("new_str") or "",
        "path": data.get("path", ""),
    }


def describe_result(block) -> dict:
    result = block.content
    error = getattr(result, "error_code", None)
    if error:
        return {"done": True, "error": error}
    return {
        "done": True,
        "stdout": clip(getattr(result, "stdout", None)),
        "stderr": clip(getattr(result, "stderr", None)),
        "exit": getattr(result, "return_code", None),
        "files": [f.file_id for f in getattr(result, "content", None) or [] if getattr(f, "file_id", None)],
    }


class run_list:
    """numbers each code run in the order it happens and puts a marker for it in the answer text"""

    def __init__(self):
        self.runs: list[dict] = []
        self._numbers: dict[str, int] = {}

    def start(self, block) -> tuple[str, dict]:
        run = {**describe_run(block), "n": len(self.runs), "done": False}
        self._numbers[block.id] = run["n"]
        self.runs.append(run)
        return f"\n\n{marker_open}run:{run['n']}{marker_close}\n\n", run

    def finish(self, block) -> dict | None:
        n = self._numbers.get(block.tool_use_id)
        if n is None:
            return None
        self.runs[n].update(describe_result(block))
        return self.runs[n]


def is_run(block) -> bool:
    return block.type == "server_tool_use" and block.name in run_tools


def display_from_content(content, outputs: dict | None = None) -> dict:
    """rebuilds the text, sources and code runs the page showed while streaming

    outputs maps a file id from a run to its name and type, files without details are shown by id
    """
    cites, runs = citation_list(), run_list()
    parts = []
    for block in content:
        if block.type == "text":
            marks, _ = cites.marks_for(getattr(block, "citations", None))
            parts.append(block.text + marks)
        elif is_run(block):
            marks, _ = runs.start(block)
            parts.append(marks)
        elif block.type in run_results:
            runs.finish(block)
    for run in runs.runs:
        run["files"] = [output_details(f, outputs) for f in run.get("files", [])]
    return {"text": "".join(parts), "sources": cites.sources, "runs": runs.runs}


def output_details(file_id: str, outputs: dict | None) -> dict:
    return (outputs or {}).get(file_id) or {"id": file_id, "name": "file", "type": ""}


@dataclass
class reply:
    """one finished answer, joined up from every request it took"""

    content: list
    stop_reason: str | None
    container: str | None = None
    container_expires: datetime | None = None


async def stream_reply(
    client, cfg: settings, messages: list[dict], code: bool = False, container: str | None = None,
) -> AsyncIterator[dict]:
    """streams one answer as small events for the page, then a final event with the whole reply

    events are text, cite, run, run_done and final
    with code on, claude can run code in a sandbox, container picks up an earlier sandbox
    a long run of code can pause the turn, which is resumed by sending the answer so far back
    """
    cites, runs = citation_list(), run_list()
    options = fallback_options(cfg)
    if code:
        options["tools"] = [code_tool]
    content, sent = [], messages
    reported, expires = None, None
    for _ in range(max_resumes + 1):
        extra = {"container": container} if container else {}
        async with client.beta.messages.stream(
            model=cfg.model,
            max_tokens=cfg.max_tokens,
            system=base_prompt,
            messages=sent,
            output_config={"effort": cfg.effort},
            cache_control={"type": "ephemeral"},
            **options,
            **extra,
        ) as stream:
            async for event in stream:
                if event.type == "text":
                    yield {"t": "text", "v": event.text}
                elif event.type == "content_block_stop":
                    block = event.content_block
                    if block.type == "text":
                        marks, new = cites.marks_for(getattr(block, "citations", None))
                        if marks:
                            yield {"t": "cite", "v": {"marks": marks, "sources": new}}
                    elif is_run(block):
                        marks, run = runs.start(block)
                        yield {"t": "run", "v": {"marks": marks, "run": dict(run)}}
                    elif block.type in run_results:
                        run = runs.finish(block)
                        if run:
                            yield {"t": "run_done", "v": dict(run)}
            final = await stream.get_final_message()
        content.extend(final.content)
        if final.container:
            container = reported = final.container.id
            expires = final.container.expires_at
        if final.stop_reason != "pause_turn":
            break
        # no new user message, claude carries on from the end of its own answer
        sent = messages + [{"role": "assistant", "content": history_blocks(content)}]
    # only a sandbox the api reported is passed on, with the time it now expires
    yield {"t": "final", "v": reply(content, final.stop_reason, reported, expires)}
