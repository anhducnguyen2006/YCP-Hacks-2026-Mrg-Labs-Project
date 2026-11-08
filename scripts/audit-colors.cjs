// Reproducible WCAG sRGB contrast calculation; no dependencies or API requests.
const fs = require('fs');
const path = require('path');
function luminance(hex) {
  const rgb = hex.replace('#', '').match(/../g).slice(0, 3).map(x => parseInt(x, 16) / 255)
    .map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
}
function contrast(a, b) { const x = luminance(a), y = luminance(b); return (Math.max(x,y)+.05)/(Math.min(x,y)+.05); }
const pairs = [
  ['Before: light main text', '#122E50', '#FFFFFF', 4.5],
  ['Before: light secondary text', '#53665E', '#FFFFFF', 4.5],
  ['Before: light footer teal', '#12B886', '#FFFFFF', 4.5],
  ['Before: light placeholder', '#ADB5BD', '#FFFFFF', 4.5],
  ['Before: light input boundary', '#CED4DA', '#FFFFFF', 3],
  ['Before: dark main text', '#F1F5F3', '#1B2930', 4.5],
  ['Before: dark secondary text', '#B4C5BA', '#1B2930', 4.5],
  ['Before: dark input boundary', '#4A6258', '#162229', 3],
  ['After: light main text', '#122E50', '#FFFFFF', 4.5],
  ['After: light secondary text', '#4D6259', '#F5F7F6', 4.5],
  ['After: light placeholder', '#596D63', '#FFFFFF', 4.5],
  ['After: light input boundary', '#71857A', '#FFFFFF', 3],
  ['After: light primary button', '#FFFFFF', '#25633E', 4.5],
  ['After: light accent text', '#25633E', '#EDF2EF', 4.5],
  ['After: dark main text', '#F1F5F3', '#1B2930', 4.5],
  ['After: dark secondary text', '#B4C5BA', '#1B2930', 4.5],
  ['After: dark placeholder', '#B4C5BA', '#162229', 4.5],
  ['After: dark input boundary', '#82988D', '#1B2930', 3],
  ['After: dark primary button', '#10261A', '#65C18C', 4.5],
  ['After: dark accent text', '#65C18C', '#243A30', 4.5],
  ['After: light warning', '#76510B', '#FFF5D6', 4.5],
  ['After: dark warning', '#F5D889', '#3B3017', 4.5],
  ['After: light error', '#A52C35', '#FDEDEF', 4.5],
  ['After: dark error', '#FFB4BD', '#3B252B', 4.5],
];
const results = pairs.map(([role,fg,bg,min])=>({role,fg,bg,ratio:contrast(fg,bg),minimum:min,pass:contrast(fg,bg)>=min}));
fs.mkdirSync('docs',{recursive:true});
fs.writeFileSync('docs/color-contrast.json', JSON.stringify(results,null,2)+'\n');
if (process.argv.includes('--inventory')) {
  const inventory = {};
  function scan(dir) { for (const entry of fs.readdirSync(dir,{withFileTypes:true})) {
    const file=path.join(dir,entry.name);
    if(entry.isDirectory()) scan(file);
    else if(/\.(css|tsx)$/.test(file)) {
      for(const match of fs.readFileSync(file,'utf8').matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
        let hex=match[0].slice(1).toUpperCase();
        if(hex.length===3||hex.length===4) hex=[...hex].map(c=>c+c).join('');
        (inventory['#'+hex]??=new Set()).add(file.replaceAll('\\','/'));
      }
    }
  }}
  scan('frontend/src');
  fs.writeFileSync('docs/color-inventory-before.json',JSON.stringify(Object.fromEntries(Object.entries(inventory).sort().map(([hex,files])=>[hex,[...files]])),null,2)+'\n');
}
for(const r of results) console.log(`${r.role}: ${r.ratio.toFixed(2)}:1 ${r.pass?'PASS':'FAIL'}`);
if(results.some(r=>r.role.startsWith('After:')&&!r.pass)) process.exitCode=1;
