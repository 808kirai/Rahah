import hashlib
import hmac
import json

from fastapi.testclient import TestClient

from app.config import settings
from app.main import create_app

from .fakes import fake_client, message, signed_in, text_block


class fake_paystack:
    """stands in for paystack: remembers what was started and says each payment went the way it's told"""

    def __init__(self):
        self.started = []
        self.outcome = {}

    def start(self, email, amount, reference, callback, plan):
        self.started.append({"email": email, "amount": amount, "reference": reference, "callback": callback, "plan": plan})
        return f"https://checkout.paystack.com/{reference}"

    def check(self, reference):
        return self.outcome.get(reference, {"status": "abandoned"})


def pro_app(tmp_path, replies=(), **options):
    pay = fake_paystack()
    cfg = settings(db_path=tmp_path / "pro.db", paystack_secret="sk_test_secret", daily_cap=0.15, **options)
    return create_app(cfg, client=fake_client(list(replies)), payments=pay), pay


def test_buying_a_month_of_pro_gives_ten_times_the_daily_limit(tmp_path):
    app, pay = pro_app(tmp_path)
    admin = signed_in(TestClient(app), "runie")
    amina = signed_in(TestClient(app), "amina")
    status = amina.get("/api/pro").json()
    assert status["enabled"] and status["pro"] is None
    assert [(p["id"], p["price"]) for p in status["plans"]] == [
        ("day", 63), ("pro_week", 257), ("pro_month", 515), ("pro_term", 1482), ("max_week", 386), ("max_month", 773), ("max_term", 2192)]
    # set in dollars ending in .99, charged in shillings
    assert [p["usd"] for p in status["plans"]] == [0.49, 1.99, 3.99, 11.49, 2.99, 5.99, 16.99]
    started = amina.post("/api/pro/checkout", json={"plan": "pro_month"}).json()
    assert started["url"].startswith("https://checkout.paystack.com/")
    assert pay.started[0]["amount"] == 515 and pay.started[0]["email"] == "amina@example.com"
    ref = started["reference"]
    # not paid yet, nothing changes
    assert amina.get(f"/api/pro/verify/{ref}").json()["status"] == "abandoned"
    # paid the right amount in shillings
    pay.outcome[ref] = {"status": "success", "amount": 51500, "currency": "KES"}
    done = amina.get(f"/api/pro/verify/{ref}").json()
    assert done["status"] == "paid" and done["pro"]["plan"] == "pro_month" and done["pro"]["active"] and done["pro"]["tier"] == "pro"
    # checking again doesn't give a second month
    amina.get(f"/api/pro/verify/{ref}")
    me = amina.get("/api/me").json()["allowance"]
    assert me["pro"]["until"] - me["resets_in"] > 0
    # someone else can't use that payment
    assert admin.get(f"/api/pro/verify/{ref}").status_code == 404
    listed = {u["username"]: u for u in admin.get("/api/admin/users").json()["users"]}
    assert listed["amina"]["pro_until"] and listed["runie"]["pro_until"] is None


def test_a_payment_for_the_wrong_amount_gives_nothing(tmp_path):
    app, pay = pro_app(tmp_path)
    signed_in(TestClient(app), "runie")  # the first account is the admin, who has no limits
    amina = signed_in(TestClient(app), "amina")
    ref = amina.post("/api/pro/checkout", json={"plan": "max_term"}).json()["reference"]
    pay.outcome[ref] = {"status": "success", "amount": 100, "currency": "KES"}
    assert amina.get(f"/api/pro/verify/{ref}").json()["pro"] is None
    assert amina.post("/api/pro/checkout", json={"plan": "forever"}).status_code == 400


def test_paystacks_signed_webhook_gives_the_pass_and_a_forged_one_doesnt(tmp_path):
    app, pay = pro_app(tmp_path)
    signed_in(TestClient(app), "runie")  # the first account is the admin, who has no limits
    amina = signed_in(TestClient(app), "amina")
    ref = amina.post("/api/pro/checkout", json={"plan": "pro_week"}).json()["reference"]
    body = json.dumps({"event": "charge.success", "data": {"reference": ref, "status": "success", "amount": 25700, "currency": "KES"}}).encode()
    forged = TestClient(app).post("/api/paystack/webhook", content=body, headers={"x-paystack-signature": "nope", "content-type": "application/json"})
    assert forged.status_code == 401
    assert amina.get("/api/pro").json()["pro"] is None
    signature = hmac.new(b"sk_test_secret", body, hashlib.sha512).hexdigest()
    ok = TestClient(app).post("/api/paystack/webhook", content=body, headers={"x-paystack-signature": signature, "content-type": "application/json"})
    assert ok.status_code == 200
    assert amina.get("/api/pro").json()["pro"]["plan"] == "pro_week"


