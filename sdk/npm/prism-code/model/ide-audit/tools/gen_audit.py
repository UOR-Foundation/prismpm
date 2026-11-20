"""Write the audit-status rule table into a rule-app App.lex.tex. Usage: python -I gen_gate.py PATH"""
import sys, re

path = sys.argv[1]
src = open(path, encoding="utf-8").read()
head = src[: src.index("definition{name: title")]

# What the audit view may say about one guarantee of one app.
# kernel: what Lean's kernel, in this tab, said of the guarantee. kernelmodel: whether the model it judged is the
# exact model on show. attestation: the build's signed statement about the guarantee, as checked in this tab.
# attestedmodel: whether that statement names the exact model on show. vectors: the app's acceptance vectors, replayed
# in this tab through the running app.
FIELDS = [("kernel", ["none", "refused", "accepted"]),
          ("kernelmodel", ["other", "this"]),
          ("attestation", ["none", "invalid", "verified"]),
          ("attestedmodel", ["other", "this"]),
          ("vectors", ["none", "failed", "passed"])]
F = {n: i for i, (n, _) in enumerate(FIELDS)}
ANSWERS = ["unknown", "tested", "proved", "refused"]
A = {n: i for i, n in enumerate(ANSWERS)}
OTHERWISE = "unknown"
LT, LE, GT, GE, EQ, NE = range(6)


def c(field, op, value):
    vals = dict(FIELDS)[field]
    v = vals.index(value) if isinstance(value, str) else value
    return (F[field], op, v)


BY_KERNEL = [c("kernel", EQ, "accepted"), c("kernelmodel", EQ, "this")]
BY_ATTESTATION = [c("attestation", EQ, "verified"), c("attestedmodel", EQ, "this")]
# First match decides.
RULES = [
    ([c("kernel", EQ, "refused"), c("kernelmodel", EQ, "this")], "refused"),  # Lean rejected it for this model
    ([c("vectors", EQ, "failed")], "refused"),                                 # the running app is not the model
    (BY_KERNEL, "proved"),
    (BY_ATTESTATION, "proved"),
    ([c("vectors", EQ, "passed")], "tested"),
]
# "Proved" needs the kernel's acceptance of this model, or a verified attestation of this model. Stated as: with
# neither, never proved. Neither means one of three things is wrong on each side, so nine cases, each written with
# "is" alone because the kernel route does not settle guarantees written with "is not".
NO_KERNEL = [[c("kernel", EQ, "none")], [c("kernel", EQ, "refused")], [c("kernelmodel", EQ, "other")]]
NO_ATTESTATION = [[c("attestation", EQ, "none")], [c("attestation", EQ, "invalid")], [c("attestedmodel", EQ, "other")]]
# (always?, conditions, answer)
GUARANTEES = [(0, k + a, "proved") for k in NO_KERNEL for a in NO_ATTESTATION]
GUARANTEES += [
    (1, [c("kernel", EQ, "refused"), c("kernelmodel", EQ, "this")], "refused"),
    (1, [c("vectors", EQ, "failed")], "refused"),
    (0, [c("vectors", EQ, "failed")], "proved"),
    (0, [c("kernel", EQ, "refused"), c("kernelmodel", EQ, "this")], "proved"),
    (0, [c("vectors", EQ, "none")], "tested"),
]
EXAMPLES = [
    ("accepted this none other passed", "proved"),
    ("accepted this none other none", "proved"),
    ("none other verified this passed", "proved"),
    ("accepted other none other passed", "tested"),     # a proof of another model proves nothing here
    ("none other verified other passed", "tested"),     # an attestation of another model, likewise
    ("none other invalid this passed", "tested"),
    ("refused this verified this passed", "refused"),   # the kernel's refusal outranks an attestation
    ("accepted this verified this failed", "refused"),  # failing vectors outrank any proof
    ("none other none other passed", "tested"),
    ("none other none other none", "unknown"),
    ("refused other none other none", "unknown"),
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

body = 'definition{name: title, parameters: [], result: String, body: "Audit status"}\n\n'
body += d("fields", "(List Field)", fields)
body += d("answers", "(List String)", lst([s(a) for a in ANSWERS], "String"))
body += f"definition{{name: otherwise, parameters: [], result: Nat, body: {A[OTHERWISE]}}}\n\n"
body += d("rules", "(List Rule)", rules)
body += d("guarantees", "(List Guarantee)", guar)
body += d("examples", "(List Example)", exs).rstrip("\n") + "\n\\end{semanticmodule}\n\\end{lexlean}\n"
open(path, "w", encoding="utf-8", newline="\n").write(head + body)
print("written", len(RULES), "rules", len(GUARANTEES), "guarantees", len(EXAMPLES), "examples")
