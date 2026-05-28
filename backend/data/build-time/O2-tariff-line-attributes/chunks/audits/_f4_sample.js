const fs=require('fs');const path=require('path');const base=path.join(__dirname,'..');
const load=n=>JSON.parse(fs.readFileSync(path.join(base,'output',n+'.json'),'utf8'));
const sm10=load('SM-10'),sm11=load('SM-11');
const get=(a,ch)=>a.filter(r=>r.code.slice(0,2)===ch);
function samp(arr,ch,k=3){
  const g=get(arr,ch);const step=Math.max(1,Math.floor(g.length/k));const out=[];
  for(let i=0;i<g.length&&out.length<k;i+=step)out.push(g[i]);
  return out;
}
function show(arr,chs){
  for(const ch of chs){
    console.log('-- Ch.'+ch+' --');
    for(const r of samp(arr,ch)){
      console.log('  '+r.code,'mat='+JSON.stringify(r.material),'form='+JSON.stringify(r.form),'fn='+JSON.stringify(r.function_),'use='+JSON.stringify(r.intended_use),'proc='+JSON.stringify(r.processing_state));
      console.log('     note:',(r.extraction_notes||'').slice(0,95));
    }
  }
}
console.log('===== SM-10 per-chapter sample =====');
show(sm10,['04','10','13','24','34','41','56']);
console.log('\n===== SM-11 per-chapter sample =====');
show(sm11,['11','16','17','19','21','35','60','86']);

// Ch.17 sugar_derivative check: are any 17xx classed as sugar_derivative? should chemical_class be NULL for plain sugars
console.log('\n===== SM-11 Ch.17 chemical_class values (sugars) =====');
const cc17={};for(const r of get(sm11,'17'))cc17[r.chemical_class]=(cc17[r.chemical_class]||0)+1;
console.log('  ',JSON.stringify(cc17));