def test_a_second_pass_starts_when_the_first_ends(tmp_path):
    app, pay = pro_app(tmp_path)
    signed_in(TestClient(app), "runie")  # the first account is the admin, who has no limits
    amina = signed_in(TestClient(app), "amina")
    ends = []
    for _ in range(2):
        ref = amina.post("/api/pro/checkout", json={"plan": "pro_week"}).json()["reference"]
        pay.outcome[ref] = {"status": "success", "amount": 25700, "currency": "KES"}
        ends.append(amina.get(f"/api/pro/verify/{ref}").json()["pro"]["until"])
    assert round(ends[1] - ends[0]) == 7 * 86400


def test_pro_lifts_the_daily_limit_and_free_students_see_the_offer(tmp_path):
    replies = [message([text_block(f"Answer {i}.")]) for i in range(6)]
    app, pay = pro_app(tmp_path, replies, daily_budget=0)
    signed_in(TestClient(app), "runie")
    amina = signed_in(TestClient(app), "amina")
    # a tiny free limit, so one answer uses it up
    chat = amina.post("/api/conversations", json={"mode": "general"}).json()["id"]
    owner = TestClient(app)
    owner.post("/api/auth/login", json={"login": "runie", "password": "correct horse!"})
    owner.patch(f"/api/admin/users/{amina.get('/api/me').json()['id']}", json={"daily_cap": 0.0000001})
    assert amina.post(f"/api/conversations/{chat}/messages", json={"text": "one"}).status_code == 200
    blocked = amina.post(f"/api/conversations/{chat}/messages", json={"text": "two"})
    assert blocked.status_code == 429 and "Upgrade to Rahah Pro for 10 times more" in blocked.json()["detail"]
    # with a week of pro, the same student can keep going
    ref = amina.post("/api/pro/checkout", json={"plan": "pro_week"}).json()["reference"]
    pay.outcome[ref] = {"status": "success", "amount": 25700, "currency": "KES"}
    amina.get(f"/api/pro/verify/{ref}")
    owner.patch(f"/api/admin/users/{amina.get('/api/me').json()['id']}", json={"daily_cap": 0.001})
    assert amina.post(f"/api/conversations/{chat}/messages", json={"text": "three"}).status_code == 200


def test_the_free_trial_is_once_per_account_and_gives_pro(tmp_path):
    app, pay = pro_app(tmp_path)
    signed_in(TestClient(app), "runie")
    amina = signed_in(TestClient(app), "amina")
    assert amina.get("/api/pro").json()["trial"] is True
    started = amina.post("/api/pro/trial").json()["pro"]
    assert started["plan"] == "trial" and started["active"]
    assert amina.get("/api/me").json()["pro"] is True
    assert amina.post("/api/pro/trial").status_code == 400
    assert amina.get("/api/pro").json()["trial"] is False


def test_the_exam_day_pass_gives_five_times_for_a_day(tmp_path):
    app, pay = pro_app(tmp_path)
    signed_in(TestClient(app), "runie")
    amina = signed_in(TestClient(app), "amina")
    ref = amina.post("/api/pro/checkout", json={"plan": "day"}).json()["reference"]
    assert pay.started[-1]["amount"] == 63
    pay.outcome[ref] = {"status": "success", "amount": 6300, "currency": "KES"}
    got = amina.get(f"/api/pro/verify/{ref}").json()["pro"]
    assert got["plan"] == "day" and round(got["ends"] - got["starts"]) == 86400


def test_a_friend_who_brought_a_buyer_gets_a_free_day_of_pro(tmp_path):
    app, pay = pro_app(tmp_path)
    signed_in(TestClient(app), "runie")
    amina = signed_in(TestClient(app), "amina")
    invite = amina.get("/api/pro").json()["invite"]
    assert invite.endswith("/?ref=amina")
    brian = TestClient(app)
    brian.post("/api/auth/signup", json={"username": "brian", "email": "brian@example.com", "password": "correct horse!", "agreed": True, "ref": "amina"})
    # nothing yet, brian hasn't bought anything
    assert amina.get("/api/pro").json()["invite_days"] == 0
    for _ in range(2):
        ref = brian.post("/api/pro/checkout", json={"plan": "pro_week"}).json()["reference"]
        pay.outcome[ref] = {"status": "success", "amount": 25700, "currency": "KES"}
        brian.get(f"/api/pro/verify/{ref}")
    # one reward per friend brought, however many passes they buy
    status = amina.get("/api/pro").json()
    assert status["invite_days"] == 1 and status["pro"]["plan"] == "gift"


