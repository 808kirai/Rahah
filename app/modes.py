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
            "Mode: maths. Show the working one step at a time, a line or two per step, and say why a "
            "step is allowed when it isn't obvious. Check the final answer in one line, for example by "
            "substituting it back."
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
            "Mode: coding. When fixing code, say in a sentence or two what was wrong before showing the fix. "
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
            "Mode: history and humanities. Give the key context and causes, separate facts from "
            "interpretation, and mention where historians or thinkers disagree when it matters to the question."
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

# the subject picker uses smaller groups, so none of them runs long, the student's own subjects come first
menu_groups = {
    "custom": "Your subjects", "everyday": "Everyday", "sciences": "Sciences", "humanities": "Humanities",
    "practice": "Exam and code",
}

# subjects the student types in themselves, kept in the database and added to modes while the app runs
# they behave like general study, with the subject named so rahah teaches it the way that subject is taught
custom_prefix = "my-"


def custom_mode(name: str) -> dict:
    return {
        "group": "study",
        "menu": "custom",
        "name": name,
        "hint": "Your own subject",
        "custom": True,
        "instruction": (
            f"Mode: {name}. The student added this subject themselves. Teach it the way a good {name} "
            "teacher would, using the terms, methods and kinds of examples that subject uses."
        ),
    }


def sync_custom(subjects: list[dict]) -> None:
    """swap the custom subjects in modes for the ones saved now, every student's

    ids are random, so one student's subject never clashes with another's, and the
    server checks a subject is the student's own before using it, see allowed_mode
    """
    for key in [k for k in modes if k.startswith(custom_prefix)]:
        del modes[key]
    for subject in subjects:
        modes[subject["id"]] = custom_mode(subject["name"])


def allowed_mode(mode: str, own: set[str]) -> bool:
    """a built in subject, or one of the student's own"""
    return mode in modes and (not mode.startswith(custom_prefix) or mode in own)


def find_mode(name: str, own: set[str]) -> str | None:
    """the id of a subject with this name, ignoring case, so the same subject isn't added twice"""
    wanted = name.casefold()
    return next((key for key, m in modes.items() if allowed_mode(key, own) and m["name"].casefold() == wanted), None)


def runs_code(mode: str) -> bool:
    return modes[mode].get("runs_code", False)


def public_modes(own: set[str]) -> list[dict]:
    # built in subjects and the student's own, never anyone else's
    return [
        {
            "id": key, "name": m["name"], "hint": m["hint"], "group": m["group"], "menu": m["menu"],
            "runs_code": runs_code(key), "custom": m.get("custom", False),
        }
        for key, m in modes.items()
        if allowed_mode(key, own)
    ]
