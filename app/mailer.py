"""sending email, for password reset links, backups and alerts, through an smtp server, gmail by default"""

import smtplib
import ssl
from email.message import EmailMessage

from .config import settings


def send_email(cfg: settings, to: str, subject: str, text: str, attachment: tuple[str, bytes, str] | None = None) -> None:
    message = EmailMessage()
    # gmail only sends as the account that signed in, replies still go to the help address
    message["From"] = f"Rahah <{cfg.smtp_user}>"
    message["To"] = to
    message["Subject"] = subject
    message["Reply-To"] = cfg.support_email
    message.set_content(text)
    # a file sent along, like the daily backup, given as its name, its bytes and its type
    if attachment:
        name, data, kind = attachment
        main, _, sub = kind.partition("/")
        message.add_attachment(data, maintype=main, subtype=sub or "octet-stream", filename=name)
    context = ssl.create_default_context()
    # port 465 is encrypted from the start, 587 starts plain and switches to encryption
    if cfg.smtp_port == 465:
        with smtplib.SMTP_SSL(cfg.smtp_host, cfg.smtp_port, timeout=60, context=context) as server:
            server.login(cfg.smtp_user, cfg.smtp_password)
            server.send_message(message)
        return
    with smtplib.SMTP(cfg.smtp_host, cfg.smtp_port, timeout=60) as server:
        server.starttls(context=context)
        server.login(cfg.smtp_user, cfg.smtp_password)
        server.send_message(message)
