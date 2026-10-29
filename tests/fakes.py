"""a stand in for the anthropic client, built from the sdk's own types so shapes stay real"""

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from anthropic.types.beta import (
    BetaBashCodeExecutionToolResultBlock,
    BetaCitationPageLocation,
    BetaCitationsWebSearchResultLocation,
    BetaContainer,
    BetaMessage,
    BetaServerToolUseBlock,
    BetaTextBlock,
    BetaThinkingBlock,
    BetaUsage,
    BetaWebSearchToolResultBlock,
)


def text_block(text, citations=None):
    return BetaTextBlock(type="text", text=text, citations=citations)


def page_citation(quote, start, end, title="notes.pdf", index=0):
    return BetaCitationPageLocation(
        type="page_location", cited_text=quote, document_index=index,
        document_title=title, start_page_number=start, end_page_number=end,
    )


def search_block(query, search_id="srvtoolu_web"):
    return BetaServerToolUseBlock.model_validate({
        "type": "server_tool_use", "id": search_id, "name": "web_search", "input": {"query": query},
    })


def search_result(url, title, search_id="srvtoolu_web"):
    return BetaWebSearchToolResultBlock.model_validate({
        "type": "web_search_tool_result", "tool_use_id": search_id,
        "content": [{"type": "web_search_result", "url": url, "title": title, "encrypted_content": "enc", "page_age": None}],
    })


def web_citation(quote, url, title):
    return BetaCitationsWebSearchResultLocation(
        type="web_search_result_location", cited_text=quote, url=url, title=title, encrypted_index="idx",
    )


class stopped_stream:
    """streams some text, then is cut off the way the page going away cancels it"""

    def __init__(self, text):
        self.text = text

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    def __aiter__(self):
        return self._events()

    async def _events(self):
        import asyncio
        yield SimpleNamespace(type="text", text=self.text)
        raise asyncio.CancelledError()


def thinking_block():
    return BetaThinkingBlock(type="thinking", thinking="", signature="sig123")


def run_block(command, run_id="srvtoolu_1"):
    return BetaServerToolUseBlock.model_validate({
        "type": "server_tool_use", "id": run_id, "name": "bash_code_execution", "input": {"command": command},
    })


def run_result(stdout, run_id="srvtoolu_1", exit_code=0, stderr="", files=()):
    return BetaBashCodeExecutionToolResultBlock.model_validate({
        "type": "bash_code_execution_tool_result",
        "tool_use_id": run_id,
        "content": {
            "type": "bash_code_execution_result", "stdout": stdout, "stderr": stderr, "return_code": exit_code,
            "content": [{"type": "bash_code_execution_output", "file_id": f} for f in files],
        },
    })


def message(content, stop_reason="end_turn", container=None, expires_in=timedelta(hours=1)):
    sandbox = None
    if container:
        sandbox = BetaContainer(id=container, expires_at=datetime.now(timezone.utc) + expires_in)
    return BetaMessage(
        id="msg_1", type="message", role="assistant", model="claude-opus-5-5",
        content=content, stop_reason=stop_reason, stop_sequence=None, container=sandbox,
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
        if isinstance(reply, stopped_stream):
            return reply
        return fake_stream(reply)


class fake_download:
    def __init__(self, data):
        self.data = data

    async def read(self):
        return self.data


class fake_files:
    def __init__(self):
        self.uploads = []
        self.deleted = []
        # files that code runs made, by id, each (filename, mime type)
        self.made = {}

    async def upload(self, file):
        self.uploads.append(file)
        return SimpleNamespace(id=f"file_{len(self.uploads)}")

    async def retrieve_metadata(self, file_id):
        name, mime_type = self.made[file_id]
        return SimpleNamespace(id=file_id, filename=name, mime_type=mime_type)

    async def download(self, file_id):
        return fake_download(f"bytes of {file_id}".encode())

    async def delete(self, file_id):
        self.deleted.append(file_id)


class fake_client:
    def __init__(self, replies=()):
        self.beta = SimpleNamespace(messages=fake_messages(replies))
        self.files = fake_files()