def test_free_students_see_five_chats_and_pro_sees_them_all(tmp_path):
    replies = [message([text_block("Hi.")]) for _ in range(7)]
    app, pay = pro_app(tmp_path, replies, daily_budget=0)
    signed_in(TestClient(app), "runie")
    amina = signed_in(TestClient(app), "amina")
    for n in range(7):
        chat = amina.post("/api/conversations", json={"mode": "general"}).json()["id"]
        amina.post(f"/api/conversations/{chat}/messages", json={"text": f"question {n}"})
    listed = amina.get("/api/conversations").json()
    assert len(listed["conversations"]) == 5 and listed["hidden"] == 2
    # search only looks in the newest five
    assert amina.get("/api/search", params={"q": "question 0"}).json()["results"] == []
    amina.post("/api/pro/trial")
    listed = amina.get("/api/conversations").json()
    assert len(listed["conversations"]) == 7 and listed["hidden"] == 0
    assert len(amina.get("/api/search", params={"q": "question 0"}).json()["results"]) == 1


def buy(student, pay, plan, amount):
    ref = student.post("/api/pro/checkout", json={"plan": plan}).json()["reference"]
    pay.outcome[ref] = {"status": "success", "amount": amount * 100, "currency": "KES"}
    return student.get(f"/api/pro/verify/{ref}").json()["pro"]


def test_archmage_is_the_admins_alone_even_on_max(tmp_path):
    app, pay = pro_app(tmp_path, [message([text_block("Deep.")])], daily_budget=0)
    admin = signed_in(TestClient(app), "runie")
    amina = signed_in(TestClient(app), "amina")
    chat = amina.post("/api/conversations", json={"mode": "general"}).json()["id"]
    buy(amina, pay, "max_week", 386)
    me = amina.get("/api/me").json()
    assert me["tier"] == "max" and "archmage" not in [m["id"] for m in me["models"]]
    refused = amina.post(f"/api/conversations/{chat}/messages", json={"text": "hard one", "model": "archmage"})
    assert refused.status_code == 403
    assert "archmage" in [m["id"] for m in admin.get("/api/me").json()["models"]]


def test_max_bought_during_pro_starts_now_and_pro_waits_after_it(tmp_path):
    app, pay = pro_app(tmp_path)
    signed_in(TestClient(app), "runie")
    amina = signed_in(TestClient(app), "amina")
    pro = buy(amina, pay, "pro_month", 515)
    got = buy(amina, pay, "max_week", 386)
    # max runs from now, gives twenty times, and the month of pro picks up when it ends
    assert got["plan"] == "max_week" and got["tier"] == "max" and round(got["starts"] - pro["starts"]) < 5
    assert round(got["until"] - got["ends"]) == 30 * 86400
    # a pro pass bought during max still waits its turn
    after = buy(amina, pay, "pro_week", 257)
    assert after["plan"] == "max_week" and round(after["until"] - got["until"]) == 7 * 86400


def test_free_students_get_ten_mage_answers_then_auto_uses_acolyte(tmp_path):
    # the api says which model answered, here mage
    claude = fake_client([message([text_block("Hi.")]).model_copy(update={"model": "claude-sonnet-5-5"}) for _ in range(13)])
    cfg = settings(db_path=tmp_path / "mage.db", paystack_secret="sk_test_secret", daily_cap=0.15, daily_budget=0)
    app = create_app(cfg, client=claude, payments=fake_paystack())
    signed_in(TestClient(app), "runie")
    amina = signed_in(TestClient(app), "amina")
    chat = amina.post("/api/conversations", json={"mode": "maths"}).json()["id"]
    for n in range(10):
        assert amina.post(f"/api/conversations/{chat}/messages", json={"text": f"sum {n}", "model": "mage", "mode": "maths"}).status_code == 200
    refused = amina.post(f"/api/conversations/{chat}/messages", json={"text": "one more", "model": "mage", "mode": "maths"})
    assert refused.status_code == 429 and "unlimited Mage" in refused.json()["detail"]
    # auto would pick mage for maths, but today's are used, so acolyte answers
    amina.post(f"/api/conversations/{chat}/messages", json={"text": "on auto", "mode": "maths"})
    assert claude.beta.messages.calls[-1]["model"] == cfg.light_model
    amina.post("/api/pro/trial")
    assert amina.post(f"/api/conversations/{chat}/messages", json={"text": "pro now", "model": "mage", "mode": "maths"}).status_code == 200


