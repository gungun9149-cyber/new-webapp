const fs = require('fs');
const path = require('path');
const root = path.resolve('c:\\Users\\gungu\\Desktop\\New folder (2)');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'public', 'script.js'), 'utf8');
const pattern = /\$\('([^']+)'\)|\$\("([^"]+)"\)|document\.getElementById\('([^']+)'\)|document\.getElementById\("([^"]+)"\)/g;
const ids = new Set();
let match;
while ((match = pattern.exec(js)) !== null) {
  for (let i = 1; i <= 4; i++) {
    if (match[i]) ids.add(match[i]);
  }
}
const missing = [...ids].filter(id => !html.includes(`id="${id}"`) && !html.includes(`id='${id}'`));
console.log('Total IDs referenced:', ids.size);
console.log('Missing IDs:', missing.length);
missing.forEach(id => console.log(id));
