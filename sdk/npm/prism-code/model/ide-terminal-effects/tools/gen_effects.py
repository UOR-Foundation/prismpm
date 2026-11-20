"""Write the terminal's outside-effects table into a rule-app App.lex.tex. Usage: python -I gen_effects.py PATH"""
import sys

path = sys.argv[1]
src = open(path, encoding="utf-8").read()
head = src[: src.index("definition{name: title")]

# An effect is anything terminal output or input asks for that acts outside the grid of characters.
#   title: set the terminal tab's title (OSC 0, 2).        link: open a hyperlink (OSC 8, or a detected address).
#   clipboardwrite, clipboardread: OSC 52 set and query.      notify: a desktop notification (OSC 9, OSC 777).
#   transfer: a file or image carried in the output (OSC 1337 File, sixel, kitty graphics).
#   window: move, resize, raise or report the window (CSI t).  paste: text from the clipboard typed into the terminal.
#   other: any sequence not named here that would act outside the grid.
# gesture: the user's own click or key press asked for it, in this tab, just now.
# scheme: for a link, what its address starts with. multiline: for a paste, whether the text holds a line break.
FIELDS = [("effect", ["other", "title", "link", "clipboardwrite", "clipboardread", "notify", "transfer", "window", "paste"]),
          ("gesture", ["no", "yes"]),
          ("scheme", ["none", "other", "https"]),
          ("multiline", ["no", "yes"])]
F = {n: i for i, (n, _) in enumerate(FIELDS)}
ANSWERS = ["ignore", "apply", "ask"]
A = {n: i for i, n in enumerate(ANSWERS)}
OTHERWISE = "ignore"
LT, LE, GT, GE, EQ, NE = range(6)


def c(field, op, value):
    vals = dict(FIELDS)[field]
    v = vals.index(value) if isinstance(value, str) else value
    return (F[field], op, v)


# First match decides. Only a title, a clicked https link and a paste the user made have a rule; the rest is ignored.
RULES = [
    ([c("effect", EQ, "title")], "apply"),
    ([c("effect", EQ, "link"), c("gesture", EQ, "yes"), c("scheme", EQ, "https")], "ask"),
    ([c("effect", EQ, "paste"), c("gesture", EQ, "yes"), c("multiline", EQ, "yes")], "ask"),
    ([c("effect", EQ, "paste"), c("gesture", EQ, "yes"), c("multiline", EQ, "no")], "apply"),
]
IGNORED = ["other", "clipboardwrite", "clipboardread", "notify", "transfer", "window"]
# (always?, conditions, answer). Each is stated with "is" alone: the kernel route does not settle "is not".
GUARANTEES = [(1, [c("effect", EQ, e)], "ignore") for e in IGNORED]
GUARANTEES += [
    (0, [c("effect", EQ, "link")], "apply"),                                    # no link opens without the question
    (1, [c("effect", EQ, "link"), c("gesture", EQ, "no")], "ignore"),
    (1, [c("effect", EQ, "link"), c("scheme", EQ, "none")], "ignore"),
    (1, [c("effect", EQ, "link"), c("scheme", EQ, "other")], "ignore"),
    (1, [c("effect", EQ, "link"), c("gesture", EQ, "yes"), c("scheme", EQ, "https")], "ask"),
    (1, [c("effect", EQ, "paste"), c("gesture", EQ, "no")], "ignore"),
    (0, [c("effect", EQ, "paste"), c("multiline", EQ, "yes")], "apply"),
    (1, [c("effect", EQ, "paste"), c("gesture", EQ, "yes"), c("multiline", EQ, "yes")], "ask"),
    (1, [c("effect", EQ, "paste"), c("gesture", EQ, "yes"), c("multiline", EQ, "no")], "apply"),
    (0, [c("gesture", EQ, "no")], "ask"),                                       # output alone never raises a question
    (1, [c("effect", EQ, "title")], "apply"),
]
EXAMPLES = [
    ("other no none no", "ignore"),
    ("other yes https no", "ignore"),
    ("title no none no", "apply"),
    ("link no https no", "ignore"),             # output cannot open a link; only a click can ask
    ("link yes https no", "ask"),
    ("link yes other no", "ignore"),            # file:, javascript:, data: and the rest are never opened
    ("link yes none no", "ignore"),
    ("clipboardwrite no none no", "ignore"),
    ("clipboardwrite yes none no", "ignore"),
    ("clipboardread no none no", "ignore"),
    ("notify no none no", "ignore"),
    ("transfer no none no", "ignore"),
    ("window no none no", "ignore"),
    ("paste no none no", "ignore"),
    ("paste yes none no", "apply"),
    ("paste yes none yes", "ask"),
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


body = 'definition{name: title, parameters: [], result: String, body: "Terminal outside effects"}\n\n'
body += d("fields", "(List Field)", fields)
body += d("answers", "(List String)", lst([s(a) for a in ANSWERS], "String"))
body += f"definition{{name: otherwise, parameters: [], result: Nat, body: {A[OTHERWISE]}}}\n\n"
body += d("rules", "(List Rule)", rules)
body += d("guarantees", "(List Guarantee)", guar)
body += d("examples", "(List Example)", exs).rstrip("\n") + "\n\\end{semanticmodule}\n\\end{lexlean}\n"
open(path, "w", encoding="utf-8", newline="\n").write(head + body)
print("written", len(RULES), "rules", len(GUARANTEES), "guarantees", len(EXAMPLES), "examples")
