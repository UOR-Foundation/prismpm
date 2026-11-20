"""Write the terminal's flow-control table into a rule-app App.lex.tex. Usage: python -I gen_flow.py PATH"""
import sys

path = sys.argv[1]
src = open(path, encoding="utf-8").read()
head = src[: src.index("definition{name: title")]

# Whether a running command may hand its next piece of output to the terminal.
# pending: bytes handed to the terminal's write() whose callback has not yet come back.
# paused: whether the command is being held now.
# HIGH and LOW are the figures of xterm.js's flow control guide (https://xtermjs.org/docs/guides/flowcontrol/), which
# says HIGH should stay under 500000 to keep keys responsive. LIMIT is the terminal's own write buffer, 50 MB, past
# which it discards.
HIGH, LOW, LIMIT = 100000, 10000, 50 * 1024 * 1024
FIELDS = [("pending", (0, LIMIT)), ("paused", ["no", "yes"])]
F = {n: i for i, (n, _) in enumerate(FIELDS)}
ANSWERS = ["hold", "write"]
A = {n: i for i, n in enumerate(ANSWERS)}
OTHERWISE = "write"
LT, LE, GT, GE, EQ, NE = range(6)


def c(field, op, value):
    vals = dict(FIELDS)[field]
    v = vals.index(value) if isinstance(value, str) else value
    return (F[field], op, v)


# First match decides.
RULES = [
    ([c("pending", GE, HIGH)], "hold"),
    ([c("paused", EQ, "yes"), c("pending", GT, LOW)], "hold"),
]
# (always?, conditions, answer)
GUARANTEES = [
    (1, [c("pending", GE, HIGH)], "hold"),
    (0, [c("pending", GE, HIGH)], "write"),
    (1, [c("paused", EQ, "yes"), c("pending", GT, LOW)], "hold"),
    (1, [c("paused", EQ, "no"), c("pending", LT, HIGH)], "write"),
    (1, [c("paused", EQ, "yes"), c("pending", LE, LOW)], "write"),
]
EXAMPLES = [
    ("0 no", "write"),
    ("99999 no", "write"),
    ("100000 no", "hold"),
    ("100000 yes", "hold"),
    (f"{LIMIT} no", "hold"),
    ("50000 yes", "hold"),       # once held, a command stays held until the terminal has caught up to LOW
    ("10001 yes", "hold"),
    ("10000 yes", "write"),
    ("0 yes", "write"),
]


def lst(items, ty):
    out = f"(nil {ty})"
    for it in reversed(items):
        out = f"(cons {it} {out})"
    return out


s = lambda x: '"' + x + '"'
cond = lambda t: f"(record Condition {{field := {t[0]}, op := {t[1]}, value := {t[2]}}})"
conds = lambda cs: lst([cond(x) for x in cs], "Condition")


def field(n, v):
    if isinstance(v, tuple):
        return f"(record Field {{name := {s(n)}, least := {v[0]}, greatest := {v[1]}, values := (nil String)}})"
    return f"(record Field {{name := {s(n)}, least := 0, greatest := {len(v) - 1}, values := {lst([s(x) for x in v], 'String')}}})"


fields = lst([field(n, v) for n, v in FIELDS], "Field")
rules = lst([f"(record Rule {{conditions := {conds(cs)}, answer := {A[a]}}})" for cs, a in RULES], "Rule")
guar = lst([f"(record Guarantee {{always := {al}, conditions := {conds(cs)}, answer := {A[a]}}})" for al, cs, a in GUARANTEES], "Guarantee")
exs = lst([f"(record Example {{request := {s(r)}, answer := {s(a)}}})" for r, a in EXAMPLES], "Example")


def d(name, ty, body):
    return f"definition{{\n  name: {name},\n  parameters: [],\n  result: {ty},\n  body: {body}\n}}\n\n"


body = 'definition{name: title, parameters: [], result: String, body: "Terminal flow control"}\n\n'
body += d("fields", "(List Field)", fields)
body += d("answers", "(List String)", lst([s(a) for a in ANSWERS], "String"))
body += f"definition{{name: otherwise, parameters: [], result: Nat, body: {A[OTHERWISE]}}}\n\n"
body += d("rules", "(List Rule)", rules)
body += d("guarantees", "(List Guarantee)", guar)
body += d("examples", "(List Example)", exs).rstrip("\n") + "\n\\end{semanticmodule}\n\\end{lexlean}\n"
open(path, "w", encoding="utf-8", newline="\n").write(head + body)
print("written", len(RULES), "rules", len(GUARANTEES), "guarantees", len(EXAMPLES), "examples")
