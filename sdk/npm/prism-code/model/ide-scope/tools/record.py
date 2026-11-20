"""Write verification.json for the scope kernel from the files as they stand. Usage: python -I tools/record.py [attestation]

Run from the model's folder after `lexlean lock && lexlean fmt --all && lexlean lock && lexlean verify --all` has passed
in the SDK image the record names. The workflow ide-kernels-model.yml then holds the record to these exact bytes.
"""
import hashlib, json, os, re, sys

IMAGE = "ghcr.io/uor-foundation/prismpm-sdk-candidate@sha256:cd3b47d7a370c4a26b8285f5e9c3bb15e639973c55505c3809ddbe55352fea58"
sha = lambda p: "sha256:" + hashlib.sha256(open(p, "rb").read()).hexdigest()
sources = ["lexlean.toml", "lexlean.lock"] + sorted("src/" + n for n in os.listdir("src") if n.endswith(".lex.tex"))
theorems = []
for path in sources:
    if not path.startswith("src/ScopeProof"):
        continue
    text = open(path, encoding="utf-8").read()
    for name, axioms in re.findall(r"theorem\{\s*name: (\w+),.*?axioms: \[([^\]]*)\]", text, re.S):
        theorems.append({"name": name, "module": os.path.basename(path)[: -len(".lex.tex")], "axioms": [a.strip() for a in axioms.split(",") if a.strip()]})
record = {
    "schema": "prism/model-verification/1",
    "project": "prism-ide-scope",
    "command": "lexlean lock && lexlean verify --all",
    "image": IMAGE,
    "lean": "4.32.1",
    "result": f"verified {len(sources) - 2} modules",
    "attestation": sys.argv[1] if len(sys.argv) > 1 else None,
    "sources": {p: sha(p) for p in sources},
    "theorems": theorems,
}
with open("verification.json", "w", encoding="utf-8", newline="\n") as fh:
    json.dump(record, fh, indent=2)
    fh.write("\n")
print(record["result"], "|", len(theorems), "theorems", "| attestation", record["attestation"])
