"""Write the capability-gate rule table into a rule-app App.lex.tex. Usage: python -I gen_gate.py PATH"""
import sys, re

path = sys.argv[1]
src = open(path, encoding="utf-8").read()
head = src[: src.index("definition{name: title")]

YN = ["no", "yes"]
# target: where the call points. "storage" is the extension's own storage or log folder, which the editor gives it.
FIELDS = [("resource", ["show", "read", "write", "network", "secrets", "exec"]),
          ("declared", YN), ("denied", YN), ("trusted", YN),
          ("target", ["outside", "workspace", "storage"]), ("granted", YN)]
F = {n: i for i, (n, _) in enumerate(FIELDS)}
ANSWERS = ["deny", "allow", "ask"]
A = {n: i for i, n in enumerate(ANSWERS)}
OTHERWISE = "ask"
LT, LE, GT, GE, EQ, NE = range(6)

def c(field, op, value):
    vals = dict(FIELDS)[field]
    v = vals.index(value) if isinstance(value, str) else value
    return (F[field], op, v)

OWN_FILES = [c("target", EQ, "storage"), c("resource", GE, "read"), c("resource", LE, "write")]

# First match decides.
RULES = [
    ([c("denied", EQ, "yes")], "deny"),
    ([c("declared", EQ, "no")], "deny"),
    ([c("target", EQ, "outside")], "deny"),
    (OWN_FILES, "allow"),  # reading and writing its own storage needs no grant, as in VS Code
    ([c("trusted", EQ, "no"), c("resource", GT, "read")], "deny"),  # write, network, secrets, exec
    ([c("granted", EQ, "yes")], "allow"),
]
# (always?, conditions, answer)
GUARANTEES = [
    (1, [c("denied", EQ, "yes")], "deny"),
    (1, [c("declared", EQ, "no")], "deny"),
    (1, [c("target", EQ, "outside")], "deny"),
    (1, [c("trusted", EQ, "no"), c("resource", GT, "write")], "deny"),
    # Stated per target value: the kernel route does not settle guarantees written with "is not".
    # The "outside" case of each is guarantee 3.
    (1, [c("trusted", EQ, "no"), c("resource", GT, "read"), c("target", EQ, "workspace")], "deny"),
    (0, [c("granted", EQ, "no"), c("target", EQ, "workspace")], "allow"),
    (0, [c("granted", EQ, "no"), c("resource", GT, "write")], "allow"),
    (0, [c("granted", EQ, "no"), c("resource", EQ, "show")], "allow"),
    (1, OWN_FILES + [c("denied", EQ, "no"), c("declared", EQ, "yes")], "allow"),
    (1, [c("resource", EQ, "exec"), c("trusted", EQ, "no")], "deny"),
    (0, [c("resource", EQ, "exec"), c("granted", EQ, "no")], "allow"),
    (1, [c("granted", EQ, "yes"), c("denied", EQ, "no"), c("declared", EQ, "yes"),
         c("target", EQ, "workspace"), c("trusted", EQ, "yes")], "allow"),
    (1, [c("granted", EQ, "yes"), c("denied", EQ, "no"), c("declared", EQ, "yes"),
         c("target", EQ, "storage"), c("trusted", EQ, "yes")], "allow"),
]
EXAMPLES = [
    ("network yes no yes workspace yes", "allow"),
    ("network yes no yes workspace no", "ask"),
    ("network yes yes yes workspace yes", "deny"),
    ("write yes no no workspace yes", "deny"),
    ("read yes no no workspace yes", "allow"),
    ("show no no yes workspace yes", "deny"),
    ("secrets yes no yes outside yes", "deny"),
    ("exec yes no yes workspace yes", "allow"),
    ("exec yes no yes workspace no", "ask"),
    ("exec yes no no workspace yes", "deny"),
    ("write yes no yes storage no", "allow"),
    ("read yes no no storage no", "allow"),
    ("write yes no no storage no", "allow"),
    ("write yes yes yes storage yes", "deny"),
    ("exec yes no yes storage no", "ask"),
    ("network yes no no storage yes", "deny"),
    ("show yes no yes storage no", "ask"),
    ("write yes no yes workspace no", "ask"),
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

body = 'definition{name: title, parameters: [], result: String, body: "Extension capability gate"}\n\n'
body += d("fields", "(List Field)", fields)
body += d("answers", "(List String)", lst([s(a) for a in ANSWERS], "String"))
body += f"definition{{name: otherwise, parameters: [], result: Nat, body: {A[OTHERWISE]}}}\n\n"
body += d("rules", "(List Rule)", rules)
body += d("guarantees", "(List Guarantee)", guar)
body += d("examples", "(List Example)", exs).rstrip("\n") + "\n\\end{semanticmodule}\n\\end{lexlean}\n"
open(path, "w", encoding="utf-8", newline="\n").write(head + body)
print("written", len(RULES), "rules", len(GUARANTEES), "guarantees", len(EXAMPLES), "examples")
