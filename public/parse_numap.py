import re, json, os
path = os.path.join(os.environ['TEMP'], 'numap_raw.html')
with open(path, 'r', encoding='utf-8') as f:
    lines = f.readlines()
markers = []
for i, line in enumerate(lines):
    m = re.search(r'var markerid\s*=\s*(\d+);', line)
    if m:
        id = int(m.group(1))
        title = None
        lat = None
        lng = None
        for j in range(i, min(len(lines), i + 40)):
            if title is None:
                m2 = re.search(r'var markertitle\s*=\s*"([^"]*)";', lines[j])
                if m2:
                    title = m2.group(1).strip()
                else:
                    m2 = re.search(r'var markertitle\s*=\s*"?([^";]*)"?;', lines[j])
                    if m2:
                        title = m2.group(1).strip()
                        if title.endswith(';'):
                            title = title[:-1].strip()
            if lat is None:
                m3 = re.search(r'var markerlat\s*=\s*([0-9\.-]+);', lines[j])
                if m3:
                    lat = float(m3.group(1))
            if lng is None:
                m4 = re.search(r'var markerlng\s*=\s*([0-9\.-]+);', lines[j])
                if m4:
                    lng = float(m4.group(1))
        if title and lat is not None and lng is not None:
            markers.append({ 'id': id, 'title': title, 'lat': lat, 'lng': lng })
print(json.dumps(markers, ensure_ascii=False, indent=2))
