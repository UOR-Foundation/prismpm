"""Write the terminal's command table into a rule-app App.lex.tex. Usage: python -I gen_commands.py PATH"""
import json, os, sys

path = sys.argv[1]
src = open(path, encoding="utf-8").read()
head = src[: src.index("definition{name: title")]

# The terminal's interpreter maps the first word of a line to one of these; any other word is "other".
# A builtin is the page's own code and starts no executable. A program is an executable named by a BLAKE3 label.
BUILTINS = {
    "help": "list these commands",
    "clear": "clear the screen",
    "ls": "list the open model's files",
    "cat": "print one file of the open model, control bytes shown as text",
    "kappa": "print the BLAKE3 label of one file of the open model",
}
PROGRAMS = {
    "check": "lexlean check: LexLean's front end, as WebAssembly",
    "snapshot": "lexlean snapshot: the same executable",
    "prove": "Lean's kernel on the model's guarantees",
    "audit": "the audit view's statuses, from the kernel and the vectors",
}
# command: the line's first word. target: where the line's path points (none: it names no path).
# bytes: the executable the command needs, as held in this tab, against its pinned label.
# stored: whether the reuse rule (model/rule-app, reuseAdmits) admitted a kept output for this program and input.
FIELDS = [("command", ["other"] + list(BUILTINS) + list(PROGRAMS)),
          ("target", ["none", "outside", "model"]),
          ("bytes", ["absent", "mismatch", "pinned"]),
          ("stored", ["no", "yes"])]
F = {n: i for i, (n, _) in enumerate(FIELDS)}
ANSWERS = ["refuse", "builtin", "run", "reuse"]
A = {n: i for i, n in enumerate(ANSWERS)}
OTHERWISE = "refuse"
LT, LE, GT, GE, EQ, NE = range(6)


def c(field, op, value):
    vals = dict(FIELDS)[field]
    v = vals.index(value) if isinstance(value, str) else value
    return (F[field], op, v)


# First match decides.
RULES = [([c("target", EQ, "outside")], "refuse")]
RULES += [([c("command", EQ, w)], "builtin") for w in BUILTINS]
RULES += [([c("command", EQ, w), c("stored", EQ, "yes")], "reuse") for w in PROGRAMS]
RULES += [([c("command", EQ, w), c("bytes", EQ, "pinned")], "run") for w in PROGRAMS]
# (always?, conditions, answer). Each is stated with "is" alone: the kernel route does not settle "is not".
GUARANTEES = [
    (1, [c("command", EQ, "other")], "refuse"),
    (1, [c("target", EQ, "outside")], "refuse"),
    (0, [c("bytes", EQ, "absent")], "run"),
    (0, [c("bytes", EQ, "mismatch")], "run"),
    (0, [c("stored", EQ, "no")], "reuse"),
]
GUARANTEES += [(0, [c("command", EQ, w)], "run") for w in BUILTINS]
GUARANTEES += [(0, [c("command", EQ, w)], "reuse") for w in BUILTINS]
GUARANTEES += [(0, [c("command", EQ, w)], "builtin") for w in PROGRAMS]
GUARANTEES += [(1, [c("command", EQ, w), c("target", EQ, "model"), c("bytes", EQ, "pinned"), c("stored", EQ, "no")], "run") for w in PROGRAMS]
GUARANTEES += [(1, [c("command", EQ, w), c("target", EQ, "model"), c("stored", EQ, "yes")], "reuse") for w in PROGRAMS]
EXAMPLES = [
    ("other none pinned no", "refuse"),
    ("other model pinned yes", "refuse"),
    ("help none absent no", "builtin"),
    ("clear none absent no", "builtin"),
    ("ls model absent no", "builtin"),
    ("cat model mismatch no", "builtin"),
    ("cat outside pinned no", "refuse"),          # a path outside the open model is refused, whatever the command
    ("kappa model absent no", "builtin"),
    ("check model pinned no", "run"),
    ("check model mismatch no", "refuse"),        # bytes that are not the pinned ones never run
    ("check model absent no", "refuse"),
    ("check model absent yes", "reuse"),          # a kept output needs no executable in the tab
    ("check outside pinned yes", "refuse"),
    ("snapshot model pinned no", "run"),
    ("prove none pinned no", "run"),
    ("prove model pinned yes", "reuse"),
    ("audit model mismatch no", "refuse"),
    ("audit model pinned no", "run"),
]


def lst(items, ty):
    out = f"(nil {ty})"
    for it in reversed(items):
        out = f"(cons {it} {out})"
    return out


s = lambda x: '"' + x + '"'
cond = lambda t: f"(record Condition {{field := {t[0]}, op := {t[1]}, value := {t[2]}}})"
conds = lambda cs: lst([cond(x) for x in cs], "Condition")
fields = lst([f"(record Field {{name := {s(n)}, least := 0, greatest := {len(v) - 1}, values := {lst([s(x) for x in v], 'String')}}})" for n, v in FIELDS], "Field")
rules = lst([f"(record Rule {{conditions := {conds(cs)}, answer := {A[a]}}})" for cs, a in RULES], "Rule")
guar = lst([f"(record Guarantee {{always := {al}, conditions := {conds(cs)}, answer := {A[a]}}})" for al, cs, a in GUARANTEES], "Guarantee")
exs = lst([f"(record Example {{request := {s(r)}, answer := {s(a)}}})" for r, a in EXAMPLES], "Example")


def d(name, ty, body):
    return f"definition{{\n  name: {name},\n  parameters: [],\n  result: {ty},\n  body: {body}\n}}\n\n"


body = 'definition{name: title, parameters: [], result: String, body: "Terminal command table"}\n\n'
body += d("fields", "(List Field)", fields)
body += d("answers", "(List String)", lst([s(a) for a in ANSWERS], "String"))
body += f"definition{{name: otherwise, parameters: [], result: Nat, body: {A[OTHERWISE]}}}\n\n"
body += d("rules", "(List Rule)", rules)
body += d("guarantees", "(List Guarantee)", guar)
body += d("examples", "(List Example)", exs).rstrip("\n") + "\n\\end{semanticmodule}\n\\end{lexlean}\n"
open(path, "w", encoding="utf-8", newline="\n").write(head + body)
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "commands.json")
with open(out, "w", encoding="utf-8", newline="\n") as f:
    json.dump({"builtins": BUILTINS, "programs": PROGRAMS}, f, indent=1)
    f.write("\n")
print("written", len(RULES), "rules", len(GUARANTEES), "guarantees", len(EXAMPLES), "examples")
