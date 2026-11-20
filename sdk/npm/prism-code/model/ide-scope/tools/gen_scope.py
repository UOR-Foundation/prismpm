"""Write the scope kernel: src/Scope.lex.tex and src/ScopeProofs.lex.tex. Usage: python -I gen_scope.py OUT_DIR

A target is a list of segments: path segments from the root, or host labels from the top-level domain.
A scope is a shorter list. The target is inside when the scope is a prefix of it and every segment is a real name.
Segments are numbers. The page gives equal strings equal numbers; 0 is an unused slot or an empty segment,
1 is "..", 2 is ".", and 3 and above are real names.
"""
import os, sys

out = sys.argv[1]
N, M, NAME = 8, 4, 3  # target slots, scope slots, first number that is a real name

f = lambda name: f"(project r {name})"
conj = lambda xs: xs[0] if len(xs) == 1 else f"({conj(xs[:-1])} && {xs[-1]})"
DP = "(project r depth)"
SD = "(project r scopeDepth)"
S = lambda i: f("s" + str(i))
P = lambda j: f("p" + str(j))
disj = lambda xs: xs[0] if len(xs) == 1 else f"({disj(xs[:-1])} || {xs[-1]})"


def d(name, result, body, params="[r : Request]"):
    return f"definition{{\n  name: {name},\n  parameters: {params},\n  result: {result},\n  body: {body}\n}}\n"


fields = ["depth"] + [f"s{i}" for i in range(1, N + 1)] + ["scopeDepth"] + [f"p{j}" for j in range(1, M + 1)]
# With a third argument, the path of the decision-app starter's model, the kernel is written as a Prism text
# application: the same definitions, plus the starter's request parser and an application record, so it builds
# into a holo. Without it, the bare model, as first verified on the hosted verifier.
STARTER = sys.argv[2] if len(sys.argv) > 2 else None
HEAD = (["\\useglossary{prism.arch@1.0.0}", "\\importmodule{Foundation.Bytes}", "\\importmodule{Foundation.View.Text.V1.Model}",
         "\\title{Text application model}"] if STARTER else ["\\title{Boolean}"])
PROOF_HEAD = (["\\useglossary{prism.arch@1.0.0}", "\\importmodule{Scope}", "\\title{Text application model}"] if STARTER
              else ["\\importmodule{Scope}", "\\title{Boolean}"])
model = ["\\begin{lexlean}{Scope}", "\\useglossary{lexlean.std.bool@1.2.0}", "\\useglossary{lexlean.std.nat@1.2.0}",
         *HEAD, "\\begin{semanticmodule}",
         "structure{\n  name: Request,\n  type_parameters: [],\n  parameters: [],\n  fields: [\n"
         + ",\n".join(f"    {{name: {n}, type: Nat}}" for n in fields) + "\n  ]\n}\n",
         f"definition{{name: targetSlots, parameters: [], result: Nat, body: {N}}}\n",
         f"definition{{name: scopeSlots, parameters: [], result: Nat, body: {M}}}\n",
         f"definition{{name: firstName, parameters: [], result: Nat, body: {NAME}}}\n",
         "definition{name: answerOutside, parameters: [], result: Nat, body: 0}\n",
         "definition{name: answerInside, parameters: [], result: Nat, body: 1}\n"]
# A slot past the stated depth is not looked at. A slot within it must hold a real name.
model.append(d("targetNamed", "Bool", conj([f"(({DP} <? {i}) || ((firstName) <=? {S(i)}))" for i in range(1, N + 1)])))
model.append(d("scopeNamed", "Bool", conj([f"(({SD} <? {j}) || ((firstName) <=? {P(j)}))" for j in range(1, M + 1)])))
model.append(d("wellFormed", "Bool", conj([f"({DP} <=? (targetSlots))", f"(1 <=? {SD})",
                                            f"({SD} <=? (scopeSlots))", "(targetNamed r)", "(scopeNamed r)"])))