def test_free_students_get_five_searches_a_day(tmp_path):
    from .fakes import search_block, search_result
    def searched():
        reply = message([search_block("news"), search_result("https://example.org", "News"), text_block("Found it.")])
        # the reply says one search was made, the way the api reports it
        from types import SimpleNamespace
        return reply.model_copy(update={"usage": reply.usage.model_copy(update={"server_tool_use": SimpleNamespace(web_search_requests=1)})})
    replies = [searched() for _ in range(5)]
    replies += [message([text_block("From memory.")])]
    claude = fake_client(replies)
    cfg = settings(db_path=tmp_path / "search.db", paystack_secret="sk_test_secret", daily_cap=0.15, daily_budget=0)
    app = create_app(cfg, client=claude, payments=fake_paystack())
    signed_in(TestClient(app), "runie")
    amina = signed_in(TestClient(app), "amina")
    chat = amina.post("/api/conversations", json={"mode": "general"}).json()["id"]
    for n in range(5):
        amina.post(f"/api/conversations/{chat}/messages", json={"text": f"latest news {n}"})
    amina.post(f"/api/conversations/{chat}/messages", json={"text": "latest news again"})
    tools = [[t["name"] for t in call.get("tools", [])] for call in claude.beta.messages.calls]
    # the first five questions could search, the sixth couldn't, and claude was told why
    assert all("web_search" in t for t in tools[:5]) and "web_search" not in tools[5]
    assert "Web search isn't available" in str(claude.beta.messages.calls[5]["messages"][-1])


def test_parent_email_is_checked_and_saved(tmp_path):
    app, pay = pro_app(tmp_path)
    signed_in(TestClient(app), "runie")
    amina = signed_in(TestClient(app), "amina")
    assert amina.put("/api/me/parent", json={"email": "not an email"}).status_code == 400
    assert amina.put("/api/me/parent", json={"email": "amina@example.com"}).status_code == 400
    assert amina.put("/api/me/parent", json={"email": "Mum@Example.com"}).json()["parent_email"] == "mum@example.com"
    assert amina.put("/api/me/parent", json={"email": ""}).json()["parent_email"] == ""


def test_parents_get_one_report_on_sunday_evening_while_the_student_is_on_pro(tmp_path):
    from datetime import datetime, timezone
    sent = []
    cfg = settings(db_path=tmp_path / "parent.db", paystack_secret="sk_test_secret", smtp_user="studywithrahah@gmail.com", smtp_password="x")
    app = create_app(cfg, client=fake_client(), payments=fake_paystack(), mailer=lambda to, subject, text, attachment=None: sent.append((to, subject, text)))
    signed_in(TestClient(app), "runie")
    amina = signed_in(TestClient(app), "amina")
    amina.patch("/api/me", json={"name": "Amina Otieno"})
    amina.put("/api/me/parent", json={"email": "mum@example.com"})
    sunday_evening = datetime(2026, 11, 1, 16, 0, tzinfo=timezone.utc)  # 7pm in nairobi
    # not on pro yet, so no report
    assert app.state.send_parent_reports(sunday_evening) == 0
    amina.post("/api/pro/trial")
    # a saturday sends nothing
    assert app.state.send_parent_reports(datetime(2026, 10, 31, 16, 0, tzinfo=timezone.utc)) == 0
    assert app.state.send_parent_reports(sunday_evening) == 1
    to, subject, text = sent[-1]
    assert to == "mum@example.com" and subject == "Amina on Rahah this week"
    assert "Days studied:" in text and "remove your email" in text
    # only once that week
    assert app.state.send_parent_reports(sunday_evening) == 0


def test_checkout_hands_back_paystacks_access_code_for_the_popup(tmp_path):
    app, pay = pro_app(tmp_path)
    pay.start = lambda email, amount, reference, callback, plan: {"url": f"https://checkout.paystack.com/{reference}", "access_code": "code_123"}
    signed_in(TestClient(app), "runie")
    amina = signed_in(TestClient(app), "amina")
    started = amina.post("/api/pro/checkout", json={"plan": "pro_week"}).json()
    assert started["access_code"] == "code_123" and started["url"].startswith("https://checkout.paystack.com/")
    # the page may load paystack's popup and show its checkout in a frame
    policy = amina.get("/").headers["content-security-policy"]
    assert "https://js.paystack.co" in policy and "https://checkout.paystack.com" in policy


