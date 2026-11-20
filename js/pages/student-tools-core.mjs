export {RESOURCES,RESOURCE_REVIEW_DATE,SCENARIOS,SCAMS,SECURITY_SOURCES,SECURITY_CHECKS} from './student-tools-data.mjs?v=2026.11.19.1';
export const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const normalize=value=>String(value??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export function filterResources(resources,{query='',category='',mode='',savedOnly=false,saved=[]}={}){
 const tokens=normalize(query).split(/\s+/).filter(Boolean);
 return resources.filter(r=>(!category||r.category===category)&&(!mode||(mode==='campus'?!!r.building:r.online))&&(!savedOnly||saved.includes(r.id))&&tokens.every(t=>normalize([r.name,r.description,r.location,r.category,...r.tags].join(' ')).includes(t)));
}
export function officialURL(value){try{const u=new URL(value);return u.protocol==='https:'&&(u.hostname==='csun.edu'||u.hostname.endsWith('.csun.edu')||u.hostname==='consumer.ftc.gov'||u.hostname==='reportfraud.ftc.gov'||u.hostname==='www.identitytheft.gov')?u.href:'';}catch{return '';}}
export function mapURLs(resource){
 const query=(resource?.building||'California State University Northridge')+', Northridge, CA';
 return {embed:'https://maps.google.com/maps?q='+encodeURIComponent(query)+'&z=16&output=embed',search:'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(query),directions:'https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(query)};
}
export function loadSaved(storage,key,valid=[]){
 try {const a=JSON.parse(storage.getItem(key)||'[]');return Array.isArray(a)?[...new Set(a.filter(x=>valid.includes(x)))]:[];}catch{return [];}
}
export function gradeAnswer(scenario,answer){if(!['phishing','legitimate'].includes(answer))throw Error('Choose a valid answer.');return {correct:scenario.answer===answer,expected:scenario.answer,why:scenario.why,next:scenario.next,clues:scenario.clues};}
export function sanitizeProgress(raw,scenarios){
 const ids=new Set(scenarios.map(s=>s.id));const answers={};
 for(const [id,value] of Object.entries(raw?.answers||{}))if(ids.has(id)&&['phishing','legitimate'].includes(value))answers[id]=value;
 return {answers,index:Math.min(scenarios.length,Math.max(0,Number.isInteger(raw?.index)?raw.index:0))};
}
export function scoreProgress(progress,scenarios){const answered=scenarios.filter(s=>Object.hasOwn(progress.answers,s.id));return {answered:answered.length,total:scenarios.length,correct:answered.filter(s=>progress.answers[s.id]===s.answer).length};}