model.append(d("prefixMatches", "Bool", conj([f"(({SD} <? {j}) || ({S(j)} =? {P(j)}))" for j in range(1, M + 1)])))
model.append(d("inside", "Bool", conj(["(wellFormed r)", f"({SD} <=? {DP})", "(prefixMatches r)"])))
model.append(d("judge", "Nat", "(if (inside r) then (answerInside) else (answerOutside))"))
hexs = lambda text: "0x" + text.encode("utf-8").hex()
# One request is the 14 numbers in order, separated by single spaces: depth s1..s8 scopeDepth p1..p4.
VECTORS = [
    ("2 3 4 0 0 0 0 0 0 1 3 0 0 0", "inside"),     # /workspace/a.txt in /workspace
    ("1 3 0 0 0 0 0 0 0 1 3 0 0 0", "inside"),     # the scope folder itself
    ("8 3 4 5 6 7 8 9 10 1 3 0 0 0", "inside"),    # deepest readable target
    ("4 3 4 5 6 0 0 0 0 3 3 4 5 0", "inside"),     # a storage folder under a 3-segment scope
    ("4 3 1 4 5 0 0 0 0 1 3 0 0 0", "outside"),    # .. after the scope
    ("3 3 2 4 0 0 0 0 0 1 3 0 0 0", "outside"),    # . segment
    ("3 3 0 4 0 0 0 0 0 1 3 0 0 0", "outside"),    # empty segment
    ("9 3 4 5 6 7 8 9 10 1 3 0 0 0", "outside"),   # deeper than 8
    ("2 3 4 0 0 0 0 0 0 3 3 4 5 0", "outside"),    # parent of the scope
    ("2 3 4 0 0 0 0 0 0 0 0 0 0 0", "outside"),    # empty scope
    ("5 3 4 5 6 7 0 0 0 5 3 4 5 6", "outside"),    # scope deeper than 4
    ("2 4 5 0 0 0 0 0 0 1 3 0 0 0", "outside"),    # another folder
    ("4 3 4 6 7 0 0 0 0 3 3 4 5 0", "outside"),    # another extension's storage
    ("2 3 4 0 0 0 0 0 0 1 3 0 0", "invalid"),      # 13 numbers
    ("2 3 4 0 0 0 0 0 0 1 3 0 0 0 0", "invalid"),  # 15 numbers
    ("2 3 x 0 0 0 0 0 0 1 3 0 0 0", "invalid"),    # not a number
    ("", "invalid"),
]
if STARTER:
    starter = open(STARTER, encoding="utf-8").read()

    def take(name):  # one definition of the starter, word for word
        a = starter.index("definition{\n  name: " + name + ",")
        return starter[a:starter.index("\n}\n", a) + 3]

    opt = "(ctor Option.none [Request])"
    model += [take(n) for n in ("byteAt", "digitsValue", "parseDigits", "parseNumber", "sliceOf", "fieldEnd")]
    # decodeField14 down to decodeField1: each reads one number; the last must end the request.
    for k in range(len(fields), 0, -1):
        got = "".join(f", v{i} : Nat" for i in range(1, k))
        if k == len(fields):
            rec = ", ".join(f"{n} := v{i}" for i, n in enumerate(fields, 1))
            then = f"(if (e =? (Foundation.Bytes::byteLength s)) then (ctor Option.some [Request] (record Request {{{rec}}})) else {opt})"
        else:
            args = "".join(f" v{i}" for i in range(1, k + 1))
            then = f"(if (e <? (Foundation.Bytes::byteLength s)) then (decodeField{k + 1} s (e + 1){args}) else {opt})"
        model.append(f"definition{{\n  name: decodeField{k},\n  parameters: [s : Bytes, start : Nat{got}],\n  result: (Option Request),\n"
                     f"  body: (let e : Nat := (fieldEnd s start (Foundation.Bytes::byteLength s)); (match (parseNumber (sliceOf s start (prim subtract e start : Nat)))\n"
                     f"    | Option.none => {opt}\n    | Option.some v{k} => {then})),\n  axioms: [Quot.sound, propext]\n}}\n")
    model.append("definition{\n  name: encodeAnswer,\n  parameters: [code : Nat],\n  result: Bytes,\n"
                 f"  body: (if (code =? (answerInside)) then {hexs('inside')} else (if (code =? (answerOutside)) then {hexs('outside')} else {hexs('invalid')}))\n}}\n")
    model.append("definition{\n  name: dispatch,\n  parameters: [value : Bytes],\n  result: Bytes,\n"
                 f"  body: (if (64 <? (Foundation.Bytes::byteLength value)) then {hexs('invalid')} else (match (decodeField1 value 0)\n"
                 f"    | Option.none => {hexs('invalid')}\n    | Option.some request => (encodeAnswer (judge request)))),\n  axioms: [Quot.sound, propext]\n}}\n")
    app = take("application")
    V = "Foundation.View.Text.V1.Model::AcceptanceVector"
    vecs = "(nil " + V + ")"
    for req, resp in reversed(VECTORS):
        vecs = f"(cons (record {V} {{request := {hexs(req)}, response := {hexs(resp)}}}) {vecs})"
    a = app.index("acceptanceVectors := ") + len("acceptanceVectors := ")
    depth, b = 0, a
    while True:  # the end of the starter's vector list: its balanced closing parenthesis
        depth += {"(": 1, ")": -1}.get(app[b], 0)
        b += 1
        if depth == 0:
            break
    app = app[:a] + vecs + app[b:]
    for old, new in (("Parking fee tier", "Scope kernel"), ("prism-parking-fee-tier", "prism-scope-kernel"),
                     ("decide the parking fee tier for a vehicle from the hours parked and the vehicle type.",
                      "decide whether a path or host is inside a granted scope."),
                     ("Prism.ParkingFeeTier.dispatch", "Prism.Scope.dispatch"),
                     ("Request: hours vehicle", "Request: depth s1..s8 scopeDepth p1..p4")):
        assert old in app, old
        app = app.replace(old, new)
    assert "ParkingFeeTier" not in app and "arking" not in app, "starter text left in the application record"
    model.append(app)