def test_a_session_left_alone_for_an_hour_signs_out(tmp_path):
    import sqlite3
    import time
    app, pay = pro_app(tmp_path)
    signed_in(TestClient(app), "runie")
    amina = signed_in(TestClient(app), "amina")
    me = amina.get("/api/me").json()
    assert me["idle_minutes"] == 60
    # used just now, still signed in
    db = sqlite3.connect(tmp_path / "pro.db")
    db.execute("update sessions set used = ? where user_id = ?", (time.time() - 50 * 60, me["id"]))
    db.commit()
    assert amina.get("/api/me").status_code == 200
    # an hour and a bit without anything, signed out
    db.execute("update sessions set used = ? where user_id = ?", (time.time() - 61 * 60, me["id"]))
    db.commit()
    assert amina.get("/api/me").status_code == 401
    assert db.execute("select count(*) from sessions where user_id = ?", (me["id"],)).fetchone()[0] == 0


def test_the_student_gets_one_receipt_email_for_a_purchase(tmp_path):
    import time
    sent = []
    pay = fake_paystack()
    cfg = settings(db_path=tmp_path / "mail.db", paystack_secret="sk_test_secret", smtp_user="studywithrahah@gmail.com", smtp_password="x")
    app = create_app(cfg, client=fake_client(), payments=pay, mailer=lambda to, subject, text, attachment=None: sent.append((to, subject, text, attachment)))
    signed_in(TestClient(app), "runie")
    amina = signed_in(TestClient(app), "amina")
    amina.patch("/api/me", json={"name": "Amina Otieno"})
    ref = buy(amina, pay, "pro_month", 515) and pay.started[-1]["reference"]
    for _ in range(20):
        if sent:
            break
        time.sleep(0.05)
    # checking the payment again doesn't send a second one
    amina.get(f"/api/pro/verify/{ref}")
    time.sleep(0.2)
    assert len(sent) == 1
    to, subject, text, attachment = sent[0]
    assert to == "amina@example.com" and subject == "Your Rahah Pro month is ready"
    assert "Hi Amina" in text and "$3.99 (KES 515)" in text and ref in text and "/terms" in text and "attached" in text
    # the receipt drawn as a picture, attached
    name, picture, kind = attachment
    assert name == "rahah-receipt.png" and kind == "image/png" and picture[1:4] == b"PNG"


def test_pro_reads_bigger_files_than_free(tmp_path):
    claude = fake_client([message([text_block("Read it all.")])])
    # the question counts as 150,000 tokens, over free's 100,000 and under pro's 250,000
    claude.beta.messages.counter = lambda messages: 150_000
    cfg = settings(db_path=tmp_path / "pages.db", paystack_secret="sk_test_secret", daily_budget=0, max_prompt_tokens=1000)
    app = create_app(cfg, client=claude, payments=fake_paystack())
    signed_in(TestClient(app), "runie")
    amina = signed_in(TestClient(app), "amina")
    chat = amina.post("/api/conversations", json={"mode": "general"}).json()["id"]
    big = "summarise " + "page " * 3000
    refused = amina.post(f"/api/conversations/{chat}/messages", json={"text": big}).text
    assert "Message too long" in refused
    amina.post("/api/pro/trial")
    assert "Read it all." in amina.post(f"/api/conversations/{chat}/messages", json={"text": big}).text

def test_a_big_question_goes_to_acolyte_even_when_mage_was_picked(tmp_path):
    claude = fake_client([message([text_block("Read it.")]), message([text_block("Short one.")])])
    sizes = iter([150_000, 10])
    claude.beta.messages.counter = lambda messages: next(sizes)
    cfg = settings(db_path=tmp_path / "bigread.db", paystack_secret="sk_test_secret", daily_budget=0, max_prompt_tokens=1000)
    app = create_app(cfg, client=claude, payments=fake_paystack())
    signed_in(TestClient(app), "runie")
    amina = signed_in(TestClient(app), "amina")
    amina.post("/api/pro/trial")
    chat = amina.post("/api/conversations", json={"mode": "general"}).json()["id"]
    big = amina.post(f"/api/conversations/{chat}/messages", json={"text": "summarise " + "page " * 3000, "model": "mage"}).text
    assert claude.beta.messages.calls[-1]["model"] == cfg.light_model
    assert '"tier": "acolyte"' in big
    # a normal sized question still goes to mage
    amina.post(f"/api/conversations/{chat}/messages", json={"text": "and briefly?", "model": "mage"})
    assert claude.beta.messages.calls[-1]["model"] == cfg.deep_model
