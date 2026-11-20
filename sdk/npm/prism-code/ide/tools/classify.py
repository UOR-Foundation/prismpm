"""Classify every page-side method by the resource it touches.

Usage: python -I tools/classify.py  (run from spike/, after parse_protocol.py)
Writes src/method-table.json and METHOD-TABLE.md.

Classes:
  internal  bookkeeping: registering a provider, logging, the extension's own storage. Not gated.
  show      draws or changes UI.
  read      reads workspace, documents, settings or editor state.
  write     changes files, documents or settings.
  network   data can leave the machine, including model and tunnel calls.
  secrets   credentials, tokens, clipboard contents.
  exec      runs code or commands: terminals, tasks, debug, kernels, arbitrary commands.

The rules below are one person's reading of method names and signatures. They are not reviewed
against each implementation. `basis` records which rule decided, so a reviewer can target the weak ones.
"""
import json, re
from collections import Counter, defaultdict

methods = json.load(open('tools/methods.json', encoding='utf-8'))

AI = 'network'  # model, chat and agent calls send content to a model provider
DEFAULT = {
    'MainThreadCommands': 'exec', 'MainThreadLanguageFeatures': 'internal', 'MainThreadTerminalService': 'exec',
    'MainThreadTerminalShellIntegration': 'exec', 'MainThreadDebugService': 'exec', 'MainThreadTesting': 'exec',
    'MainThreadWorkspace': 'read', 'MainThreadNotebookKernels': 'exec', 'MainThreadSCM': 'show',
    'MainThreadAuthentication': 'secrets', 'MainThreadChatSessions': AI, 'MainThreadTextEditors': 'read',
    'MainThreadLanguageModels': AI, 'MainThreadFileSystem': 'read', 'MainThreadTunnelService': 'network',
    'MainThreadMcpShape': AI, 'MainThreadChatSkills': AI, 'MainThreadTask': 'exec', 'MainThreadComments': 'show', 'MainThreadTreeViews': 'show',
    'MainThreadExtensionService': 'internal', 'MainThreadChatArtifactIntegrations': AI, 'MainThreadSearch': 'internal',
    'MainThreadWebviewPanels': 'show', 'MainThreadPower': 'exec',
    'MainThreadQuickOpen': 'show', 'MainThreadCustomEditors': 'show', 'MainThreadWebviewViews': 'show',
    'MainThreadSpeechProvider': AI, 'MainThreadChatContext': AI, 'MainThreadTimeline': 'show', 'MainThreadLogger': 'internal',
    'MainThreadLanguages': 'read', 'MainThreadOutputService': 'show', 'MainThreadEditorInsets': 'show',
    'MainThreadManagedSockets': 'network', 'MainThreadBrowserTunnelProxy': 'network', 'MainThreadNotebook': 'read',
    'MainThreadBrowsers': 'network', 'MainThreadChatDebug': AI, 'MainThreadGitHub': 'network',
    'MainThreadDataChannels': 'internal', 'MainThreadSecretState': 'secrets', 'MainThreadQuickDiff': 'internal',
    'MainThreadAgentEditorComments': AI, 'MainThreadDecorations': 'show', 'MainThreadDocumentContentProviders': 'internal',
    'MainThreadDocuments': 'read', 'MainThreadProgress': 'show', 'MainThreadStorage': 'internal',
    'MainThreadEditorTabs': 'show', 'MainThreadWebviews': 'show', 'MainThreadNotebookEditorsShape': 'read',
    'MainThreadNotebookDocumentsShape': 'read', 'MainThreadEmbeddings': AI, 'MainThreadCodeMapper': AI,
    'MainThreadUrls': 'internal', 'MainThreadWindow': 'network', 'MainThreadAiRelatedInformation': AI,
    'MainThreadAiSettingsSearch': AI, 'MainThreadClipboard': 'secrets', 'MainThreadConfiguration': 'write',
    'MainThreadDiagnostics': 'show', 'MainThreadDiaglogs': 'show', 'MainThreadStatusBar': 'show',
    'MainThreadUriOpeners': 'internal', 'MainThreadChatOutputRenderer': 'show', 'MainThreadProfileContentHandlers': 'internal',
    'MainThreadFileSystemEventService': 'read', 'MainThreadLabelService': 'internal', 'MainThreadShare': 'network',
    'MainThreadAiEmbeddingVector': AI, 'MainThreadLocalizationShape': 'read', 'MainThreadChatStatus': 'show',
    'MainThreadChatInputNotification': 'show', 'MainThreadGitExtension': 'exec', 'MainThreadBulkEdits': 'write',
    'MainThreadDownloadService': 'network', 'MainThreadErrors': 'internal', 'MainThreadConsole': 'internal',
    'MainThreadMessageService': 'show', 'MainThreadTelemetry': 'network', 'MainThreadNotebookRenderers': 'show',
    'MainThreadDocumentDiff': 'internal', 'MainThreadChatQuota': 'read',
}

