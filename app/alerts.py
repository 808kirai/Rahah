"""emails the admin when something goes wrong on the server, gathered up so a bad half hour is one email"""

import logging
import time


class alert_box:
    def __init__(self, send, every: float = 1800, keep: int = 40):
        # send(subject, text) delivers the email
        self.send = send
        self.every = every
        self.keep = keep
        self.pending: list[str] = []
        self.dropped = 0
        self.last_sent = 0.0

    def add(self, text: str) -> None:
        if len(self.pending) >= self.keep:
            self.dropped += 1
            return
        self.pending.append(f"{time.strftime('%Y-%m-%d %H:%M:%S', time.gmtime())} UTC  {text}")

    def due(self) -> bool:
        return bool(self.pending) and time.time() - self.last_sent >= self.every

    def flush(self) -> bool:
        """sends what's gathered if there is any and the last email was long enough ago"""
        if not self.due():
            return False
        lines, dropped = self.pending, self.dropped
        self.pending, self.dropped, self.last_sent = [], 0, time.time()
        count = len(lines) + dropped
        text = "\n\n".join(lines)
        if dropped:
            text += f"\n\nand {dropped} more like these."
        text += "\n\nThe full details are in Rahah's logs on Render, under Logs."
        try:
            self.send(f"Rahah: {count} problem{'s' if count != 1 else ''} on the server", text)
        except Exception as error:
            # printed rather than logged, so a broken email can't keep making alerts about itself
            print(f"couldn't send the alert email: {error}")
        return True


class alert_handler(logging.Handler):
    """passes warnings and errors from rahah's own log into the alert box"""

    def __init__(self, box: alert_box):
        super().__init__(level=logging.WARNING)
        self.box = box

    def emit(self, record: logging.LogRecord) -> None:
        try:
            text = record.getMessage()
            if record.exc_info and record.exc_info[1] is not None:
                text += f"\n    {type(record.exc_info[1]).__name__}: {record.exc_info[1]}"
            self.box.add(text[:2000])
        except Exception:
            pass
