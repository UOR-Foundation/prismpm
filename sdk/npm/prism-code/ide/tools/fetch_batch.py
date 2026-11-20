"""Download the most-downloaded web extensions from Open VSX, verify each against the registry's SHA-256,
and unpack them for the spike page.

Usage: python -I tools/fetch_batch.py MANIFESTS_JSON DOWNLOAD_DIR [COUNT]   (run from spike/)

MANIFESTS_JSON is the survey of the top 500 extensions (id, downloads, browser, platform_specific).
Each .vsix is untrusted data: it is only unzipped, never executed here, and paths are checked before writing.
Writes public/ext/<id>/ and dist/ext/<id>/ (when dist exists), plus ext/batch.json listing what was fetched.
"""
import hashlib, json, os, sys, urllib.request, zipfile, io

survey, dl_dir = sys.argv[1], sys.argv[2]
count = int(sys.argv[3]) if len(sys.argv) > 3 else 25
MAX_BYTES = 25 * 1024 * 1024
UA = {'User-Agent': 'ext-compat-survey/0.1'}

def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
        return r.read()

rows = [r for r in json.load(open(survey, encoding='utf-8')) if r.get('browser') and not r.get('platform_specific')]
rows.sort(key=lambda r: -r['downloads'])
os.makedirs(dl_dir, exist_ok=True)
roots = ['public/ext'] + (['dist/ext'] if os.path.isdir('dist') else [])
batch = []
for r in rows:
    if len(batch) >= count:
        break
    ns, name = r['id'].split('.', 1)
    try:
        meta = json.loads(get(f'https://open-vsx.org/api/{ns}/{name}/latest'))
        url = meta['files']['download']
        want = get(meta['files']['sha256']).decode().split()[0].lower()
        data = get(url)
    except Exception as e:
        print('skip', r['id'], 'fetch failed:', e)
        continue
    if len(data) > MAX_BYTES:
        print('skip', r['id'], 'too large:', len(data))
        continue
    got = hashlib.sha256(data).hexdigest()
    if got != want:
        print('skip', r['id'], 'hash mismatch')
        continue
    open(os.path.join(dl_dir, f'{r["id"]}.vsix'), 'wb').write(data)
    z = zipfile.ZipFile(io.BytesIO(data))
    manifest = json.loads(z.read('extension/package.json'))
    files = []
    for info in z.infolist():
        n = info.filename
        if not n.startswith('extension/') or n.endswith('/'):
            continue
        rel = n[len('extension/'):]
        parts = rel.split('/')
        if '..' in parts or rel.startswith('/') or ':' in parts[0]:
            continue  # never write outside the extension's own folder
        for root in roots:
            out = os.path.join(root, r['id'], *parts)
            os.makedirs(os.path.dirname(out), exist_ok=True)
            open(out, 'wb').write(z.read(info))
        files.append(rel)
    for root in roots:
        json.dump(sorted(files), open(os.path.join(root, r['id'], 'files.json'), 'w'))
    batch.append({'id': r['id'], 'version': meta['version'], 'license': meta.get('license'), 'bytes': len(data),
                  'downloads': r['downloads'], 'sha256': got, 'files': len(files),
                  'activationEvents': manifest.get('activationEvents') or [], 'browser': manifest.get('browser')})
    print('ok  ', r['id'], meta['version'], len(data), 'bytes', len(files), 'files')
for root in roots:
    json.dump(batch, open(os.path.join(root, 'batch.json'), 'w'), indent=1)
print(len(batch), 'extensions,', sum(b['bytes'] for b in batch), 'bytes in total')
