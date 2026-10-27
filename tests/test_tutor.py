from anthropic.types.beta import BetaFallbackBlock

from app.store import stored_file
from app.tutor import citation_list, display_from_content, history_blocks, user_content

from .fakes import page_citation, text_block, thinking_block


def test_documents_come_before_the_question_with_citations_on():
    files = [
        stored_file("file_a", "c", "notes.pdf", "document", "application/pdf", 10, False),
        stored_file("file_b", "c", "board.png", "image", "image/png", 10, False),
    ]
    blocks = user_content("what is osmosis", files)
    assert [b["type"] for b in blocks] == ["document", "image", "text"]
    assert blocks[0]["citations"] == {"enabled": True}
    assert blocks[0]["title"] == "notes.pdf"
    assert blocks[1]["source"] == {"type": "file", "file_id": "file_b"}


def test_history_keeps_blocks_exactly_as_returned():
    content = [thinking_block(), text_block("hello")]
    blocks = history_blocks(content)
    assert blocks == [
        {"type": "thinking", "thinking": "", "signature": "sig123"},
        {"type": "text", "text": "hello", "citations": None},
    ]


def test_history_drops_non_text_blocks_before_a_mid_answer_fallback():
    fallback = BetaFallbackBlock.model_validate({
        "type": "fallback",
        "from": {"model": "claude-opus-5-5"},
        "to": {"model": "claude-opus-4-8"},
        "trigger": {"type": "refusal"},
    })
    content = [thinking_block(), text_block("part one"), fallback, thinking_block(), text_block("part two")]
    kinds = [b["type"] for b in history_blocks(content)]
    assert kinds == ["text", "fallback", "thinking", "text"]


def test_citations_are_numbered_once_and_pages_read_naturally():
    cites = citation_list()
    one = page_citation("cells need water", 3, 4)
    two = page_citation("membranes", 5, 8)
    marks, new = cites.marks_for([one, two, one])
    assert marks == "⟦1⟧⟦2⟧"
    assert [s["where"] for s in new] == ["p. 3", "pp. 5–7"]
    marks, new = cites.marks_for([one])
    assert marks == "⟦1⟧" and new == []


def test_saved_display_matches_what_was_streamed():
    content = [
        text_block("Osmosis is "),
        text_block("water moving across a membrane", [page_citation("water moves", 2, 3)]),
        text_block("."),
    ]
    display = display_from_content(content)
    assert display["text"] == "Osmosis is water moving across a membrane⟦1⟧."
    assert display["sources"][0]["title"] == "notes.pdf"
