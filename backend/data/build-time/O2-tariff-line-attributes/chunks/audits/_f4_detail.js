const fs=require('fs');const path=require('path');const base=path.join(__dirname,'..');
const load=n=>JSON.parse(fs.readFileSync(path.join(base,'output',n+'.json'),'utf8'));
const sm10=load('SM-10'), sm11=load('SM-11');
const get=(arr,ch)=>arr.filter(r=>r.code.slice(0,2)===ch);

console.log('===== SM-10 Ch.34 chemical_class placement (expect other only on mixtures) =====');
for (const r of get(sm10,'34')){
  console.log(r.code, 'cc='+r.chemical_class, '|', JSON.stringify(r.composition));
}

console.log('\n===== SM-10 Ch.56 fabric_construction + role detail =====');
for (const r of get(sm10,'56')){
  console.log(r.code, 'fab='+r.fabric_construction, 'role='+r.intended_role, 'made_up='+r.made_up);
}

console.log('\n===== SM-10 Ch.24 tobacco — scan notes for health commentary =====');
const healthWords=/(health|harm|cancer|warning|danger|addict|disease|smoking kills|injurious|nicotine.*risk)/i;
let flagged=0;
for (const r of get(sm10,'24')){
  const n=(r.extraction_notes||'');
  if(healthWords.test(n)){ console.log('  FLAG',r.code, n); flagged++; }
}
console.log('  tobacco health-commentary flags:', flagged, ' (of '+get(sm10,'24').length+')');
console.log('  sample tobacco notes:');
get(sm10,'24').slice(0,4).forEach(r=>console.log('   ',r.code,'::',(r.extraction_notes||'').slice(0,110)));

console.log('\n===== SM-11 Ch.60 — all knitted? =====');
const ch60=get(sm11,'60');
const notKnit=ch60.filter(r=>r.fabric_construction!=='knitted');
console.log('  Ch.60 n='+ch60.length, 'non-knitted:', notKnit.length, notKnit.map(r=>r.code+'='+r.fabric_construction).join(','));

console.log('\n===== SM-11 8609 rail containers — packaging role =====');
const r8609=sm11.filter(r=>r.code.startsWith('8609'));
r8609.forEach(r=>console.log('  ',r.code,'role='+r.intended_role,'::',(r.description||r.extraction_notes||'').slice(0,80)));
console.log('  Other Ch.86 with a role set:');
get(sm11,'86').filter(r=>r.intended_role).forEach(r=>console.log('   ',r.code,'role='+r.intended_role));

console.log('\n===== SM-11 Ch.21/35 chemical_class=other =====');
for (const ch of ['21','35']){
  console.log('  Ch.'+ch+':');
  get(sm11,ch).filter(r=>r.chemical_class).forEach(r=>console.log('    ',r.code,'cc='+r.chemical_class,'::',(r.extraction_notes||'').slice(0,70)));
}

console.log('\n===== CROSS-CHAPTER VOCAB BLEED CHECK =====');
// SM-10: chemical_class other should ONLY be Ch.34; fabric wadding/other ONLY Ch.56
function bleed(arr,label,rules){
  console.log('  '+label+':');
  for (const r of arr){
    const ch=r.code.slice(0,2);
    for (const [field,allowedChs] of Object.entries(rules)){
      const v=r[field];
      if(v!==null&&v!==undefined&&!allowedChs.includes(ch)){
        console.log('    BLEED',r.code,field+'='+v,'(allowed only:'+allowedChs.join('/')+')');
      }
    }
  }
}
bleed(sm10,'SM-10',{chemical_class:['34'],fabric_construction:['56'],intended_role:['56'],solution_purpose:[]});
bleed(sm11,'SM-11',{chemical_class:['21','35'],fabric_construction:['60'],intended_role:['86'],solution_purpose:[]});
console.log('  (no BLEED lines above = clean)');

console.log('\n===== SM-10 sig-diversity: which repeated signatures (collisions) =====');
function sigCollisions(arr){
  const sig=r=>JSON.stringify([r.material,r.form,r.function_,r.intended_use,r.processing_state,r.composition]);
  const m=new Map();
  for(const r of arr){const s=sig(r);(m.get(s)||m.set(s,[]).get(s)).push(r.code);}
  return [...m.entries()].filter(([s,c])=>c.length>1);
}
const c10=sigCollisions(sm10);
console.log('  SM-10 collision groups:',c10.length);
c10.slice(0,12).forEach(([s,codes])=>console.log('    ['+codes.length+']',codes.join(','),'::',s.slice(0,120)));
const c11=sigCollisions(sm11);
console.log('  SM-11 collision groups:',c11.length);
c11.slice(0,12).forEach(([s,codes])=>console.log('    ['+codes.length+']',codes.join(','),'::',s.slice(0,120)));
