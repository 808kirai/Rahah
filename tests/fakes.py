"""a stand in for the anthropic client, built from the sdk's own types so shapes stay real"""

from types import SimpleNamespace

from anthropic.types.beta import (
    BetaCitationPageLocation,
    BetaMessage,
    BetaTextBlock,
    BetaThinkingBlock,
    BetaUsage,
)


def text_block(text, citations=None):
    return BetaTextBlock(type="text", text=text, citations=citations)


def page_citation(quote, start, end, title="notes.pdf", index=0):
    return BetaCitationPageLocation(
        type="page_location", cited_text=quote, document_index=index,
        document_title=title, start_page_number=start, end_page_number=end,
    )


def thinking_block():
    return BetaThinkingBlock(type="thinking", thinking="", signature="sig123")


def message(content, stop_reason="end_turn"):
    return BetaMessage(
        id="msg_1", type="message", role="assistant", model="claude-opus-5-5",
        content=content, stop_reason=stop_reason, stop_sequence=None,
        usage=BetaUsage(input_tokens=10, output_tokens=20),
    )


class fake_stream:
    def __init__(self, final):
        self.final = final

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    def __aiter__(self):
        return self._events()

    async def _events(self):
        for block in self.final.content:
            if block.type == "text":
                # split the text so the page gets more than one delta
                half = len(block.text) // 2
                for piece in (block.text[:half], block.text[half:]):
                    if piece:
                        yield SimpleNamespace(type="text", text=piece)
            yield SimpleNamespace(type="content_block_stop", content_block=block)

    async def get_final_message(self):
        return self.final


class fake_messages:
    def __init__(self, replies):
        self.replies = list(replies)
        self.calls = []

    def stream(self, **kwargs):
        self.calls.append(kwargs)
        reply = self.replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        return fake_stream(reply)


class fake_files:
    def __init__(self):
        self.uploads = []

    async def upload(self, file):
        self.uploads.append(file)
        return SimpleNamespace(id=f"file_{len(self.uploads)}")


class fake_client:
    def __init__(self, replies=()):
        self.beta = SimpleNamespace(messages=fake_messages(replies))
        self.files = fake_files()
