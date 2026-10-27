"""subject modes, each one adds a short instruction on top of the base prompt"""

modes = {
    "general": {
        "name": "General study",
        "hint": "Any subject, any question",
        "instruction": "Mode: general study. Help with whatever subject the student brings.",
    },
    "maths": {
        "name": "Maths",
        "hint": "Step by step working",
        "instruction": (
            "Mode: maths. Show the working one step at a time and say why each step is allowed. "
            "Check the final answer, for example by substituting it back."
        ),
    },
    "science": {
        "name": "Science",
        "hint": "Physics, chemistry, biology",
        "instruction": (
            "Mode: science. Tie explanations to the underlying idea, keep units on every quantity "
            "and point out common misconceptions when they are relevant."
        ),
    },
    "coding": {
        "name": "Coding",
        "hint": "Write, explain and debug code",
        "instruction": (
            "Mode: coding. When fixing code, explain what was wrong before showing the fix. "
            "Keep examples small and runnable, and name the language on every code block."
        ),
    },
    "languages": {
        "name": "Languages and writing",
        "hint": "Grammar, essays, vocabulary",
        "instruction": (
            "Mode: languages and writing. When giving feedback on the student's writing, quote the "
            "part you mean and explain the rule, so they can fix similar mistakes themselves."
        ),
    },
    "humanities": {
        "name": "History and humanities",
        "hint": "Events, ideas, arguments",
        "instruction": (
            "Mode: history and humanities. Give context and causes, separate facts from "
            "interpretation, and mention where historians or thinkers disagree."
        ),
    },
    "exam": {
        "name": "Exam prep",
        "hint": "Practice questions and revision",
        "instruction": (
            "Mode: exam prep. Favour active recall. Offer practice questions, wait for the "
            "student's answer before revealing the solution, and mark their answers like an examiner."
        ),
    },
}

default_mode = "general"


def public_modes() -> list[dict]:
    return [{"id": key, "name": m["name"], "hint": m["hint"]} for key, m in modes.items()]
