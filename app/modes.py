"""subject modes, each one adds a short instruction on top of the base prompt"""

modes = {
    "general": {
        "group": "study",
        "menu": "everyday",
        "name": "General study",
        "hint": "Any subject, any question",
        "instruction": "Mode: general study. Help with whatever subject the student brings.",
    },
    "maths": {
        "group": "study",
        "menu": "sciences",
        "name": "Maths",
        "hint": "Step by step working",
        "instruction": (
            "Mode: maths. Show the working one step at a time and say why each step is allowed. "
            "Check the final answer, for example by substituting it back."
        ),
    },
    "science": {
        "group": "study",
        "menu": "sciences",
        "name": "Science",
        "hint": "Physics, chemistry, biology",
        "instruction": (
            "Mode: science. Tie explanations to the underlying idea, keep units on every quantity "
            "and point out common misconceptions when they are relevant."
        ),
    },
    "coding": {
        "group": "code",
        "menu": "practice",
        "name": "Coding",
        "hint": "Write, explain, debug and run code",
        "runs_code": True,
        "instruction": (
            "Mode: coding. When fixing code, explain what was wrong before showing the fix. "
            "Keep examples small and runnable, and name the language on every code block.\n\n"
            "You can run code in a sandbox, and the student sees each run with its output. Run code "
            "when it helps: to check a fix works, to show real output, or to test an example before "
            "you present it. Don't run code just to answer a question you already know. For anything "
            "longer than one line, write it to a file and run the file, so the student reads clean code "
            "instead of a long shell command. Write the file first and run it in a later step, never both "
            "at once. The student already sees the code and output of every run, so don't paste them "
            "again in your answer, refer to them instead. Save charts and files the student should see "
            "into $OUTPUT_DIR. The sandbox has Python with common libraries and no internet."
        ),
    },
    "languages": {
        "group": "study",
        "menu": "humanities",
        "name": "Languages and writing",
        "hint": "Grammar, essays, vocabulary",
        "instruction": (
            "Mode: languages and writing. When giving feedback on the student's writing, quote the "
            "part you mean and explain the rule, so they can fix similar mistakes themselves."
        ),
    },
    "humanities": {
        "group": "study",
        "menu": "humanities",
        "name": "History and humanities",
        "hint": "Events, ideas, arguments",
        "instruction": (
            "Mode: history and humanities. Give context and causes, separate facts from "
            "interpretation, and mention where historians or thinkers disagree."
        ),
    },
    "exam": {
        "group": "exam",
        "menu": "practice",
        "name": "Exam prep",
        "hint": "Practice questions and revision",
        "instruction": (
            "Mode: exam prep. Favour active recall. Offer practice questions, wait for the "
            "student's answer before revealing the solution, and mark their answers like an examiner."
        ),
    },
}

default_mode = "general"


# the home page is split into these, in this order
groups = {"study": "Study", "exam": "Exam", "code": "Code"}

# the subject picker uses smaller groups, so none of them runs long
menu_groups = {"everyday": "Everyday", "sciences": "Sciences", "humanities": "Humanities", "practice": "Exam and code"}


def runs_code(mode: str) -> bool:
    return modes[mode].get("runs_code", False)


def public_modes() -> list[dict]:
    return [
        {
            "id": key, "name": m["name"], "hint": m["hint"], "group": m["group"], "menu": m["menu"],
            "runs_code": runs_code(key),
        }
        for key, m in modes.items()
    ]
