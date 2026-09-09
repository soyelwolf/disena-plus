const fs = require('fs');
const path = require('path');
const dataDir = path.join(__dirname, 'data');
const recs = JSON.parse(fs.readFileSync(path.join(dataDir, 'consignas.json'), 'utf8'));
const rec = recs.find(r => r.IdConsignaText === 'C27-U127-S489');
if (rec && rec.Anexo) {
  console.log('Original length:', rec.Anexo.length);
  rec.Anexo = rec.Anexo.slice(0, 9900) + '... [truncado]';
}
fs.writeFileSync(path.join(dataDir, 'consigna_fix.json'), JSON.stringify([rec]));
console.log('Written consigna_fix.json');
