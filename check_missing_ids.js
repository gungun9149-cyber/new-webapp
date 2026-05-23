const fs = require('fs');
const path = require('path');
const root = path.resolve('c:\\Users\\gungu\\Desktop\\New folder (2)');
const js = fs.readFileSync(path.join(root, 'public', 'script.js'), 'utf8').split('\n');
const missing = [
  'btn-select-route-start','btn-select-route-end','profile-joined','current-pin','profile-level-badge','impact-big','card-walk','card-route','sec-modal','sec-route','sec-walk','route-results','ptA','ptB','rw','fp','r-dist','r-steps','r-time','r-cal','r-co2','r-fuel','r-baht','r-bmonth','route-sum','stairs-keyframes'
];
for (const id of missing) {
  console.log('===', id, '===');
  js.forEach((line, idx) => {
    if (line.includes(id)) {
      console.log(`${idx+1}: ${line}`);
    }
  });
}