# lexlean fmt leaves no blank line before the end of a module.
model[-1] = model[-1].rstrip("\n")
model += ["\\end{semanticmodule}", "\\end{lexlean}"]

DEFS = ["Scope::answerInside", "Scope::answerOutside", "Scope::firstName", "Scope::inside", "Scope::judge", "Scope::prefixMatches",
        "Scope::scopeNamed", "Scope::scopeSlots", "Scope::targetNamed", "Scope::targetSlots", "Scope::wellFormed"]
# One module per guarantee, so the verifier names the one it rejects.
modules = {}
proofs = None


def open_module(name):
    global proofs
    proofs = modules[name] = ["\\begin{lexlean}{" + name + "}", "\\useglossary{lexlean.std.bool@1.2.0}", "\\useglossary{lexlean.std.nat@1.2.0}",
                              *PROOF_HEAD, "\\begin{semanticmodule}"]


# The axioms each proof uses, as Lean reports them. The verifier refuses a theorem whose declared list differs.
AXIOMS = {"DescendantUnmatched": "Classical.choice, Quot.sound, propext"}


def claim(name, body, params="[r : Scope::Request]", args="r", only=None):
    open_module("ScopeProof" + name)
    proofs.append(d(f"breaks{name}", "Bool", body, params))
    # `only` names the definitions the proof opens. The rest stay closed, which keeps the search small.
    defs = ",\n      ".join(sorted((only or DEFS) + [f"breaks{name}"]))
    proofs.append(f"theorem{{\n  name: never{name},\n  parameters: {params},\n  statement: ((breaks{name} {args}) = false),\n"
                  f"  proof: linear_arithmetic{{\n    definitions: [\n      {defs}\n    ]\n  }},\n  axioms: [{AXIOMS.get(name, 'Quot.sound, propext')}]\n}}\n")


