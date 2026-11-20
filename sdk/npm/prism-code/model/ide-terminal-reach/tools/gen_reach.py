"""Write what a terminal command may touch into a rule-app App.lex.tex. Usage: python -I gen_reach.py PATH"""
import sys

path = sys.argv[1]
src = open(path, encoding="utf-8").read()
head = src[: src.index("definition{name: title")]

# The same words as ../ide-terminal-commands. A builtin is the page's own code; a program is a pinned executable.
BUILTINS = ["help", "clear", "ls", "cat", "kappa"]
PROGRAMS = ["check", "snapshot", "prove", "audit"]
READS_MODEL = ["ls", "cat", "kappa"] + PROGRAMS
# command: the command that is running. resource: what it asks its host for.
#   screen: write to the terminal.          readmodel, writemodel: the open model's files.
#   readstore, writestore: the content-addressed store, by BLAKE3 label.
#   network: any request to any address.    clipboard: read or write the clipboard.
#   process: start another program, worker or frame.
FIELDS = [("command", ["other"] + BUILTINS + PROGRAMS),
          ("resource", ["screen", "readmodel", "writemodel", "readstore", "writestore", "network", "clipboard", "process"])]
F = {n: i for i, (n, _) in enumerate(FIELDS)}
ANSWERS = ["deny", "allow"]
A = {n: i for i, n in enumerate(ANSWERS)}
OTHERWISE = "deny"
LT, LE, GT, GE, EQ, NE = range(6)


def c(field, op, value):
    vals = dict(FIELDS)[field]
    v = vals.index(value) if isinstance(value, str) else value
    return (F[field], op, v)


# First match decides. Nothing names writemodel, network, clipboard or process, so they fall to "deny".
RULES = [([c("command", EQ, "other")], "deny")]
RULES += [([c("resource", EQ, "screen")], "allow")]
RULES += [([c("command", EQ, w), c("resource", EQ, "readmodel")], "allow") for w in READS_MODEL]
RULES += [([c("command", EQ, w), c("resource", EQ, r)], "allow") for w in PROGRAMS for r in ("readstore", "writestore")]
# (always?, conditions, answer). Each is stated with "is" alone: the kernel route does not settle "is not".
GUARANTEES = [(1, [c("resource", EQ, r)], "deny") for r in ("network", "clipboard", "process", "writemodel")]
GUARANTEES += [(1, [c("command", EQ, "other")], "deny")]
GUARANTEES += [(0, [c("command", EQ, w), c("resource", EQ, "readmodel")], "allow") for w in ("help", "clear")]
GUARANTEES += [(0, [c("command", EQ, w), c("resource", EQ, "readstore")], "allow") for w in BUILTINS]
GUARANTEES += [(0, [c("command", EQ, w), c("resource", EQ, "writestore")], "allow") for w in BUILTINS]
GUARANTEES += [(1, [c("command", EQ, w), c("resource", EQ, "screen")], "allow") for w in BUILTINS + PROGRAMS]
GUARANTEES += [(1, [c("command", EQ, w), c("resource", EQ, "readmodel")], "allow") for w in READS_MODEL]
EXAMPLES = [
    ("other screen", "deny"),
    ("other network", "deny"),
    ("help screen", "allow"),
    ("help readmodel", "deny"),
    ("clear screen", "allow"),
    ("ls readmodel", "allow"),
    ("cat readmodel", "allow"),
    ("cat writemodel", "deny"),
    ("cat readstore", "deny"),
    ("kappa readmodel", "allow"),
    ("kappa writestore", "deny"),
    ("check readmodel", "allow"),
    ("check writemodel", "deny"),       # the terminal changes no file of the model; the editor does
    ("check network", "deny"),          # no command is handed the network
    ("check readstore", "allow"),
    ("snapshot writestore", "allow"),
    ("prove writestore", "allow"),
    ("prove clipboard", "deny"),
    ("prove process", "deny"),
    ("audit readstore", "allow"),
    ("audit network", "deny"),
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


body = 'definition{name: title, parameters: [], result: String, body: "Terminal reach"}\n\n'
body += d("fields", "(List Field)", fields)
body += d("answers", "(List String)", lst([s(a) for a in ANSWERS], "String"))
body += f"definition{{name: otherwise, parameters: [], result: Nat, body: {A[OTHERWISE]}}}\n\n"
body += d("rules", "(List Rule)", rules)
body += d("guarantees", "(List Guarantee)", guar)
body += d("examples", "(List Example)", exs).rstrip("\n") + "\n\\end{semanticmodule}\n\\end{lexlean}\n"
open(path, "w", encoding="utf-8", newline="\n").write(head + body)
print("written", len(RULES), "rules", len(GUARANTEES), "guarantees", len(EXAMPLES), "examples")
