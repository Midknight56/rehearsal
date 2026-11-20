import json, glob, sys, os

# Prints, for each Kiro session whose workspace folder ends with one of the given names:
# start time, folder, title, model, number of turns, credits used (sum of promptTurnSummaries.usage), elapsed seconds.
root = os.path.expanduser('~/.kiro/sessions')
want = [w.lower().replace(chr(92), '/') for w in sys.argv[1:]]
totals = {'credits': 0.0, 'elapsed': 0.0}


def walk(o, acc):
    if isinstance(o, dict):
        if 'promptTurnSummaries' in o:
            for t in o['promptTurnSummaries']:
                acc['credits'] += t.get('usage', 0) or 0
            acc['elapsed'] += o.get('elapsedTime', 0) or 0
            acc['turns'] += 1
        for v in o.values():
            walk(v, acc)
    elif isinstance(o, list):
        for v in o:
            walk(v, acc)


for sj in sorted(glob.glob(root + '/*/*/session.json')):
    try:
        s = json.load(open(sj, encoding='utf8'))
    except Exception:
        continue
    paths = [p.lower().replace(chr(92), '/') for p in s.get('workspacePaths', [])]
    if not any(any(p.endswith(w) for w in want) for p in paths):
        continue
    acc = {'credits': 0.0, 'elapsed': 0.0, 'turns': 0}
    for line in open(os.path.join(os.path.dirname(sj), 'messages.jsonl'), encoding='utf8', errors='ignore'):
        try:
            walk(json.loads(line), acc)
        except Exception:
            continue
    totals['credits'] += acc['credits']
    totals['elapsed'] += acc['elapsed']
    print('%s | %s | %s | model=%s | turns=%d | credits=%.2f | elapsed=%.1f s' % (
        s.get('createdAt', '')[11:19], os.path.basename(paths[0]), s.get('title'), s.get('modelId'), acc['turns'], acc['credits'], acc['elapsed'] / 1000))
print('total credits %.2f, elapsed %.1f s' % (totals['credits'], totals['elapsed'] / 1000))
