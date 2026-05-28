const fs=require('fs');const path=require('path');const base=path.join(__dirname,'..');
const load=n=>JSON.parse(fs.readFileSync(path.join(base,'output',n+'.json'),'utf8'));
const loadIn=n=>{const d=JSON.parse(fs.readFileSync(path.join(base,'input',n+'.json'),'utf8'));const m={};for(const c of d.codes)m[c.code]=c.description;return m;};
const sm10=load('SM-10'),sm11=load('SM-11');
const in10=loadIn('SM-10'),in11=loadIn('SM-11');

function check(arr,inMap,name){
  const sig=r=>JSON.stringify([r.material,r.form,r.function_,r.intended_use,r.processing_state,r.composition]);
  const m=new Map();
  for(const r of arr){const s=sig(r);(m.get(s)||m.set(s,[]).get(s)).push(r);}
  const groups=[...m.values()].filter(g=>g.length>1);
  console.log('===== '+name+' collision groups: '+groups.length+' =====');
  let notesSame=0, descSame=0;
  for(const g of groups){
    const notes=new Set(g.map(r=>(r.extraction_notes||'').trim()));
    const descs=new Set(g.map(r=>(inMap[r.code]||'').trim().toLowerCase()));
    if(notes.size===1) notesSame++;
    if(descs.size===1) descSame++;
  }
  console.log('  groups where extraction_notes IDENTICAL across the pair:',notesSame);
  console.log('  groups where source DESCRIPTION identical across pair:',descSame);
  console.log('  --- detail (first 6) ---');
  for(const g of groups.slice(0,6)){
    console.log('  group codes:',g.map(r=>r.code).join(','));
    for(const r of g){
      console.log('     '+r.code+' DESC: '+(inMap[r.code]||'').slice(0,75));
      console.log('              NOTE: '+(r.extraction_notes||'').slice(0,90));
    }
  }
}
check(sm10,in10,'SM-10');
check(sm11,in11,'SM-11');