# Exact overrides, checked first.
EXACT = {
    'MainThreadCommands.$getCommands': 'read',
    'MainThreadCommands.$fireCommandActivationEvent': 'internal',
    'MainThreadFileSystem.$writeFile': 'write', 'MainThreadFileSystem.$delete': 'write', 'MainThreadFileSystem.$rename': 'write',
    'MainThreadFileSystem.$copy': 'write', 'MainThreadFileSystem.$mkdir': 'write', 'MainThreadFileSystem.$onFileSystemChange': 'internal',
    'MainThreadFileSystem.$ensureActivation': 'internal',
    'MainThreadWorkspace.$saveAll': 'write', 'MainThreadWorkspace.$save': 'write',
    'MainThreadWorkspace.$updateWorkspaceFolders': 'write', 'MainThreadWorkspace.$resolveProxy': 'network',
    'MainThreadWorkspace.$lookupAuthorization': 'secrets', 'MainThreadWorkspace.$lookupKerberosAuthorization': 'secrets',
    'MainThreadWorkspace.$loadCertificates': 'secrets', 'MainThreadWorkspace.$requestWorkspaceTrust': 'show',
    'MainThreadTextEditors.$tryApplyEdits': 'write', 'MainThreadTextEditors.$tryInsertSnippet': 'write',
    'MainThreadTextEditors.$trySetOptions': 'show', 'MainThreadTextEditors.$tryShowTextDocument': 'show',
    'MainThreadTextEditors.$trySetDecorations': 'show', 'MainThreadTextEditors.$trySetDecorationsFast': 'show',
    'MainThreadTextEditors.$tryRevealRange': 'show', 'MainThreadTextEditors.$trySetSelections': 'show',
    'MainThreadTextEditors.$tryShowEditor': 'show', 'MainThreadTextEditors.$tryHideEditor': 'show',
    'MainThreadTextEditors.$removeTextEditorDecorationType': 'show',
    'MainThreadDocuments.$trySaveDocument': 'write', 'MainThreadDocuments.$tryCreateDocument': 'write',
    'MainThreadNotebookEditorsShape.$tryShowNotebookDocument': 'show',
    'MainThreadNotebookEditorsShape.$tryRevealRange': 'show', 'MainThreadNotebookEditorsShape.$trySetSelections': 'show',
    'MainThreadNotebookDocumentsShape.$trySaveNotebook': 'write', 'MainThreadNotebookDocumentsShape.$tryCreateNotebook': 'write',
    'MainThreadLanguages.$changeLanguage': 'write',
    'MainThreadClipboard.$writeText': 'write',
    'MainThreadWindow.$getInitialState': 'read',
    'MainThreadConfiguration.$updateConfigurationOption': 'write', 'MainThreadConfiguration.$removeConfigurationOption': 'write',
    'MainThreadExtensionService.$getExtension': 'read',
    'MainThreadLocalizationShape.$fetchBundleContents': 'network',
}

