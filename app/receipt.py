"""the receipt a student gets when a purchase goes through: the email's text, and the receipt drawn as a
picture to attach. it's drawn here with pillow in inter, so it looks the same in every email app
"""

from io import BytesIO
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFont

here = Path(__file__).resolve().parent
logo_file = here.parent / "static" / "img" / "icon-192.png"
fonts = {"regular": here / "fonts" / "Inter-Regular.ttf", "semi": here / "fonts" / "Inter-SemiBold.ttf", "bold": here / "fonts" / "Inter-ExtraBold.ttf"}

# what each tier gives, listed on the receipt
perks = {
    "pro": ["10x your daily study limit", "Unlimited Mage", "Unlimited web searches and photo marking", "All your chats, searchable", "A weekly report for a parent"],
    "max": ["20x your daily study limit", "Unlimited Mage", "Unlimited web searches and photo marking", "All your chats, searchable", "500 notes and a Max badge"],
}

# drawn at twice the size it's shown, so it stays sharp on phones
scale = 2
width = 540


def receipt_text(first: str, tier_name: str, plan_name: str, multiplier: int, kes: int, usd: float, runs: str,
                 reference: str, base: str, support: str) -> str:
    return (
        f"Hi {first},\n\nThanks for getting Rahah {tier_name}. Your receipt is attached, and here it is in short:\n\n"
        f"- Plan: {plan_name}, {multiplier}x your daily study limit\n"
        f"- Total: ${usd:.2f} (KES {kes:,})\n"
        f"- Runs: {runs}\n"
        f"- Reference: {reference}\n\n"
        "Nothing renews by itself. Paystack sends its own receipt for the payment.\n\n"
        f"Open Rahah: {base}\nTerms: {base}/terms\nQuestions? Write to {support}.\n\nRahah"
    )


def receipt_image(first: str, tier: str, tier_name: str, plan_name: str, multiplier: int, kes: int, usd: float,
                  runs: str, paid_on: str, reference: str, support: str) -> bytes:
    """the receipt as a png: a navy banner with the logo and thanks, the total and details, then what the plan gives"""
    s = scale
    font = lambda kind, size: ImageFont.truetype(str(fonts[kind]), size * s)
    pad, banner_h = 28, 220
    items = perks.get(tier, perks["pro"])
    height = banner_h + 300 + 46 + 28 * len(items) + 66
    page = Image.new("RGB", (width * s, height * s), "#ffffff")
    draw = ImageDraw.Draw(page)

    # the banner, navy with a faint teal glow in one corner, like the site
    left, right = Image.new("RGB", (width * s, banner_h * s), "#0b1220"), Image.new("RGB", (width * s, banner_h * s), "#0f2a35")
    # across plus down, halved, gives an even fade from one corner to the other
    down = Image.linear_gradient("L").resize((width * s, banner_h * s))
    across = Image.linear_gradient("L").rotate(90).transpose(Image.FLIP_LEFT_RIGHT).resize((width * s, banner_h * s))
    fade = ImageChops.add(across, down, scale=2)
    page.paste(Image.composite(right, left, fade), (0, 0))
    logo = Image.open(logo_file).convert("RGBA")
    small = logo.resize((28 * s, 28 * s), Image.LANCZOS)
    page.paste(small, (pad * s, 26 * s), small)
    draw.text(((pad + 38) * s, 40 * s), "Rahah", font=font("bold", 20), fill="#ffffff", anchor="lm")
    top = font("regular", 12)
    for i, line in enumerate((f"Total: ${usd:.2f}", paid_on)):
        draw.text(((width - pad) * s, (30 + 17 * i) * s), line, font=top, fill="#b6c2d1", anchor="ra")
    draw.text((pad * s, 92 * s), f"Thanks for getting {tier_name},", font=font("bold", 28), fill="#ffffff")
    draw.text((pad * s, 128 * s), first, font=font("bold", 28), fill="#ffffff")
    draw.text((pad * s, 176 * s), f"Your study time just went up {multiplier}x.", font=font("regular", 15), fill="#c9d6e3")
    big = logo.resize((80 * s, 80 * s), Image.LANCZOS)
    page.paste(big, ((width - pad - 80) * s, (banner_h - 104) * s), big)

    # the total, then the details
    y = banner_h + 30
    draw.text((pad * s, y * s), "Total", font=font("bold", 26), fill="#101828")
    draw.text(((width - pad) * s, y * s), f"${usd:.2f}", font=font("bold", 26), fill="#101828", anchor="ra")
    y += 52
    draw.line((pad * s, y * s, (width - pad) * s, y * s), fill="#e4e7ec", width=s)
    y += 16
    for label, value, strong in (("Plan", plan_name, False), ("Daily study limit", f"{multiplier}x", False), ("Runs", runs, False),
                                 ("Charged", f"KES {kes:,}", True), ("Reference", reference, False)):
        kind = "semi" if strong else "regular"
        draw.text((pad * s, y * s), label, font=font(kind, 14), fill="#475467")
        draw.text(((width - pad) * s, y * s), value, font=font(kind, 14), fill="#101828", anchor="ra")
        y += 32

    # what the plan gives, on a light grey band
    y += 14
    draw.rectangle((0, y * s, width * s, (y + 46 + 28 * len(items) + 8) * s), fill="#f5f7fa")
    y += 22
    draw.text((pad * s, y * s), "What you get", font=font("semi", 14), fill="#101828")
    y += 30
    for item in items:
        draw.text((pad * s, y * s), "✓", font=font("bold", 14), fill="#14b8a6")
        draw.text(((pad + 22) * s, y * s), item, font=font("regular", 14), fill="#344054")
        y += 28

    # the small print
    y += 26
    draw.text((pad * s, y * s), "Nothing renews by itself. Paystack sends its own receipt for the payment.", font=font("regular", 12), fill="#667085")
    draw.text((pad * s, (y + 20) * s), f"Questions? Write to {support}", font=font("regular", 12), fill="#667085")

    # rounded corners, on a soft grey surround
    mask = Image.new("L", page.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, page.size[0] - 1, page.size[1] - 1), radius=20 * s, fill=255)
    framed = Image.new("RGB", ((width + 32) * s, (height + 32) * s), "#eef2f6")
    framed.paste(page, (16 * s, 16 * s), mask)
    out = BytesIO()
    framed.save(out, "PNG", optimize=True)
    return out.getvalue()
