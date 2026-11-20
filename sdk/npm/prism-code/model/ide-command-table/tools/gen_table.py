"""Write the command class table into a rule-app App.lex.tex. Usage: python -I gen_gate.py PATH"""
import sys, re

path = sys.argv[1]
src = open(path, encoding="utf-8").read()
head = src[: src.index("definition{name: title")]

# The page maps an editor command id to one of these words; any id it does not list is "other".
# Each listed command only changes what the editor shows. Ids seen in the batch of 25 extensions (spike/BATCH.md).
COMMANDS = {
    "setcontext": ["_setContext", "setContext"],                    # sets a UI flag that menus and keybindings read
    "reloadwebview": ["workbench.action.webview.reloadWebviewAction"],  # redraws open webviews
    "wordhighlight": ["editor.action.wordHighlight.trigger"],       # highlights the word under the cursor
}
FIELDS = [("command", ["other"] + list(COMMANDS))]
F = {n: i for i, (n, _) in enumerate(FIELDS)}
ANSWERS = ["exec", "show"]
A = {n: i for i, n in enumerate(ANSWERS)}
OTHERWISE = "exec"
LT, LE, GT, GE, EQ, NE = range(6)

def c(field, op, value):
    vals = dict(FIELDS)[field]
    v = vals.index(value) if isinstance(value, str) else value
    return (F[field], op, v)

# First match decides.
RULES = [([c("command", EQ, w)], "show") for w in COMMANDS]
# (always?, conditions, answer)
GUARANTEES = [(1, [c("command", EQ, "other")], "exec"), (0, [c("command", EQ, "other")], "show")]
GUARANTEES += [(1, [c("command", EQ, w)], "show") for w in COMMANDS]
EXAMPLES = [("other", "exec")] + [(w, "show") for w in COMMANDS]

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

body = 'definition{name: title, parameters: [], result: String, body: "Command class table"}\n\n'
body += d("fields", "(List Field)", fields)
body += d("answers", "(List String)", lst([s(a) for a in ANSWERS], "String"))
body += f"definition{{name: otherwise, parameters: [], result: Nat, body: {A[OTHERWISE]}}}\n\n"
body += d("rules", "(List Rule)", rules)
body += d("guarantees", "(List Guarantee)", guar)
body += d("examples", "(List Example)", exs).rstrip("\n") + "\n\\end{semanticmodule}\n\\end{lexlean}\n"
open(path, "w", encoding="utf-8", newline="\n").write(head + body)
import json, os
_out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'commands.json')
with open(_out, 'w', encoding='utf-8', newline=chr(10)) as _f:
    json.dump(COMMANDS, _f, indent=1)
print("written", len(RULES), "rules", len(GUARANTEES), "guarantees", len(EXAMPLES), "examples")