known = {f"{m['sid']}.{m['method']}" for m in methods}
stale = sorted(k for k in EXACT if k not in known) + sorted(s for s in DEFAULT if s not in {m['sid'] for m in methods})
assert not stale, f'rules that match nothing in this protocol version: {stale}'

REGISTER = re.compile(r'^\$(un)?register|^\$dispose|^\$remove\w*Provider|^\$unset|^\$emit|^\$on[A-Z]')

table = {}
basis_count = Counter()
unknown_ifaces = set()
for m in methods:
    key = f"{m['sid']}.{m['method']}"
    if key in EXACT:
        cls, basis = EXACT[key], 'exact'
    elif REGISTER.match(m['method']) and DEFAULT.get(m['sid']) not in ('exec',):
        cls, basis = 'internal', 'register-pattern'
    elif REGISTER.match(m['method']):
        # registering a terminal profile, task provider or debug adapter runs nothing by itself
        cls, basis = 'internal', 'register-pattern'
    elif m['sid'] in DEFAULT:
        cls, basis = DEFAULT[m['sid']], 'interface-default'
    else:
        cls, basis = 'exec', 'unknown-interface'
        unknown_ifaces.add(m['sid'])
    table[key] = {'class': cls, 'basis': basis}
    basis_count[basis] += 1

json.dump({k: v['class'] for k, v in sorted(table.items())}, open('src/method-table.json', 'w', encoding='utf-8'), indent=1)

by_class = Counter(v['class'] for v in table.values())
per_iface = defaultdict(Counter)
for k, v in table.items():
    per_iface[k.split('.')[0]][v['class']] += 1

ORDER = ['internal', 'show', 'read', 'write', 'network', 'secrets', 'exec']
L = []
L.append('# Page-side method table\n')
L.append('Generated by `tools/parse_protocol.py` and `tools/classify.py` from `extHost.protocol.d.ts` of `@codingame/monaco-vscode-api` 39.0.5.')
L.append(f'{len(table)} methods in {len(per_iface)} interfaces. These are the calls an extension worker can make to the page.\n')
L.append('The classification is by rule, from method names and signatures. Nobody has checked it against each implementation. Treat it as a first draft to review, not as a security claim.\n')
L.append('## Totals\n')
L.append('| Class | Meaning | Methods |')
L.append('|---|---|---|')
MEAN = {'internal': 'bookkeeping, not gated', 'show': 'draws or changes UI', 'read': 'reads workspace or editor state',
        'write': 'changes files, documents or settings', 'network': 'data can leave the machine',
        'secrets': 'credentials, tokens, clipboard', 'exec': 'runs code or commands'}
for c in ORDER:
    L.append(f'| {c} | {MEAN[c]} | {by_class[c]} |')
L.append('\n## How each method was decided\n')
L.append('| Basis | Methods | Confidence |')
L.append('|---|---|---|')
CONF = {'exact': 'read individually', 'register-pattern': 'name starts with register, unregister, dispose, emit or on',
        'interface-default': 'inherits its interface\'s class; weakest', 'unknown-interface': 'interface not in the rules; denied as exec'}
for b, n in basis_count.most_common():
    L.append(f'| {b} | {n} | {CONF[b]} |')
L.append('\n## By interface\n')
L.append('| Interface | ' + ' | '.join(ORDER) + ' |')
L.append('|---|' + '---|' * len(ORDER))
for iface in sorted(per_iface, key=lambda i: -sum(per_iface[i].values())):
    L.append(f'| {iface.removeprefix("MainThread")} | ' + ' | '.join(str(per_iface[iface][c] or '') for c in ORDER) + ' |')
L.append('\n## Every method\n')
for c in ORDER:
    keys = sorted(k for k, v in table.items() if v['class'] == c)
    L.append(f'### {c} ({len(keys)})\n')
    L.append(', '.join(f'`{k.removeprefix("MainThread")}`' for k in keys) + '\n')
open('METHOD-TABLE.md', 'w', encoding='utf-8', newline='\n').write('\n'.join(L))
print(dict(by_class)); print(dict(basis_count)); print('unknown interfaces:', sorted(unknown_ifaces))
