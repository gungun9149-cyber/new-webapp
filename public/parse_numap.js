const fs = require('fs');
const path = require('path');
const file = path.join(process.env.TEMP, 'numap_raw.html');
const content = fs.readFileSync(file, 'utf8').split(/\r?\n/);
const markers = [];
const titleRe1 = /var markertitle\s*=\s*"([^"]*)";/;
const titleRe2 = /var markertitle\s*=\s*"?([^";]*)"?;/;
for (let i = 0; i < content.length; i++) {
  const line = content[i];
  const m = line.match(/var markerid\s*=\s*(\d+);/);
  if (m) {
    let title = null;
    let lat = null;
    let lng = null;
    for (let j = i; j < Math.min(content.length, i + 40); j++) {
      const l = content[j];
      if (title === null) {
        const m2 = l.match(titleRe1);
        if (m2) {
          title = m2[1].trim();
        } else {
          const m22 = l.match(titleRe2);
          if (m22) {
            title = m22[1].trim();
            if (title.endsWith(';')) title = title.slice(0, -1).trim();
          }
        }
      }
      if (lat === null) {
        const m3 = l.match(/var markerlat\s*=\s*([0-9\.-]+);/);
        if (m3) lat = parseFloat(m3[1]);
      }
      if (lng === null) {
        const m4 = l.match(/var markerlng\s*=\s*([0-9\.-]+);/);
        if (m4) lng = parseFloat(m4[1]);
      }
    }
    if (title && lat !== null && lng !== null) {
      markers.push({ id: parseInt(m[1], 10), title, lat, lng });
    }
  }
}
console.log(JSON.stringify(markers, null, 2));
