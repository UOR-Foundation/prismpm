"""Extract every page-side (MainThread*) method from VS Code's extension protocol.

Usage: python -I tools/parse_protocol.py  (run from spike/)
Writes tools/methods.json: [{"iface", "sid", "method", "params"}].
"""
import json, re

SRC = 'node_modules/@codingame/monaco-vscode-api/vscode/src/vs/workbench/api/common/extHost.protocol.d.ts'
text = open(SRC, encoding='utf-8').read()

# MainContext maps a property to an interface (in the .d.ts) and to the name used on the wire (in the .js).
# The two names differ for a few interfaces, and the wire name is what the page sees at run time.
wire = dict(re.findall(r'(\w+):\s*\(\s*createProxyIdentifier\("(\w+)"\)', open(SRC.replace('.d.ts', '.js'), encoding='utf-8').read()))
sids = dict((shape, wire.get(prop, prop)) for prop, shape in re.findall(r'(\w+):\s*import\([^)]*\)\.ProxyIdentifier<(\w+)>', text))

methods = []
for m in re.finditer(r'export interface (MainThread\w*Shape)\b[^{]*\{', text):
    iface = m.group(1)
    depth, i = 1, m.end()
    while depth and i < len(text):
        depth += {'{': 1, '}': -1}.get(text[i], 0)
        i += 1
    body = text[m.end():i - 1]
    for mm in re.finditer(r'^\s*(\$\w+)\s*(?=[<(])', body, re.M):
        k = mm.end()
        if body[k] == '<':  # skip type parameters, which may nest and may contain "=>"
            d = 0
            while True:
                if body[k] == '<': d += 1
                elif body[k] == '>' and body[k - 1] != '=': d -= 1
                k += 1
                if d == 0: break
        if body[k] != '(':
            continue
        # take the parameter list up to the matching parenthesis
        mm_end = k + 1
        j, d = mm_end, 1
        while d and j < len(body):
            d += {'(': 1, ')': -1}.get(body[j], 0)
            j += 1
        params = re.sub(r'\s+', ' ', body[mm_end:j - 1]).strip()
        methods.append({'iface': iface, 'sid': sids.get(iface, iface.removesuffix('Shape')), 'method': mm.group(1), 'params': params})

json.dump(methods, open('tools/methods.json', 'w', encoding='utf-8'), indent=1)
# Every page-side interface name on the wire, including the ones that declare no methods.
all_sids = sorted(sids[s] for s in set(re.findall(r'export interface (MainThread\w*Shape)\b', text)) if s in sids)
json.dump(all_sids, open('src/method-sids.json', 'w', encoding='utf-8'), indent=1)
ifaces = sorted({m['iface'] for m in methods})
print(len(methods), 'methods in', len(ifaces), 'interfaces')
from collections import Counter
for name, n in Counter(m['sid'] for m in methods).most_common():
    print(f'{n:4d} {name}')
