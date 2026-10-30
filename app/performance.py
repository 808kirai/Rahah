"""test results turned into percentages, grades, gpa and summaries for the performance page"""

# the lowest percentage that earns each grade, best first
grade_scale = [("A", 80), ("B", 70), ("C", 60), ("D", 50), ("E", 40), ("F", 0)]
timeline_length = 30

# grade points on the usual 4.0 scale, e and f are both below a pass
grade_points = {"A": 4.0, "B": 3.0, "C": 2.0, "D": 1.0, "E": 0.0, "F": 0.0}


def gpa(grades: list[str]) -> float | None:
    return round(sum(grade_points[g] for g in grades) / len(grades), 2) if grades else None


def percent(score: int, total: int) -> int:
    # halves round up, the way a mark scheme does, so 5 out of 8 is 63 and not 62
    return (200 * score + total) // (2 * total) if total else 0


def grade_for(value: int) -> str:
    return next(grade for grade, floor in grade_scale if value >= floor)


def summarise(attempts: list[dict]) -> dict:
    """attempts are oldest first, each with set_id, title, mode, score, total and created"""
    result = {
        "scale": [{"grade": g, "min": floor, "points": grade_points[g]} for g, floor in grade_scale],
        "overall": None,
        "timeline": [],
        "subjects": [],
        "grades": [{"grade": g, "count": 0} for g, _ in grade_scale],
        "quizzes": [],
    }
    if not attempts:
        return result

    for a in attempts:
        a["percent"] = percent(a["score"], a["total"])
        a["grade"] = grade_for(a["percent"])

    # averages are weighted by questions, so a 20 question quiz counts more than a 5 question one
    subjects: dict[str, dict] = {}
    for a in attempts:
        s = subjects.setdefault(a["mode"], {"mode": a["mode"], "attempts": 0, "correct": 0, "questions": 0})
        s["attempts"] += 1
        s["correct"] += a["score"]
        s["questions"] += a["total"]
    for s in subjects.values():
        s["average"] = percent(s.pop("correct"), s.pop("questions"))
        s["grade"] = grade_for(s["average"])
    ranked = sorted(subjects.values(), key=lambda s: (-s["average"], s["mode"]))

    quizzes: dict[str, dict] = {}
    for a in attempts:
        q = quizzes.setdefault(a["set_id"], {
            "id": a["set_id"], "title": a["title"], "mode": a["mode"], "size": a["total"], "attempts": 0, "best": 0,
        })
        q["attempts"] += 1
        q["best"] = max(q["best"], a["percent"])
        q["latest"] = a["percent"]
        q["last_taken"] = a["created"]
        q.setdefault("history", []).append({k: a[k] for k in ("score", "total", "percent", "grade", "created")})
    for q in quizzes.values():
        q["grade"] = grade_for(q["best"])
        q["history"].reverse()

    # gpa counts each test once, at its best attempt, so practising a test again never lowers it
    for s in subjects.values():
        tests = [q for q in quizzes.values() if q["mode"] == s["mode"]]
        s["tests"] = len(tests)
        s["gpa"] = gpa([q["grade"] for q in tests])

    correct = sum(a["score"] for a in attempts)
    questions = sum(a["total"] for a in attempts)
    latest = attempts[-1]
    average = percent(correct, questions)
    result["overall"] = {
        "attempts": len(attempts),
        "quizzes": len(quizzes),
        "questions": questions,
        "correct": correct,
        "average": average,
        "grade": grade_for(average),
        # the average of the subject gpas, so each subject counts the same however many tests it has
        "gpa": round(sum(s["gpa"] for s in subjects.values()) / len(subjects), 2),
        "subjects": len(subjects),
        "latest": latest["percent"],
        "latest_title": latest["title"],
        "change": latest["percent"] - attempts[-2]["percent"] if len(attempts) > 1 else None,
        "best_subject": ranked[0]["mode"],
        "weakest_subject": ranked[-1]["mode"] if len(ranked) > 1 else None,
    }
    result["timeline"] = [
        {k: a[k] for k in ("set_id", "title", "mode", "score", "total", "percent", "grade", "created")}
        for a in attempts[-timeline_length:]
    ]
    result["subjects"] = ranked
    counts = {g: 0 for g, _ in grade_scale}
    for a in attempts:
        counts[a["grade"]] += 1
    result["grades"] = [{"grade": g, "count": counts[g]} for g, _ in grade_scale]
    result["quizzes"] = sorted(quizzes.values(), key=lambda q: -q["last_taken"])
    return result
