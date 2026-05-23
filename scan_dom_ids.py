import re
from pathlib import Path
root = Path(r'c:\Users\gungu\Desktop\New folder (2)')
html = (root / 'public' / 'index.html').read_text(encoding='utf-8')
js = (root / 'public' / 'script.js').read_text(encoding='utf-8')
pattern = re.compile(r"\$\('([^']+)'\)|\$\(\"([^\"]+)\"\)|document\.getElementById\('([^']+)'\)|document\.getElementById\(\"([^\"]+)\"\)")
ids = set(x for t in pattern.findall(js) for x in t if x)
missing = [id for id in sorted(ids) if f'id=\"{id}\"' not in html and f"id='{id}'" not in html]
print('Total IDs referenced in script:', len(ids))
print('Missing IDs:', len(missing))
print('\n'.join(missing))