DP = f("depth")
SD = f("scopeDepth")
IN = "((Scope::judge r) =? (Scope::answerInside))"
used = lambda i: f"({i} <=? {DP})"
# 1. A used segment that is empty, "." or ".." is never inside. This is the traversal guarantee.
claim("UnnamedSegment", f"({IN} && {disj([f'({used(i)} && ({S(i)} <? (Scope::firstName)))' for i in range(1, N + 1)])})")
# 2. A target deeper than the kernel can read is never inside.
claim("TooDeep", f"({IN} && ((Scope::targetSlots) <? {DP}))")
# 3. A target shorter than the scope is never inside, so a scope never admits its own parent.
claim("ShorterThanScope", f"({IN} && ({DP} <? {SD}))")
# 4. An empty scope admits nothing, and neither does one deeper than the kernel can read.
claim("EmptyScope", f"({IN} && ({SD} =? 0))")
claim("ScopeTooDeep", f"({IN} && ((Scope::scopeSlots) <? {SD}))")
# 5. Any difference within the scope's segments is outside.
claim("Mismatch", f"({IN} && {disj([f'(({j} <=? {SD}) && (not ({S(j)} =? {P(j)})))' for j in range(1, M + 1)])})")
# 6. The answer is exactly the stated condition: nothing well formed and matching is turned away.
# Not stated as a theorem: "a well-formed target that has the scope as a prefix and is deep enough is inside".
# It is the definition of `inside` read forwards. linear_arithmetic could not prove it: with the name checks opened
# Lean ran out of time (5 minutes), and with them closed its arithmetic step cannot use a closed definition.
# 7. The answer is inside or outside, nothing else.
claim("OtherAnswer", "(not (((Scope::judge r) =? (Scope::answerInside)) || ((Scope::judge r) =? (Scope::answerOutside))))")
# 8. Everything under an inside target is inside. Stated as: a well-formed target c that is at least as deep as an
# inside target r, under the same scope, and agrees with r on the slots a scope can read, is inside.
# A child, a grandchild and any deeper descendant of r within the readable depth are such targets.
# The first form of this guarantee opened the name checks of both requests and Lean ran out of time (5 minutes);
# here well-formedness stays closed.
g = lambda name: "(project c " + name + ")"
GD = g("depth")
GSD = g("scopeDepth")
GS = lambda i: g("s" + str(i))
GP = lambda j: g("p" + str(j))
# Lean's arithmetic step cannot carry a closed definition from the premise to the conclusion, so this guarantee
# stops one step short. Proved: such a c still has the scope as a prefix and is deep enough. Not proved, but the
# definition of `inside` itself: a well-formed target with those two properties is inside.
under = conj([f"({DP} <=? {GD})", f"({GSD} =? {SD})"]
             + [f"({GP(j)} =? {P(j)})" for j in range(1, M + 1)]
             + [f"({GS(j)} =? {S(j)})" for j in range(1, M + 1)])
claim("DescendantUnmatched", f"(({IN} && {under}) && (not (({GSD} <=? {GD}) && (Scope::prefixMatches c))))",
      params="[r : Scope::Request, c : Scope::Request]", args="r c",
      only=["Scope::answerInside", "Scope::answerOutside", "Scope::inside", "Scope::judge", "Scope::prefixMatches"])
for lines in modules.values():
    lines[-1] = lines[-1].rstrip("\n")
    lines += ["\\end{semanticmodule}", "\\end{lexlean}"]

os.makedirs(out, exist_ok=True)
for old in os.listdir(out):
    if old.startswith("ScopeProof"):
        os.remove(os.path.join(out, old))
for name, lines in [("Scope.lex.tex", model)] + [(m + ".lex.tex", ls) for m, ls in modules.items()]:
    with open(os.path.join(out, name), "w", encoding="utf-8", newline="\n") as fh:
        fh.write("\n".join(lines) + "\n")
    print(name, sum(len(x) + 1 for x in lines), "bytes")
