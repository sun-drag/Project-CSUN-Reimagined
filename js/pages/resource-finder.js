import {RESOURCES,RESOURCE_REVIEW_DATE,escapeHTML as e,filterResources,loadSaved,officialURL,mapURLs} from './student-tools-core.mjs?v=2026.11.19.1';
const $=id=>document.getElementById(id),KEY='csun-reimagined:resources:saved:v1';
let saved=[],selected='',origin=null,timer;
let requestedResource='';try{requestedResource=new URL(location.href).searchParams.get('resource')||'';}catch{}
try{saved=loadSaved(localStorage,KEY,RESOURCES.map(r=>r.id));}catch{}
const fields=['resource-search','resource-category','resource-mode','resource-saved'];
function announce(message){$('st-toast').textContent=message;$('st-toast').hidden=false;clearTimeout(timer);timer=setTimeout(()=>$('st-toast').hidden=true,3500);}
function current(){return filterResources(RESOURCES,{query:$('resource-search').value,category:$('resource-category').value,mode:$('resource-mode').value,savedOnly:$('resource-saved').checked,saved});}
function persist(){try{localStorage.setItem(KEY,JSON.stringify(saved));return true;}catch{return false;}}
function updateURL(){try{const u=new URL(location.href);u.searchParams.delete('resource');for(const [key,value] of [['q',$('resource-search').value],['category',$('resource-category').value],['mode',$('resource-mode').value],['saved',$('resource-saved').checked?'1':'']])value?u.searchParams.set(key,value):u.searchParams.delete(key);history.replaceState(null,'',u);}catch{}}
function chooseMap(id,{scroll=false}={}){
 const resource=RESOURCES.find(r=>r.id===id&&r.building);selected=resource?.id||'';const urls=mapURLs(resource);
 $('map-resource').value=selected;$('resource-map').src=urls.embed;$('resource-map').title=resource?'Interactive map search for '+resource.building:'Interactive map of California State University Northridge';
 $('map-directions').href=urls.directions;$('map-location').textContent=resource?resource.name+' — '+resource.location:'California State University Northridge · campus overview';
 document.querySelectorAll('[data-resource-card]').forEach(c=>c.classList.toggle('is-map-selected',c.dataset.resourceCard===selected));
 if(scroll){$('campus-map').scrollIntoView({behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});$('map-resource').focus({preventScroll:true});}
}
function toggleSave(id){saved=saved.includes(id)?saved.filter(x=>x!==id):[...saved,id];const kept=persist();render();announce(kept?'Saved resources updated.': 'Updated for this visit. Browser storage is unavailable.');}
function details(id){
 const r=RESOURCES.find(r=>r.id===id);if(!r)return;origin=document.activeElement;
 $('resource-dialog-title').textContent=r.name;$('resource-dialog-body').innerHTML=`<span class="st-tag">${e(r.category)}</span><p>${e(r.description)}</p><dl><dt>Where to start</dt><dd>${e(r.next_step)}</dd><dt>Location</dt><dd>${e(r.location)}</dd>${r.phone?`<dt>Phone</dt><dd><a href="tel:${e(r.phone.replace(/\D/g,''))}">${e(r.phone)}</a></dd>`:''}${r.email?`<dt>Email</dt><dd><a href="mailto:${e(r.email)}">${e(r.email)}</a></dd>`:''}<dt>Current hours, eligibility &amp; appointments</dt><dd>Use the official service page for current instructions. This finder does not book visits.</dd></dl><div class="st-actions"><a class="st-button st-primary" href="${e(officialURL(r.url))}" target="_blank" rel="noopener noreferrer">Open official resource ↗</a>${r.building?'<button id="detail-show-map" class="st-button">Find building on map</button>':''}<button id="detail-save" class="st-button">${saved.includes(id)?'Remove from saved':'Save resource'}</button></div><p class="st-caption">Source reviewed ${e(RESOURCE_REVIEW_DATE)}.</p>`;
 $('detail-save').onclick=()=>{toggleSave(id);$('detail-save').textContent=saved.includes(id)?'Remove from saved':'Save resource';};
 $('detail-show-map')?.addEventListener('click',()=>{$('resource-dialog').close();chooseMap(id,{scroll:true});});
 if(!$('resource-dialog').open)$('resource-dialog').showModal();
}
function render(){
 const rows=current();$('saved-count').textContent=saved.length;$('resource-count').textContent=rows.length+' '+(rows.length===1?'resource':'resources')+' found';
 $('resource-results').innerHTML=rows.map(r=>`<article class="st-resource-card ${selected===r.id?'is-map-selected':''}" data-resource-card="${e(r.id)}"><div class="st-resource-card-top"><span class="st-tag">${e(r.category)}</span><button class="st-save-button" data-save="${e(r.id)}" aria-pressed="${saved.includes(r.id)}" aria-label="${saved.includes(r.id)?'Unsave':'Save'} ${e(r.name)}">${saved.includes(r.id)?'★':'☆'}</button></div><h3>${e(r.name)}</h3><p>${e(r.description)}</p><p class="st-resource-location">${e(r.location)}</p><div class="st-actions"><button class="st-button" data-details="${e(r.id)}">Details &amp; contact</button>${r.building?`<button class="st-button" data-map="${e(r.id)}">Map ↗</button>`:''}<a class="st-text-link" href="${e(officialURL(r.url))}" target="_blank" rel="noopener noreferrer">Official site ↗</a></div></article>`).join('')||'<div class="st-empty"><h3>No resources match those filters.</h3><p>Try a broader search, turn off Saved only, or reset the filters.</p><button id="empty-reset" class="st-button">Reset filters</button></div>';
 $('resource-results').querySelectorAll('[data-save]').forEach(b=>b.onclick=()=>toggleSave(b.dataset.save));
 $('resource-results').querySelectorAll('[data-details]').forEach(b=>b.onclick=()=>details(b.dataset.details));
 $('resource-results').querySelectorAll('[data-map]').forEach(b=>b.onclick=()=>chooseMap(b.dataset.map,{scroll:true}));
 $('empty-reset')?.addEventListener('click',reset);
 const mapped=rows.filter(r=>r.building);$('map-resource').innerHTML='<option value="">Campus overview</option>'+mapped.map(r=>`<option value="${e(r.id)}">${e(r.name)}</option>`).join('');
 if(selected&&!mapped.some(r=>r.id===selected))chooseMap('');else $('map-resource').value=selected;
 updateURL();
}
function reset(){for(const id of fields)id==='resource-saved'?$(id).checked=false:$(id).value='';render();$('resource-search').focus();}
$('resource-category').innerHTML+=[...new Set(RESOURCES.map(r=>r.category))].sort().map(c=>`<option>${e(c)}</option>`).join('');
try{const p=new URL(location.href).searchParams;$('resource-search').value=(p.get('q')||'').slice(0,120);const category=p.get('category');if(RESOURCES.some(r=>r.category===category))$('resource-category').value=category;if(['online','campus'].includes(p.get('mode')))$('resource-mode').value=p.get('mode');$('resource-saved').checked=p.get('saved')==='1';}catch{}
$('resource-filter-form').onsubmit=event=>{event.preventDefault();render();};
$('resource-search').oninput=render;for(const id of fields.slice(1))$(id).onchange=render;
$('clear-filters').onclick=reset;document.querySelectorAll('[data-quick-query]').forEach(b=>b.onclick=()=>{$('resource-search').value=b.dataset.quickQuery;$('resource-category').value='';$('resource-mode').value='';$('resource-saved').checked=false;render();});
$('map-resource').onchange=()=>chooseMap($('map-resource').value);$('resource-dialog-close').onclick=()=>$('resource-dialog').close();
$('resource-dialog').addEventListener('close',()=>(origin?.isConnected?origin:$('resource-search'))?.focus());
render();
if(RESOURCES.some(r=>r.id===requestedResource))details(requestedResource);
