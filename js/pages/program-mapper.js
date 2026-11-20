import {initialState, clone, withSuggestedPaths, derivePlan, autoSchedule, validatePlan, moveCourse,
  createLink, makeTerms, termKey, termLabel, termOrder, courseUnits, plannedCourseUnits, choiceDescriptors, choiceCourseOptions,
  geOptions, GE_ALIASES, importPlan, exportPlan, safeOfficialUrl, ruleUnitRange, selectedRoadmap, applyChoiceSelection} from './program-mapper-core.mjs?v=2026.11.19.3';

// The page is static-host compatible. Catalog access is configurable; database secrets never belong here.
const STORAGE_KEY='csun-reimagined:program-mapper:v3';
const $=id=>document.getElementById(id);
const e=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const icons={
  plus:'M12 5v14M5 12h14',close:'m6 6 12 12M18 6 6 18',check:'m5 12 4 4L19 6',
  download:'M12 3v12m-5-5 5 5 5-5M5 16v5h14v-5',upload:'M12 16V4m-5 5 5-5 5 5M5 17v4h14v-4',
  undo:'M4 9h9a6 6 0 0 1 0 12M4 9l5-5M4 9l5 5',redo:'M20 9h-9a6 6 0 0 0 0 12m9-12-5-5m5 5-5 5',
  link:'m9 15 6-6m-6 9-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m0-3 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0',
  compass:'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm4-16-2 8-8 2 2-8Z',
  sliders:'M4 6h6m4 0h6M4 12h11m4 0h1M4 18h1m4 0h11M10 3v6m5 0v6M5 15v6',
  chevron:'m6 9 6 6 6-6',spark:'m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z',
  shield:'m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Zm-4 9 3 3 5-6',
  more:'M5 12h.1M12 12h.1M19 12h.1',hand:'M8 13V5a2 2 0 0 1 4 0v6-5a2 2 0 0 1 4 0v6-3a2 2 0 0 1 4 0v6c0 5-3 7-7 7-4 0-6-4-9-7a2 2 0 0 1 3-3l1 1',
  info:'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-12v7m0-11v.1',
  lock:'M6 10h12v11H6Zm3 0V6a3 3 0 0 1 6 0v4',
  calendar:'M4 5h16v16H4ZM4 10h16M8 3v4m8-4v4',sun:'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0-14v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5',
  alert:'m12 3 10 18H2Zm0 6v5m0 3v.1',print:'M6 8V3h12v5M6 17H3V8h18v9h-3M6 13h12v8H6Z',
  reset:'M4 4v6h6m-6 0a9 9 0 1 1 1 8',select:'M4 4h16v16H4Zm4 8 3 3 5-6',external:'M14 3h7v7M21 3 10 14M10 3H3v18h18v-7'
};
function icon(name){return `<svg class="pm-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${icons[name]||icons.info}"/></svg>`;}
function hydrateIcons(root=document){root.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));}
let data,state,derived,issues=[],undoStack=[],redoStack=[],selected=new Set(),focused='',dragId='',saveTimer,toastTimer,clickTimer;
let dialogOrigin=null;
const dialog=$('mapper-dialog'), body=$('dialog-body');

function toast(message,error=false){const box=$('mapper-toast');clearTimeout(toastTimer);box.textContent=message;box.classList.toggle('is-error',error);box.hidden=false;toastTimer=setTimeout(()=>box.hidden=true,error?7000:4300);}
function scheduleSave(){clearTimeout(saveTimer);$('save-status').textContent='Saving…';saveTimer=setTimeout(()=>{
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state));$('save-status').textContent='Saved on this browser';$('save-status').classList.remove('is-error');}
  catch{$('save-status').textContent='Export to save your plan';$('save-status').classList.add('is-error');}
},200);}
function commit(next,message='',options={}){
  if(JSON.stringify(next)===JSON.stringify(state))return;
  undoStack.push(clone(state));if(undoStack.length>40)undoStack.shift();redoStack=[];
  state=options.schedule?autoSchedule(data,next,{preserve:options.schedule==='preserve'}):next;
  selected=new Set([...selected].filter(id=>derivePlan(data,state).items.some(c=>c.id===id)));
  render();if(options.sync)syncSetup();scheduleSave();if(message)toast(message);
}
function undo(){if(!undoStack.length)return;redoStack.push(clone(state));state=undoStack.pop();render();syncSetup();scheduleSave();toast('Previous arrangement restored.');}
function redo(){if(!redoStack.length)return;undoStack.push(clone(state));state=redoStack.pop();render();syncSetup();scheduleSave();toast('Change restored.');}
function openDialog(title,eyebrow,html,wide=false){
  if(!dialog.open)dialogOrigin=document.activeElement;
  $('dialog-title').textContent=title;$('dialog-eyebrow').textContent=eyebrow;body.innerHTML=html;
  dialog.classList.toggle('is-wide',wide);dialog.scrollTop=0;hydrateIcons(body);
  if(!dialog.open)dialog.showModal();
}
function closeDialog(){dialog.close();focused='';highlight();dialogOrigin?.focus?.();}
function dialogError(message){let box=$('dialog-error');if(!box){box=document.createElement('p');box.id='dialog-error';box.className='pm-dialog-error';box.setAttribute('role','alert');body.prepend(box);}box.textContent=message;dialog.scrollTop=0;}

function populatePrograms(query=''){
  const majorValue=$('major-select').value||state.settings.major;
  const majors=data.programs.filter(p=>p.type==='major'&&(!query||p.name.toLowerCase().includes(query.toLowerCase())));
  $('major-select').innerHTML=majors.map(p=>`<option value="${e(p.program_id)}">${e(p.name)}</option>`).join('')||'<option value="">No matching major</option>';
  if(majors.some(p=>p.program_id===majorValue))$('major-select').value=majorValue;
}
function syncSetup(){
  $('major-search').value='';populatePrograms();$('major-select').value=state.settings.major;
  $('minor-select').innerHTML='<option value="">No minor</option>'+data.programs.filter(p=>p.type==='minor').map(p=>`<option value="${e(p.program_id)}">${e(p.name.replace(/^Minor in /,''))}</option>`).join('');
  $('minor-select').value=state.settings.minor;
  for(const [id,key] of [['start-year','startYear'],['start-season','startSeason'],['plan-years','years'],['regular-limit','regularLimit'],['summer-limit','summerLimit'],['winter-limit','winterLimit'],['transfer-units','transferUnits']])$(id).value=state.settings[key];
  $('include-summer').checked=state.settings.summer;$('include-winter').checked=state.settings.winter;$('plan-name').value=state.name;
  $('load-mode').value=state.settings.loadMode||'roadmap';$('prior-credit-mode').value=state.settings.priorUnitsMode||'estimate';
  $('regular-limit').disabled=$('load-mode').value!=='custom';$('transfer-units').disabled=$('prior-credit-mode').value!=='transcript';
  syncRoadmaps(state.settings.major);
}

function syncRoadmaps(major){
  const maps=(data.roadmaps||[]).filter(r=>r.program_id===major),selected=selectedRoadmap(data,{settings:{major,roadmap:state.settings.roadmap}});
  $('roadmap-select').innerHTML=`<option value="">${maps.length?'Choose a roadmap reference':'No linked four-year roadmap'}</option>`+maps.map(r=>`<option value="${e(r.roadmap_id)}">${e(r.title)}</option>`).join('');
  $('roadmap-select').value=selected?.roadmap_id||'';$('roadmap-select').disabled=!maps.length;
  $('roadmap-select').required=maps.length>1;
}
function ruleIds(node){return [...new Set([...(node.course_id?[node.course_id]:[]),...(node.children||[]).flatMap(ruleIds),...(node.options||[]).flatMap(o=>ruleIds(o.rule))])];}
function optionLabel(option){const range=ruleUnitRange(option.rule,derived.ix);return `${option.label} · ${range[0]===range[1]?range[0]:range.join('–')} units`;}

function roleFor(c){return c.roles.includes('major')?'major':c.roles.includes('minor')?'minor':c.roles.includes('preparation')?'preparation':c.placeholder?'choice':'ge';}
function roleLabel(c){if(!c.placeholder&&c.choice_ids?.length)return (c.roles.includes('major')?'Major':c.roles.includes('minor')?'Minor':'Program')+' · selected option';if(c.placeholder)return c.geArea?'GE requirement':c.choiceId?'Program requirement':'Degree units';return c.roles.includes('major')&&c.roles.includes('minor')?'Major + minor':({major:'Major course',minor:'Minor course',ge:'GE / added course',preparation:'Prerequisite'})[roleFor(c)];}
function card(c){
  const completed=c.completed,locked=state.locked.includes(c.id),hasIssue=issues.some(i=>i.id===c.id),linked=derived.edges.filter(edge=>edge.from===c.id||edge.to===c.id).length;
  return `<article class="pm-course ${c.placeholder?'is-placeholder':''} ${completed?'is-completed':''} ${locked?'is-locked':''} ${selected.has(c.id)?'is-selected':''}" data-course-id="${e(c.id)}" data-role="${c.geArea?'ge':roleFor(c)}" role="button" tabindex="0" draggable="${!locked&&!completed}" aria-label="${e(c.code+' '+c.title+(completed?', completed':'')+(locked?', locked':''))}">
    <div class="pm-course-top">${!c.placeholder?`<button class="pm-course-complete" data-complete="${e(c.id)}" aria-label="${completed?'Mark incomplete':'Mark completed'}: ${e(c.code)}" aria-pressed="${completed}">${completed?icon('check'):''}</button>`:''}<h3 class="pm-course-code">${e(c.code)}</h3><span class="pm-course-units">${c.units_min==null?'?':e(c.completed?courseUnits(c):plannedCourseUnits(c))}${c.placeholder&&c.units_max>c.units_min?'–'+e(c.units_max):''} units</span></div>
    <p class="pm-course-name">${e(c.title||'Course details need confirmation')}</p>${c.completed_units>0&&!c.completed?`<p class="pm-overlap-note">${e(c.completed_units)} units already completed · ${e(plannedCourseUnits(c))} units remaining</p>`:''}
    ${c.geAppliedAreas?.length&&c.roles.some(r=>r==='major'||r==='minor'||r==='preparation')?`<p class="pm-overlap-note">Also meets ${c.geAppliedAreas.map(a=>'GE / campus '+e(a.replace('CAMPUS-',''))).join(', ')}</p>`:''}
    ${c.requested_variants?.length?`<p class="pm-option-preview">Required variant: ${c.requested_variants.map(e).join(' / ')} · confirm topic / units</p>`:''}
    ${c.choice?.type==='CHOOSE_PATH'?`<p class="pm-option-preview">Choose one: ${c.choice.options.map(o=>e(o.label)).join(' / ')}</p>`:''}
    <div class="pm-course-bottom"><span class="pm-course-kind">${e(roleLabel(c))}</span>${c.placeholder?`<span class="pm-placeholder-action">${c.programReview?'Review program requirements':'Choose course'} ↗</span>`:`<span class="pm-course-status">${locked?icon('lock'):''}${completed?'<span>Completed</span>':linked?icon('link'):''}${hasIssue?`<span class="pm-course-error" title="Review plan check">${icon('alert')}</span>`:''}</span>`}</div>
    ${!c.placeholder?`<button class="pm-card-select" data-select="${e(c.id)}" aria-label="${selected.has(c.id)?'Deselect':'Select for a course link'}: ${e(c.code)}" aria-pressed="${selected.has(c.id)}">${icon(selected.has(c.id)?'check':'select')}</button>`:''}
  </article>`;
}

function render(){
  derived=derivePlan(data,state);issues=validatePlan(data,state,derived);
  $('plan-name').value=state.name;$('program-subtitle').textContent=derived.checklist.major.name+(derived.checklist.minor?' + '+derived.checklist.minor.name.replace(/^Minor in /,''):'');
  const program=derived.ix.programs.get(state.settings.major),minor=derived.ix.programs.get(state.settings.minor);
  $('academic-sources').innerHTML=`<a href="${e(safeOfficialUrl(program.source_url))}" target="_blank" rel="noopener noreferrer">Official major requirements ↗</a>${minor?`<a href="${e(safeOfficialUrl(minor.source_url))}" target="_blank" rel="noopener noreferrer">Official minor requirements ↗</a>`:''}${derived.roadmap?`<a href="${e(safeOfficialUrl(derived.roadmap.source_url))}" target="_blank" rel="noopener noreferrer">Official semester roadmap ↗</a>`:'<span>No four-year reference selected; review the program catalog.</span>'}<span>Catalog ${e(data.metadata.catalog_year)} · reviewed ${e(data.metadata.academic_review_date||data.metadata.build_date)}</span>`;
  $('choice-migration-notice').hidden=!Object.keys(state.legacySelections||{}).length;
  const completed=derived.ledger.earnedUnits;
  const target=derived.terms.at(-1),stats=[[derived.ledger.totalPlannedUnits,'planned + prior units'],[derived.items.filter(c=>!c.completed&&!c.placeholder).length,'courses to go'],[termLabel(target),'target finish'],[completed,derived.ledger.priorUnitsEstimated?'estimated prior + completed units':'completed / prior units']];
  $('plan-stats').innerHTML=stats.map(([v,label])=>`<div><strong>${e(v)}</strong><span>${label}</span></div>`).join('');
  $('credit-summary').innerHTML=`<strong>${e(derived.ledger.requiredFutureUnits+derived.ledger.degreeElectiveUnits+derived.ledger.programReviewUnits)} units left to plan</strong><span>${e(derived.ledger.degreeElectiveUnits)} additional degree-elective units · ${e(derived.ledger.otherPriorUnits)} ${derived.ledger.priorUnitsEstimated?'estimated GE/campus':'reported prior'} units${derived.ledger.programReviewUnits?' · '+e(derived.ledger.programReviewUnits)+' program units need review':''}</span>${derived.ledger.priorUnitsEstimated?'<small>Checked GE areas reduce the remaining credit estimate. Major overlap is counted once. Use your transcript total in Credits & course load for exact figures.</small>':''}`;
  $('plan-progress').style.width=Math.min(100,completed/derived.minimum*100)+'%';
  const progress=$('plan-progress').parentElement;progress.setAttribute('aria-valuenow',Math.min(derived.minimum,completed));progress.setAttribute('aria-valuemax',derived.minimum);
  $('undo-button').disabled=!undoStack.length;$('redo-button').disabled=!redoStack.length;
  $('choices-count').textContent=derived.checklist.choices.length+derived.pendingPrerequisites.length||'✓';$('links-count').textContent=state.links.length;
  const reviewCount=new Set(derived.review.map(r=>r.id)).size;
  $('issue-count').textContent=issues.length+derived.checklist.choices.length+reviewCount;
  $('check-button').classList.toggle('has-issues',issues.length+derived.checklist.choices.length+reviewCount>0);
  $('show-links').checked=state.showLinks;$('move-linked').checked=state.moveLinked;
  renderGE();
  const start=Number(state.settings.startYear)*4+['Winter','Spring','Summer','Fall'].indexOf(state.settings.startSeason);
  const years=new Map();
  for(const term of derived.terms){const year=Math.floor((termOrder(term)-start)/4)+1;if(!years.has(year))years.set(year,[]);years.get(year).push(term);}
  $('roadmap').innerHTML='<div class="pm-roadmap-content"><svg class="pm-links-svg" aria-hidden="true"></svg>'+[...years].map(([year,terms])=>{
    const yearUnits=derived.items.filter(c=>terms.some(t=>t.id===state.positions[c.id])&&!c.completed).reduce((s,c)=>s+plannedCourseUnits(c),0);
    return `<section class="pm-year" aria-label="Year ${year}"><div class="pm-year-label"><span class="pm-year-number">${year}</span><h2>Year ${year}</h2><span>${e(yearUnits)} planned units</span></div><div class="pm-year-terms">${terms.map(term=>{
      const all=derived.items.filter(c=>state.positions[c.id]===term.id),visible=all.filter(c=>state.showCompleted||!c.completed),load=all.filter(c=>!c.completed).reduce((s,c)=>s+plannedCourseUnits(c),0);
      return `<section class="pm-term" data-term-id="${e(term.id)}" aria-label="${e(termLabel(term))}"><div class="pm-term-header"><h3 class="pm-term-title">${icon(term.season==='Summer'?'sun':'calendar')}${e(termLabel(term))}</h3><span class="pm-term-load ${load>term.limit?'is-over':''}" title="${e(term.loadSource==='official-roadmap'?'Semester limit from the official CSUN roadmap':term.loadSource==='custom'?'Your custom course-load limit':term.loadSource==='accelerated'?'Calculated for your shorter timeline':'Standard semester limit')}">${load} / ${e(term.limit)} units</span></div><div class="pm-term-cards">${visible.length?visible.map(card).join(''):'<div class="pm-term-empty">No additional course is needed here.<br>Drag a course here to change your timeline.</div>'}</div>${['Summer','Winter'].includes(term.season)?'<p class="pm-term-season-note">Proposed term · confirm course offerings</p>':''}</section>`;
    }).join('')}</div></section>`;
  }).join('')+'</div>';
  const unscheduled=derived.items.filter(c=>!derived.terms.some(t=>t.id===state.positions[c.id]));
  $('unscheduled-section').hidden=!unscheduled.length;$('unscheduled-count').textContent=unscheduled.length;$('unscheduled-cards').innerHTML=unscheduled.map(card).join('');
  updateSelection();requestAnimationFrame(drawLinks);
}

function renderGE(){
  const areas=derived.baseAreas,allIds=data.ge_areas.map(a=>a.area_id),count=areas.filter(a=>state.geCompleted.includes(a.area_id)).length;
  $('ge-progress-badge').textContent=`${count} / ${areas.length}`;
  $('ge-all').checked=allIds.every(id=>state.geCompleted.includes(id));$('ge-all').indeterminate=state.geCompleted.length>0&&!$('ge-all').checked;
  $('ge-checklist').innerHTML=areas.map(a=>{
    const done=state.geCompleted.includes(a.area_id),covered=!done&&a.additional_units_to_plan===0;
    const name=a.area_id==='5B'?'Biological science (B2)':a.name;
    return `<div class="pm-ge-row ${done?'is-done':''}"><label><input type="checkbox" data-ge="${e(a.area_id)}" ${done?'checked':''}><span class="pm-ge-code">${e(a.area_id.replace('CAMPUS-',''))}</span><span class="pm-ge-name">${e(name)}</span></label><span class="${covered?'pm-covered':'pm-ge-units'}">${covered?a.reserved_by_choices?.length?'Course choice':'In plan':a.required_units+'u'}</span></div>`;
  }).join('');
  $('ge-overlays').innerHTML=derived.checklist.ge_requirements.filter(a=>a.kind==='overlay').map(a=>`<div class="pm-overlay-item"><label class="pm-detail-check"><input type="checkbox" data-ge="${e(a.area_id)}" ${state.geCompleted.includes(a.area_id)?'checked':''}><strong>${e(a.area_id)}</strong></label>${e(a.name)}<br><span>${a.eligible_planned_courses.length} eligible planned course${a.eligible_planned_courses.length===1?'':'s'} · distribution still applies</span><br><button class="pm-choice-remove" data-overlay-picker="${e(a.area_id)}">Find eligible courses</button></div>`).join('');
}

function connected(id){const seen=new Set(id?[id]:[]);for(let n=0;n<derived.items.length;n++){let changed=false;for(const edge of derived.edges)if(seen.has(edge.from)||seen.has(edge.to))for(const part of [edge.from,edge.to])if(!seen.has(part)){seen.add(part);changed=true;}if(!changed)break;}return seen;}
function highlight(){const related=connected(focused);document.querySelectorAll('.pm-course').forEach(el=>el.classList.toggle('is-related',related.has(el.dataset.courseId)));drawLinks();}
function updateSelection(){
  $('selection-bar').hidden=!selected.size;$('selection-count').textContent=`${selected.size} selected`;
  document.body.classList.toggle('has-selection',!!selected.size);
  document.querySelectorAll('.pm-course').forEach(el=>{
    const isSelected=selected.has(el.dataset.courseId);el.classList.toggle('is-selected',isSelected);
    const b=el.querySelector('[data-select]');if(b){b.setAttribute('aria-pressed',isSelected);b.innerHTML=icon(isSelected?'check':'select');}
  });
}
function selectCourse(id){selected.has(id)?selected.delete(id):selected.add(id);updateSelection();focused=id;highlight();}
function drawLinks(){
  const board=$('roadmap').querySelector('.pm-roadmap-content'),svg=board?.querySelector('.pm-links-svg');if(!svg||!derived)return;
  svg.innerHTML='';if(!state.showLinks)return;
  const rect=board.getBoundingClientRect(),related=connected(focused);
  svg.setAttribute('width',rect.width);svg.setAttribute('height',rect.height);
  const ns='http://www.w3.org/2000/svg';
  for(const edge of derived.edges.slice(0,180)){
    const source=board.querySelector(`[data-course-id="${CSS.escape(edge.from)}"]`),target=board.querySelector(`[data-course-id="${CSS.escape(edge.to)}"]`);
    if(!source||!target||source===target)continue;
    const a=source.getBoundingClientRect(),b=target.getBoundingClientRect();let path;
    if(Math.abs(a.top-b.top)<100 && b.left>a.right){
      const x1=a.right-rect.left,y1=a.top+a.height/2-rect.top,x2=b.left-rect.left,y2=b.top+b.height/2-rect.top,mid=(x1+x2)/2;
      path=`M${x1} ${y1} C${mid} ${y1},${mid} ${y2},${x2} ${y2}`;
    } else {
      const down=b.top>=a.top,x1=a.left+a.width*.7-rect.left,y1=(down?a.bottom:a.top)-rect.top,x2=b.left+b.width*.3-rect.left,y2=(down?b.top:b.bottom)-rect.top,mid=(y1+y2)/2;
      path=`M${x1} ${y1} C${x1} ${mid},${x2} ${mid},${x2} ${y2}`;
    }
    const line=document.createElementNS(ns,'path');line.setAttribute('d',path);line.dataset.from=edge.from;line.dataset.to=edge.to;
    line.setAttribute('class','pm-link-path'+(edge.kind==='corequisite'?' is-corequisite':'')+(edge.linkId?' is-custom':'')+(focused?(related.has(edge.from)&&related.has(edge.to)?' is-highlighted':' is-dim'):''));
    svg.append(line);
  }
}

function toggleCompleted(id){
  const c=derived.items.find(c=>c.id===id);if(!c||c.placeholder)return;
  const next=clone(state),done=c.completed,parts=c.required_components||c.components.map(p=>p.component_id);if(done){const keep=new Set(next.completed.flatMap(code=>derived.ix.aliases.get(code)?.components||[code]));parts.forEach(p=>keep.delete(p));next.completed=[...keep];}else next.completed=[...new Set([...next.completed,...(parts.length===c.components.length?[id]:parts)])];
  commit(next,`${c.code} marked ${done?'incomplete':'complete'}.`);
}
function requestMove(id,term){
  const result=moveCourse(data,state,id,term);
  if(!result.ok){toast(result.message,true);if(dialog.open)dialogError(result.message);return false;}
  commit(result.state,`${result.moved.length>1?result.moved.length+' linked / dependent courses moved':'Course moved'}${result.warnings.length?' · review semester unit loads':''}.`);
  return true;
}

function openCourse(id){
  const c=derived.items.find(c=>c.id===id);if(!c)return;
  if(c.programReview){openDialog('Confirm these program requirements','PROGRAM CREDIT REVIEW',`<p>The catalog’s program requirements and the selected roadmap leave ${e(derived.ledger.programReviewUnits)} units to reconcile. These are reserved for program-specific requirements and are not unrestricted degree electives.</p><p>Complete the program’s course selections and review its official requirements before choosing these courses.</p><a class="pm-source-link" href="${e(safeOfficialUrl(c.source_url))}" target="_blank" rel="noopener noreferrer">Official program requirements ↗</a><div class="pm-dialog-footer"><button id="review-program-credit-choices" class="pm-button pm-button-primary">Review program choices</button></div>`);$('review-program-credit-choices').onclick=()=>openChoices();return;}
  if(c.placeholder){if(c.choiceId)openChoiceSlot(id);else openPicker({area:c.geArea||'',replaceId:c.id,targetTerm:state.positions[c.id],upperDivision:c.level==='upper_division'});return;}
  focused=id;highlight();
  const details=data.course_details?.[c.details_key]||{},url=safeOfficialUrl(c.source_url),locked=state.locked.includes(id),completed=c.completed;
  const incoming=derived.edges.filter(edge=>edge.to===id),outgoing=derived.edges.filter(edge=>edge.from===id),links=state.links.filter(g=>g.members.includes(id));
  const review=derived.review.filter(r=>r.id===id),parts=c.components?.filter(p=>!c.required_components?.length||c.required_components.includes(p.component_id)).map(p=>p.code).join(' + ');
  const termOptions=derived.terms.map(t=>`<option value="${e(t.id)}" ${state.positions[id]===t.id?'selected':''}>${e(termLabel(t))}</option>`).join('');
  const prerequisites=incoming.map(edge=>derived.items.find(x=>x.id===edge.from)?.code||edge.from.replaceAll('-',' '));
  const descendants=(course,seen=new Set())=>{if(seen.has(course))return 0;const next=new Set(seen).add(course);return Math.max(0,...derived.edges.filter(e=>e.from===course).map(e=>e.gap+descendants(e.to,next)));};
  const latest=derived.terms[Math.max(0,derived.terms.length-1-descendants(id))];
  openDialog(c.code,c.title||'COURSE DETAILS',`
    <div class="pm-detail-badges"><span class="pm-pill">${e(c.units_min??'?')} units${c.units_max!==c.units_min&&c.units_max?' · variable':''}</span><span class="pm-pill">${e(roleLabel(c))}</span>${c.components?.length>1?'<span class="pm-pill">Lecture + lab</span>':''}${completed?'<span class="pm-pill is-green">Completed</span>':''}${links.length?`<span class="pm-pill is-purple">${links.length} course link${links.length===1?'':'s'}</span>`:''}</div>
    <p class="pm-course-description">${e(c.description||details.description||'A catalog description is not available in this snapshot. Open the official source to confirm this course’s content and requirements.')}</p>
    ${url?`<a class="pm-source-link" href="${e(url)}" target="_blank" rel="noopener noreferrer">Open official CSUN ${c.source_coverage==='individual_course_page'?'course page':'source'} ${icon('external')}</a>`:''}
    <p class="pm-source-note">Catalog excerpt · ${e(data.metadata.catalog_year)} planning snapshot</p>
    ${c.completed_units>0&&!completed?`<p class="pm-rule-box">${e(c.completed_units)} units are already completed. Only the remaining ${e(plannedCourseUnits(c))} units are included in future semester loads.</p>`:''}
    ${c.choiceRefs?.length?`<p><button id="detail-replace-selection" class="pm-button pm-button-primary">Replace this course selection</button></p><p class="pm-source-note">${e(c.choiceRefs[0].label)} · the other selections stay in your plan.</p>`:''}
    ${derived.prerequisiteChoices.some(p=>p.course_id===id)?'<p><button id="detail-prerequisite-choice" class="pm-button pm-button-small">Choose prerequisite route</button></p>':''}
    ${c.components?.length>1?`<div class="pm-rule-box"><strong>Included components</strong><br>${e(parts)}<br>Lecture and lab move as one card.</div>`:''}
    <h3>Before you take it</h3><div class="pm-rule-box"><strong>Prerequisites</strong><br>${e(details.prerequisite_text|| (prerequisites.length?prerequisites.join(', '):'No course prerequisite stated in this snapshot.'))}${details.corequisite_text?`<br><strong>Corequisites</strong><br>${e(details.corequisite_text)}`:''}</div>
    ${c.note?`<p class="pm-dialog-note">${e(c.note)}</p>`:''}
    ${review.length?`<p class="pm-dialog-note">${e([...new Set(review.map(r=>r.message))].join(' '))}</p>`:''}
    ${outgoing.length?`<h3>Courses that follow</h3><div class="pm-related-list">${outgoing.map(edge=>`<button class="pm-related-chip" data-detail-course="${e(edge.to)}">${e(derived.items.find(c=>c.id===edge.to)?.code||edge.to)}</button>`).join('')}</div><p class="pm-source-note">Latest sequence start to keep dependent courses in this timeline: ${e(termLabel(latest))}. Placement and course offerings can change this window.</p>`:''}
    <h3>Make it fit your plan</h3><div class="pm-move-row"><label class="pm-field">Move to semester<select id="detail-term">${termOptions}</select></label><button id="detail-move" class="pm-button pm-button-primary">Move course</button></div>
    <div class="pm-detail-actions"><button id="detail-complete" class="pm-button pm-button-small">${icon('check')} ${completed?'Mark incomplete':'Mark completed'}</button><button id="detail-lock" class="pm-button pm-button-small">${icon('lock')} ${locked?'Unlock semester':'Lock semester'}</button><button id="detail-select" class="pm-button pm-button-small">${icon('link')} ${selected.has(id)?'Remove from selection':'Select for course link'}</button></div>
    ${links.length?`<div class="pm-rule-box"><strong>Your course links</strong><br>${links.map(l=>e(l.label)+' · '+e(l.kind==='corequisite'?'same semester':'sequence')).join('<br>')}</div>`:''}
    <details><summary class="pm-small-muted">Course notes & availability</summary><label class="pm-field">Your notes<textarea id="detail-notes" rows="3" maxlength="2000" placeholder="Transfer equivalency, advising notes, preferred professor…">${e(state.notes[id]||'')}</textarea></label>${c.components?.length===1&&(c.original_units_min??c.units_min)!==(c.original_units_max??c.units_max)?`<label class="pm-field">Planned units · catalog range ${e(c.original_units_min??c.units_min)}–${e(c.original_units_max??c.units_max)}<input id="detail-units" type="number" min="${e(c.original_units_min??c.units_min)}" max="${e(c.original_units_max??c.units_max)}" step="0.5" value="${e(c.units_min)}"></label>`:''}<fieldset class="pm-session-options"><legend>Seasons you want to consider</legend>${['Fall','Winter','Spring','Summer'].map(season=>`<label><input type="checkbox" data-available="${season}" ${!state.availability[id]?.length||state.availability[id].includes(season)?'checked':''}>${season}</label>`).join('')}</fieldset><p class="pm-source-note">These are your preferences, not verified CSUN offerings.</p><button id="detail-save-notes" class="pm-button pm-button-small">Save notes & preferences</button></details>
    <div class="pm-danger-section"><small>Removing a required course leaves a requirement to review.</small><button id="detail-remove" class="pm-button pm-button-small pm-button-danger">Remove from my plan</button></div>`);
  $('detail-move').onclick=()=>{if(requestMove(id,$('detail-term').value))openCourse(id);};
  $('detail-complete').onclick=()=>{toggleCompleted(id);openCourse(id);};
  $('detail-lock').onclick=()=>{const n=clone(state);n.locked=locked?n.locked.filter(x=>x!==id):[...n.locked,id];commit(n,locked?'Course unlocked.':'Semester locked.');openCourse(id);};
  $('detail-select').onclick=()=>{selectCourse(id);closeDialog();};
  $('detail-replace-selection')?.addEventListener('click',()=>openChoiceSlot(id));
  body.querySelectorAll('[data-change-choice]').forEach(b=>b.onclick=()=>openChoices(b.dataset.changeChoice));
  $('detail-prerequisite-choice')?.addEventListener('click',()=>openChoices());
  body.querySelectorAll('[data-detail-course]').forEach(b=>b.onclick=()=>openCourse(b.dataset.detailCourse));
  $('detail-save-notes').onclick=()=>{const n=clone(state);n.notes[id]=$('detail-notes').value;n.availability[id]=[...body.querySelectorAll('[data-available]:checked')].map(x=>x.dataset.available);if(!n.availability[id].length){dialogError('Choose at least one season.');return;}if($('detail-units')){const input=$('detail-units'),value=Number(input.value);if(value<Number(input.min||input.getAttribute('min'))||value>Number(input.max||input.getAttribute('max'))){dialogError('Use a planned unit value inside the catalog range.');return;}n.unitOverrides[id]=value;}commit(n,'Course preferences saved.');openCourse(id);};
  $('detail-remove').onclick=()=>{
    openDialog('Remove this course?','EDIT YOUR ROADMAP',`<p>Remove <strong>${e(c.code)}</strong> from the roadmap? A required course will stay listed in Plan check until you restore it. Any course links containing it will also be removed.</p><div class="pm-dialog-footer"><button id="cancel-remove" class="pm-button">Keep course</button><button id="confirm-remove" class="pm-button pm-button-danger">Remove course</button></div>`);
    $('cancel-remove').onclick=()=>openCourse(id);$('confirm-remove').onclick=()=>{const n=clone(state);n.removed.push(id);n.added=n.added.filter(x=>x!==id);delete n.geAssignments[id];n.locked=n.locked.filter(x=>x!==id);n.links=n.links.filter(g=>!g.members.includes(id));selected.delete(id);commit(n,`${c.code} removed. Undo can bring it back.`,{schedule:'preserve'});closeDialog();};
  };
}

function openChoiceSlot(id){
  const card=derived.items.find(c=>c.id===id);if(!card)return;
  const reference=card.choiceRefs?.[0],choiceId=card.choiceId||reference?.choiceId;
  const descriptor=choiceDescriptors(data,state).find(c=>c.choice_id===choiceId);if(!descriptor)return;
  const context={choiceId,replaceValue:reference?.value||'',replaceId:card.placeholder?id:'',targetTerm:state.positions[id],singleSlot:true};
  if(!descriptor.options?.length){openPicker(context);return;}
  openDialog(reference?'Replace this selection':'Choose this course or pathway',descriptor.label,
    `<p>${reference?'Choose a replacement for '+e(card.code)+'. The other courses selected for this requirement stay in your plan.':'Choose one eligible option for this box. Remaining selections keep their own boxes.'}</p>
    <input id="choice-slot-search" type="search" placeholder="Search these options" aria-label="Search course options"><div id="choice-slot-results" class="pm-picker-results"></div>
    <p class="pm-source-note">${e(state.positions[id]?termLabel(derived.terms.find(t=>t.id===state.positions[id])):'Choose a semester after selection')} · prerequisites and the semester limit still apply.</p>
    <div class="pm-dialog-footer">${reference?'<button id="clear-slot-selection" class="pm-button">Clear this selection</button>':''}<button id="all-slot-choices" class="pm-button">Review whole requirement</button><button id="close-slot-picker" class="pm-button">Cancel</button></div>`,true);
  const update=value=>{
    const result=applyChoiceSelection(data,state,choiceId,value,{replaceValue:context.replaceValue,placeholderId:context.replaceId,targetTerm:context.targetTerm});
    if(!result.ok){dialogError(result.message);return;}
    commit(result.state,value?'Your course selection replaced its box.':'Selection cleared.',{schedule:'preserve'});closeDialog();
    if(!result.courseIds.length&&value){const next=derived.items.find(c=>c.choiceId&&c.choiceId!==choiceId&&state.positions[c.id]===context.targetTerm);if(next)openChoiceSlot(next.id);}
  };
  function results(){const query=$('choice-slot-search').value.toLowerCase().trim();
    const options=descriptor.options.filter(o=>(o.label+' '+ruleIds(o.rule).map(id=>derived.ix.courses.get(id)?.title||'').join(' ')).toLowerCase().includes(query));
    $('choice-slot-results').innerHTML=options.map(o=>`<button class="pm-picker-row" data-slot-option="${e(o.id)}"><div><strong>${e(o.label)}${reference?.value===o.id?' · Current selection':''}</strong><small>${ruleIds(o.rule).length<=8?ruleIds(o.rule).map(id=>e(derived.ix.courses.get(id)?.title||id)).join('; '):'Choose this pathway to review its course selections.'}</small></div><span>${e(optionLabel(o).split(' · ').at(-1))}</span></button>`).join('')||'<p>No matching option.</p>';
    $('choice-slot-results').querySelectorAll('[data-slot-option]').forEach(button=>button.onclick=()=>update(button.dataset.slotOption));
  }
  $('choice-slot-search').oninput=results;$('clear-slot-selection')?.addEventListener('click',()=>update(''));
  $('all-slot-choices').onclick=()=>openChoices(choiceId);$('close-slot-picker').onclick=closeDialog;results();
}

function overlayOptions(area){
  const base=['1A','1B','1C','2-LD'];
  if(area==='IC-BASIC')return data.courses.filter(c=>c.ge_areas.includes('IC')&&base.some(a=>c.ge_areas.includes(a)));
  if(area==='IC-SUBJECT')return data.courses.filter(c=>c.ge_areas.includes('IC')&&!base.some(a=>c.ge_areas.includes(a)));
  if(area==='UD-GE')return data.courses.filter(c=>c.level==='upper_division'&&c.ge_areas.some(a=>['3A','3B','4','F','2-UD','5-UD','2/5-UD'].includes(a)));
  return geOptions(data,area);
}

function openPicker(context={}){
  const descriptor=context.choiceId?choiceDescriptors(data,state).find(c=>c.choice_id===context.choiceId):null;
  const area=data.ge_areas.find(a=>a.area_id===context.area),isOverlay=area?.kind==='overlay';
  const title=descriptor?descriptor.label:area?`Choose ${area.area_id}${GE_ALIASES[area.area_id]?' / '+GE_ALIASES[area.area_id]:''} course`:'Find your next course';
  const pool=(descriptor?choiceCourseOptions(data,descriptor):area?(isOverlay?overlayOptions(area.area_id):geOptions(data,area.area_id)):data.courses).filter(c=>!context.upperDivision||c.level==='upper_division');
  openDialog(title,descriptor?'PROGRAM REQUIREMENT':area?area.name:'CSUN COURSE CATALOG',`
    <p>${descriptor?context.singleSlot?'Select one course to replace this box. Your other selections stay in place.':'Choose courses from this requirement’s eligible list.':area?'Select a catalog course eligible for this area. Existing major/minor courses are listed first.':'Search '+data.courses.length.toLocaleString()+' catalog records by code or title.'}</p>
    <div class="pm-picker-search"><input id="course-search" type="search" placeholder="Search code or title, e.g. BIOL 100" aria-label="Search courses" autocomplete="off"><div class="pm-picker-filters"><select id="course-level" aria-label="Course level"><option value="">All levels</option><option value="lower_division">Lower division</option><option value="upper_division">Upper division</option></select>${!descriptor?`<select id="picker-term" aria-label="Add to semester"><option value="">Auto-place course</option>${derived.terms.map(t=>`<option value="${e(t.id)}" ${context.targetTerm===t.id?'selected':''}>${e(termLabel(t))}</option>`).join('')}</select>`:''}</div></div>
    <p id="picker-count" class="pm-picker-count" role="status"></p><div id="course-results" class="pm-picker-results"></div>
    <div class="pm-dialog-footer">${!descriptor&&!area?'<button id="custom-course-button" class="pm-button">Add a custom course</button>':''}<button id="picker-done" class="pm-button pm-button-primary">Done</button></div>`,true);
  let limit=60;
  function results(){
    const query=$('course-search').value.trim().toLowerCase(),tokens=query.replaceAll('-',' ').split(/\s+/).filter(Boolean),level=$('course-level').value;
    const matches=pool.filter(c=>(!level||c.level===level)&&tokens.every(token=>(c.code+' '+(c.title||'')).toLowerCase().includes(token)||c.code.toLowerCase().replaceAll(' ','').includes(token))).sort((a,b)=>Number(derived.items.some(c=>c.id===b.course_id&&c.roles.some(r=>r==='major'||r==='minor')))-Number(derived.items.some(c=>c.id===a.course_id&&c.roles.some(r=>r==='major'||r==='minor'))));
    $('picker-count').textContent=`${matches.length.toLocaleString()} matching courses${matches.length>limit?' · showing '+limit:''}`;
    const chosen=descriptor?state.selections[descriptor.choice_id]||[]:[];
    $('course-results').innerHTML=matches.slice(0,limit).map(c=>{
      const added=descriptor?chosen.includes(c.course_id):derived.items.some(x=>x.id===c.course_id);
      return `<button class="pm-picker-row ${added?'is-added':''}" data-pick="${e(c.course_id)}" aria-label="${descriptor&&added?'Remove':'Add'} ${e(c.code)}"><div><strong>${e(c.code)}${added?' · '+(descriptor?'Selected':'In your plan'):''}</strong><small>${e(c.title||'Confirm current course information')}</small></div><span>${c.units_min??'?'} units</span>${icon(added?'check':'plus')}</button>`;
    }).join('')||'<div class="pm-picker-empty">No courses match that search. Try a different code or title.</div>';
    if(matches.length>limit)$('course-results').insertAdjacentHTML('beforeend','<button class="pm-button pm-full" id="load-more-courses">Show more courses</button>');
    $('load-more-courses')?.addEventListener('click',()=>{limit+=60;results();});
    $('course-results').querySelectorAll('[data-pick]').forEach(button=>button.onclick=()=>{
      const id=button.dataset.pick,next=clone(state);
      if(descriptor){
        const selectedIds=Array.isArray(next.selections[descriptor.choice_id])?next.selections[descriptor.choice_id]:[],remove=!context.singleSlot&&selectedIds.includes(id);
        const result=applyChoiceSelection(data,state,descriptor.choice_id,remove?'':id,{replaceValue:remove?id:context.replaceValue,placeholderId:context.replaceId,targetTerm:context.targetTerm});
        if(!result.ok){dialogError(result.message);return;}
        commit(result.state,'Course selection updated.',{schedule:'preserve'});if(context.singleSlot)closeDialog();else results();return;
      }
      if(area&&!isOverlay&&next.geAssignments[id]&&next.geAssignments[id]!==area.area_id){dialogError('This course is already assigned to another GE area. Choose another course to avoid counting its units twice.');return;}
      next.added=[...new Set([...next.added,id])];next.removed=next.removed.filter(x=>x!==id);
      if(area&&!isOverlay)next.geAssignments[id]=area.area_id;
      const target=$('picker-term').value;
      if(target)next.positions[id]=target;
      const proposed=derivePlan(data,next);
      if(proposed.ledger.excessUnits>derived.ledger.excessUnits&&!derived.items.some(c=>c.id===id)&&!proposed.items.find(c=>c.id===id)?.geAppliedAreas?.some(a=>!state.geCompleted.includes(a))){dialogError('This would add units beyond your remaining degree requirements. Replace an optional course already in the plan first.');return;}
      commit(next,`${derived.ix.courses.get(id)?.code||id} added to your plan.`,{schedule:'preserve'});
      closeDialog();openCourse(id);
    });
  }
  $('course-search').oninput=()=>{limit=60;results();};$('course-level').onchange=results;
  $('picker-done').onclick=()=>descriptor?openChoices(descriptor.choice_id):closeDialog();
  $('custom-course-button')?.addEventListener('click',openCustomCourse);results();
}

function openCustomCourse(){
  openDialog('Add a custom course','MAKE ROOM FOR SOMETHING NEW',`<p>For a new catalog course, transfer equivalent, or advisor-approved substitution. Custom courses stay in your saved plan.</p><form id="custom-course-form"><div class="pm-field-pair"><label class="pm-field">Course code<input id="custom-code" required maxlength="30" placeholder="e.g. CIT 499"></label><label class="pm-field">Units<input id="custom-units" type="number" min="0.5" max="20" step="0.5" value="3" required></label></div><label class="pm-field">Course title<input id="custom-title" required maxlength="180" placeholder="Course name"></label><label class="pm-field">Description<textarea id="custom-description" maxlength="2000" rows="3"></textarea></label><label class="pm-field">Official CSUN page <span class="pm-optional">optional</span><input id="custom-url" type="url" placeholder="https://catalog.csun.edu/…"></label><label class="pm-field">Semester<select id="custom-term"><option value="">Auto-place</option>${derived.terms.map(t=>`<option value="${e(t.id)}">${e(termLabel(t))}</option>`).join('')}</select></label><p class="pm-dialog-note">Create a course link afterward to model its sequence or corequisites. A custom course does not automatically replace a required course.</p><div class="pm-dialog-footer"><button class="pm-button pm-button-primary">Add custom course</button></div></form>`);
  $('custom-course-form').onsubmit=event=>{
    event.preventDefault();const code=$('custom-code').value.trim().toUpperCase(),title=$('custom-title').value.trim(),u=Number($('custom-units').value),rawUrl=$('custom-url').value.trim();
    if(!code||!title)return;if(rawUrl&&!safeOfficialUrl(rawUrl)){dialogError('Use an HTTPS page on csun.edu or one of its subdomains.');return;}
    const id='CUSTOM-'+Date.now()+'-'+Math.random().toString(36).slice(2,7),course={course_id:id,code,title,units_min:u,units_max:u,description:$('custom-description').value,
      source_url:safeOfficialUrl(rawUrl),components:[{component_id:id,code,units_min:u,units_max:u}],prerequisites:{type:'NOT_STATED'},corequisites:{type:'NOT_STATED'},ge_areas:[],level:'lower_division',custom:true,needs_review:true};
    const next=clone(state);next.customCourses.push(course);next.added.push(id);if($('custom-term').value)next.positions[id]=$('custom-term').value;
    commit(next,'Custom course added.',{schedule:'preserve'});openCourse(id);
  };
}

function openChoices(focusId=''){
  const descriptors=choiceDescriptors(data,state),pending=new Map(derived.checklist.choices.map(c=>[c.choice_id,c]));
  openDialog('Make the choices yours','PROGRAM REQUIREMENTS',`
    <p>Choose the course or pathway you want. Alternatives stay unselected until you choose them. Dashed cards reserve the minimum estimated units; a higher-unit option can change your semester loads.</p>
    ${descriptors.map((c,index)=>{
      const selectedValue=state.selections[c.choice_id],selectedIds=Array.isArray(selectedValue)?selectedValue:[],remaining=pending.get(c.choice_id);
      return `<section class="pm-choice-group" id="choice-group-${index}"><h3>${e(c.label||'Course choice')} <span class="pm-pill">${c.role}</span></h3>
      ${remaining?'<p>More selections or approval needed.</p>':'<p>Selections entered. Check program rules before registration.</p>'}
      ${state.legacySelections?.[c.choice_id]?'<p class="pm-choice-constraint">An older save contains a selection here. Choose it again to confirm it; earlier versions could fill choices automatically.</p>':''}
      ${c.type==='CHOOSE_PATH'?`<select data-choice-path="${e(c.choice_id)}" aria-label="${e(c.label)}"><option value="" ${!selectedValue?'selected':''}>Select a course or pathway…</option>${c.options.map(o=>`<option value="${e(o.id)}" ${selectedValue===o.id?'selected':''}>${e(optionLabel(o))}</option>`).join('')}</select><div class="pm-option-preview">${c.options.map(o=>`<p><strong>${e(o.label)}</strong>${ruleIds(o.rule).length<=6?' — '+ruleIds(o.rule).map(id=>e(derived.ix.courses.get(id)?.title||id)).join('; '):''}</p>`).join('')}</div>`:
        c.type==='CHOOSE_OPTIONS'?`${c.minimum_count||c.minimum_units?`<p>${c.minimum_count?'Choose at least '+c.minimum_count+' options. ':''}${c.minimum_units?'Minimum '+c.minimum_units+' units.':''}</p>`:''}${c.options.map(o=>`<label class="pm-choice-option"><input type="checkbox" data-choice-option="${e(c.choice_id)}" value="${e(o.id)}" ${selectedIds.includes(o.id)?'checked':''}><span>${e(o.label)}</span></label>`).join('')}`:
        `<p>${e(c.minimum_units||c.elective_route?.minimum_units||'Required')} units${c.approval_needed?' · advisor approval required':''}</p><div class="pm-related-list">${selectedIds.map(id=>`<button class="pm-related-chip" data-unchoose="${e(id)}" data-choice-id="${e(c.choice_id)}">${e(derived.ix.courses.get(id)?.code||id)} ×</button>`).join('')}</div><button class="pm-button pm-button-small" data-choice-picker="${e(c.choice_id)}">${icon('plus')} Choose courses</button>`}
      ${c.approval_needed?`<label class="pm-detail-check"><input type="checkbox" data-approve="${e(c.choice_id)}" ${state.approvedChoices.includes(c.choice_id)?'checked':''}>I have an advisor-approved selection for this block.</label>`:''}
      ${(c.constraints||[]).length?`<p class="pm-choice-constraint">${c.constraints.map(x=>e(typeof x==='string'?x:JSON.stringify(x))).join('<br>')}</p>`:''}
      ${c.maximum_lower_division_units!=null?`<p>Maximum ${e(c.maximum_lower_division_units)} lower-division units in this block.</p>`:''}
      ${c.subset_minima?.length?`<p>${c.subset_minima.map(s=>e(s.label||'Required category')+': '+(s.minimum_count?e(s.minimum_count)+' options':e(s.minimum_units)+' units')).join(' · ')}</p>`:''}
      ${remaining?.missing_subsets?.length?'<p>Still needed: '+remaining.missing_subsets.map(s=>e(s.label||'Required category')+(s.minimum_count?' · '+e(s.minimum_count)+' options':'')).join('; ')+'</p>':''}
      ${c.source_url?`<a class="pm-source-link" href="${e(safeOfficialUrl(c.source_url))}" target="_blank" rel="noopener noreferrer">Check this requirement in the official catalog ↗</a>`:''}
      </section>`;
    }).join('')||'<p>No elective or track selections are needed for this program.</p>'}
    ${derived.prerequisiteChoices.length?'<h3>Prerequisite alternatives to confirm</h3><p>These routes come from course prerequisites. Choosing a route adds any missing preparation courses. Placement and permission routes still require confirmation.</p>'+derived.prerequisiteChoices.map(c=>`<section class="pm-choice-group"><h4>${e(derived.ix.courses.get(c.course_id)?.code||c.course_id)}</h4><select data-prerequisite-choice="${e(c.choice_id)}" aria-label="Prerequisite route for ${e(c.course_id)}"><option value="">Choose a prerequisite route…</option>${c.options.map(o=>`<option value="${e(o.id)}" ${state.prerequisiteSelections[c.choice_id]===o.id?'selected':''}>${e(o.label)}</option>`).join('')}</select><a class="pm-source-link" href="${e(safeOfficialUrl(c.source_url))}" target="_blank" rel="noopener noreferrer">Official course prerequisite ↗</a></section>`).join(''):''}
    ${derived.checklist.errors.length?`<p class="pm-dialog-note">${derived.checklist.errors.map(e).join('<br>')}</p>`:''}
    <div class="pm-dialog-footer"><button id="choices-done" class="pm-button pm-button-primary">Back to my roadmap</button></div>`,true);
  const refresh=(next,id)=>{if(id)delete next.legacySelections[id];const top=dialog.scrollTop;commit(next,'Program choices updated.',{schedule:'preserve'});openChoices();dialog.scrollTop=top;};
  body.querySelectorAll('[data-choice-path]').forEach(select=>select.onchange=()=>{const result=applyChoiceSelection(data,state,select.dataset.choicePath,select.value);if(!result.ok){dialogError(result.message);return;}refresh(result.state,select.dataset.choicePath);});
  body.querySelectorAll('[data-prerequisite-choice]').forEach(select=>select.onchange=()=>{const next=clone(state);next.prerequisiteSelections[select.dataset.prerequisiteChoice]=select.value;refresh(next);});
  body.querySelectorAll('[data-choice-option]').forEach(box=>box.onchange=()=>{const id=box.dataset.choiceOption,result=applyChoiceSelection(data,state,id,box.checked?box.value:'',{replaceValue:box.checked?'':box.value});if(!result.ok){box.checked=!box.checked;dialogError(result.message);return;}refresh(result.state,id);});
  body.querySelectorAll('[data-choice-picker]').forEach(button=>button.onclick=()=>openPicker({choiceId:button.dataset.choicePicker}));
  body.querySelectorAll('[data-unchoose]').forEach(button=>button.onclick=()=>{const next=clone(state);next.selections[button.dataset.choiceId]=next.selections[button.dataset.choiceId].filter(id=>id!==button.dataset.unchoose);refresh(next);});
  body.querySelectorAll('[data-approve]').forEach(box=>box.onchange=()=>{const next=clone(state);next.approvedChoices=box.checked?[...next.approvedChoices,box.dataset.approve]:next.approvedChoices.filter(id=>id!==box.dataset.approve);refresh(next);});
  $('choices-done').onclick=closeDialog;
  if(focusId){const index=descriptors.findIndex(c=>c.choice_id===focusId);requestAnimationFrame(()=>$('choice-group-'+index)?.scrollIntoView({block:'center'}));}
}

function openLinks(){
  openDialog('Courses that move together','YOUR COURSE LINKS',`<p>Prerequisite lines are detected automatically. Create your own named links to move a whole sequence with its spacing, or keep corequisites in one semester.</p>
    ${state.links.map(link=>`<article class="pm-link-group"><button class="pm-icon-button" data-unlink="${e(link.id)}" aria-label="Remove ${e(link.label)}">${icon('close')}</button><h3>${e(link.label)}</h3><p>${link.members.map(id=>e(derived.items.find(c=>c.id===id)?.code||id)).join(link.kind==='corequisite'?' + ':' → ')}</p><small>${link.kind==='corequisite'?'Same semester':'Sequence · offsets preserved when moved'}</small></article>`).join('')||'<div class="pm-rule-box">No custom links yet. Select two or more course cards using their small selection buttons, then choose Create course link.</div>'}
    <p class="pm-source-note">${derived.edges.filter(e=>!e.linkId).length} prerequisite / corequisite relationships detected in this plan. Moving a prerequisite later also moves dependent courses when needed.</p>
    <div class="pm-dialog-footer"><button id="link-selected" class="pm-button pm-button-primary">Link ${selected.size||'selected'} courses</button><button id="links-done" class="pm-button">Done</button></div>`);
  body.querySelectorAll('[data-unlink]').forEach(button=>button.onclick=()=>{const next=clone(state);next.links=next.links.filter(g=>g.id!==button.dataset.unlink);commit(next,'Course link removed.');openLinks();});
  $('links-done').onclick=closeDialog;$('link-selected').onclick=openCreateLink;
}
function openCreateLink(){
  if(selected.size<2){toast('Select at least two real course cards using their selection buttons.',true);return;}
  const ids=[...selected].sort((a,b)=>derived.terms.findIndex(t=>t.id===state.positions[a])-derived.terms.findIndex(t=>t.id===state.positions[b]));
  openDialog('Create a course link','KEEP THE BIG PICTURE CONNECTED',`<p>${ids.map(id=>e(derived.items.find(c=>c.id===id)?.code||id)).join(' → ')}</p><form id="link-form"><label class="pm-field">Link name<input id="link-name" required maxlength="80" value="My course sequence"></label><label class="pm-field">How should these courses relate?<select id="link-kind"><option value="sequence">Sequence · one after another</option><option value="corequisite">Corequisites · same semester</option></select></label><p class="pm-dialog-note">Sequences follow the displayed semester order. A move preserves their term offsets. Existing prerequisite rules still apply.</p><div class="pm-dialog-footer"><button class="pm-button pm-button-primary">Create link</button></div></form>`);
  $('link-form').onsubmit=event=>{event.preventDefault();const result=createLink(data,state,ids,$('link-kind').value,$('link-name').value);if(!result.ok){dialogError(result.message);return;}selected.clear();commit(result.state,'Course link created. Move any member to move the group.');closeDialog();};
}

function openCheck(){
  const removedRequired=derived.checklist.required_courses.filter(c=>state.removed.includes(c.course_id));
  const reviewById=[...new Map(derived.review.map(r=>[r.id,r])).values()];
  const cards=issues.map(i=>`<div class="pm-issue ${i.severity==='error'?'is-error':''}"><span>${i.severity==='error'?'!':'·'}</span><div><p>${e(i.message)}</p>${i.id?`<button data-check-course="${e(i.id)}">View card</button>`:''}</div></div>`).join('');
  openDialog('A clearer picture of your plan','PLAN CHECK',`
    <p>${issues.filter(i=>i.severity==='error').length} sequencing conflicts · ${issues.filter(i=>i.kind==='unscheduled').length} unscheduled cards · ${derived.checklist.choices.length} open program choices.</p>
    ${cards||'<div class="pm-rule-box">Your scheduled cards have no detected sequencing or load conflicts.</div>'}
    ${removedRequired.length?'<h3>Required courses you removed</h3>'+removedRequired.map(c=>`<div class="pm-issue is-error"><span>!</span><div><p>${e(c.code)} remains in your program’s requirements.</p><button data-restore="${e(c.course_id)}">Restore course</button></div></div>`).join(''):''}
    ${derived.checklist.choices.length?'<h3>Choices still to make</h3><p>Unresolved elective, track and approval blocks remain as dashed cards.</p><button id="review-choices" class="pm-button pm-button-small">Review program choices</button>':''}
    ${derived.checklist.requirement_checks.some(c=>c.minimum_met===false)?'<h3>Program credit minimums still open</h3>'+derived.checklist.requirement_checks.filter(c=>c.minimum_met===false).map(c=>`<p><strong>${e(c.label)}</strong> · ${e(c.selected_units??'?')} of ${e(c.minimum_units)} required units selected. Review this block’s course choices and official program conditions.</p>`).join(''):''}
    ${reviewById.length?'<h3>Prerequisites that need confirmation</h3>'+reviewById.map(r=>`<div class="pm-issue"><span>i</span><div><p><strong>${e(derived.items.find(c=>c.id===r.id)?.code||r.id)}</strong> · ${e(r.message)}</p><button data-check-course="${e(r.id)}">View official source</button></div></div>`).join(''):''}
    ${derived.checklist.ambiguous_ge_assignments.length?'<h3>GE area allocations</h3><p>These courses can count in more than one base area. Use a GE placeholder to assign each course to one area; its units must not be counted twice.</p>'+derived.checklist.ambiguous_ge_assignments.map(c=>`<p>${e(derived.ix.courses.get(c.course_id)?.code)} · ${c.choose_one_area.map(e).join(' / ')}</p>`).join(''):''}
    ${derived.checklist.notices.length?'<h3>Program notes</h3>'+derived.checklist.notices.slice(0,12).map(n=>`<p>${e(n.message)}</p>`).join(''):''}
    ${derived.checklist.review_conditions.length?`<h3>Other program conditions</h3><p>${derived.checklist.review_conditions.length} catalog conditions cover approval, grades, residency, overlap or other program policies. The roadmap does not certify these conditions.</p>`:''}
    ${state.geCompleted.length&&Number(state.settings.transferUnits)===0?'<p class="pm-dialog-note">You marked prior GE areas complete. Enter any transfer / other earned units in the plan settings so the remaining degree-unit estimate accounts for them.</p>':''}
    <p class="pm-dialog-note">Term offerings are unverified. Summer and winter cards are proposed placements. Check the official schedule and any advisor-approved substitutions before registration.</p>
    <a class="pm-source-link" href="${e(safeOfficialUrl(derived.ix.programs.get(state.settings.major)?.source_url))}" target="_blank" rel="noopener noreferrer">Open official major requirements ↗</a>` ,true);
  body.querySelectorAll('[data-check-course]').forEach(b=>b.onclick=()=>openCourse(b.dataset.checkCourse));
  body.querySelectorAll('[data-restore]').forEach(b=>b.onclick=()=>{const next=clone(state);next.removed=next.removed.filter(id=>id!==b.dataset.restore);commit(next,'Required course restored.',{schedule:'preserve'});openCheck();});
  $('review-choices')?.addEventListener('click',()=>openChoices());
}

function openAddTerm(){
  const last=derived.terms.at(-1);
  openDialog('A little more room','ADD A TERM',`<p>Add a summer, winter or extension semester. Existing cards stay where you put them.</p><form id="term-form"><div class="pm-field-pair"><label class="pm-field">Season<select id="new-term-season"><option>Summer</option><option>Winter</option><option>Fall</option><option>Spring</option></select></label><label class="pm-field">Year<input id="new-term-year" type="number" min="${state.settings.startYear}" max="2100" value="${last.year}" required></label></div><div class="pm-dialog-footer"><button class="pm-button pm-button-primary">Add term</button></div></form>`);
  $('term-form').onsubmit=event=>{event.preventDefault();const season=$('new-term-season').value,year=Number($('new-term-year').value),id=termKey(season,year);if(derived.terms.some(t=>t.id===id)){dialogError('That semester is already in your roadmap.');return;}const start=derived.terms[0];if(termOrder({season,year})<termOrder(start)){dialogError('Choose a term on or after the start of your plan.');return;}const next=clone(state);next.extraTerms.push({id,season,year});commit(next,`${season} ${year} added.`,{schedule:'preserve'});closeDialog();};
}

function download(filename,content,mime){const url=URL.createObjectURL(new Blob([content],{type:mime})),a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function exportJson(){download('csun-program-plan.json',exportPlan(state,data),'application/json');toast('Plan exported. Import this file on another browser to keep planning.');}
function exportCsv(){
  const quote=value=>{let s=String(value??'');if(/^[=+@\-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
  const rows=[['Course','Title','Semester','Total units','Remaining units','Completed units','Completed','Role','Notes'],...derived.items.map(c=>[c.code,c.title,termLabel(derived.terms.find(t=>t.id===state.positions[c.id])),c.units_min,plannedCourseUnits(c),c.completed_units??(c.completed?courseUnits(c):0),c.completed?'Yes':'No',roleLabel(c),state.notes[c.id]||''])];
  download('csun-program-plan.csv','\uFEFF'+rows.map(row=>row.map(quote).join(',')).join('\r\n'),'text/csv;charset=utf-8');
}
function openTools(){
  openDialog('Your plan, your way','PLAN TOOLS',`<div class="pm-tool-grid"><button id="tool-json" class="pm-button">${icon('download')} Export editable plan</button><button id="tool-csv" class="pm-button">${icon('download')} Download spreadsheet CSV</button><button id="tool-import" class="pm-button">${icon('upload')} Import a saved plan</button><button id="tool-print" class="pm-button">${icon('print')} Print / save as PDF</button></div><h3>Arrange your roadmap</h3><p>Auto-arrange respects locked courses. Your previous layout stays available through Undo.</p><button id="tool-rebalance" class="pm-button">${icon('spark')} Auto-arrange my plan</button><label class="pm-settings-row">Show completed cards<input type="checkbox" id="tool-completed" ${state.showCompleted?'checked':''}></label><h3>A fresh start</h3><p>Start over with the default program. Export a backup first if you want to keep this plan.</p><button id="tool-reset" class="pm-button pm-button-danger">New plan</button>`);
  $('tool-json').onclick=exportJson;$('tool-csv').onclick=exportCsv;$('tool-import').onclick=()=>$('import-file').click();$('tool-print').onclick=()=>{closeDialog();window.print();};
  $('tool-rebalance').onclick=()=>{commit(autoSchedule(data,state),'Plan arranged. Locked courses stayed in place.');closeDialog();};
  $('tool-completed').onchange=event=>{const next=clone(state);next.showCompleted=event.target.checked;commit(next);};
  $('tool-reset').onclick=()=>{openDialog('Start a new plan?','FRESH START','<p>Your current plan will be replaced. Export a copy first to keep it. Undo can also recover the previous plan during this session.</p><div class="pm-dialog-footer"><button id="cancel-reset" class="pm-button">Keep current plan</button><button id="confirm-reset" class="pm-button pm-button-danger">Start new plan</button></div>');$('cancel-reset').onclick=openTools;$('confirm-reset').onclick=()=>{const next=autoSchedule(data,withSuggestedPaths(data,initialState(2026)));selected.clear();commit(next,'New plan ready.',{sync:true});closeDialog();};};
}
function openHelp(){openDialog('A roadmap you can make your own','A QUICK TOUR',`<ol class="pm-how-list"><li><strong>Start with your program.</strong> Choose your major, optional minor, start year and timeline. Review suggested paths in Program choices.</li><li><strong>Move the pieces.</strong> Drag a card between semesters. On a phone or keyboard, open it and use Move course. Moving a prerequisite later brings dependents forward when possible; impossible moves are rejected.</li><li><strong>Keep courses connected.</strong> Select cards with their small selection buttons, then Create course link. Sequences keep their term offsets; corequisites stay together. Lock a course to protect its semester.</li><li><strong>Bring your progress.</strong> Double-click a course or use its check button to mark it complete. Check prior GE areas in the sidebar. Enter transfer units separately.</li><li><strong>Fill the dashed cards.</strong> Click a GE card to choose an eligible course, or a program-choice card to pick electives. Degree elective cards fill the remaining unit estimate.</li><li><strong>Make room and keep a backup.</strong> Add summer, winter or extension terms. Undo, export/import and print are in the toolbar. Your plan also saves automatically in this browser.</li></ol><p class="pm-dialog-note">Catalog data is a planning snapshot. A clean sequence does not certify graduation eligibility, term availability, placement, grades, residency or advisor approval.</p>`);}

function setGE(ids,checked){
  const next=clone(state);next.geCompleted=checked?[...new Set([...next.geCompleted,...ids])]:next.geCompleted.filter(id=>!ids.includes(id));
  if(checked){next.added=next.added.filter(id=>!ids.includes(next.geAssignments[id])||next.completed.includes(id));for(const [id,area] of Object.entries(next.geAssignments))if(ids.includes(area)&&!next.completed.includes(id))delete next.geAssignments[id];}
  commit(next,checked?'Prior GE progress updated.':'Required GE space added to your roadmap.',{schedule:'preserve'});
}

function wireEvents(){
  $('setup-form').onsubmit=event=>{
    event.preventDefault();if(!$('setup-form').reportValidity())return;
    const next=clone(state),major=$('major-select').value;
    if(major!==state.settings.major){next.selections={};next.prerequisiteSelections={};next.legacySelections={};next.approvedChoices=[];next.removed=[];next.links=[];next.locked=[];}
    next.settings={major,minor:$('minor-select').value,years:Number($('plan-years').value),startYear:Number($('start-year').value),startSeason:$('start-season').value,summer:$('include-summer').checked,winter:$('include-winter').checked,regularLimit:Number($('regular-limit').value),summerLimit:Number($('summer-limit').value),winterLimit:Number($('winter-limit').value),transferUnits:Number($('transfer-units').value)};
    next.settings.loadMode=$('load-mode').value;next.settings.priorUnitsMode=$('prior-credit-mode').value;
    if(next.settings.priorUnitsMode==='estimate')next.settings.transferUnits=0;
    if($('roadmap-select').value)next.settings.roadmap=$('roadmap-select').value;
    if(next.settings.startYear!==state.settings.startYear||next.settings.startSeason!==state.settings.startSeason){next.positions={};next.locked=[];next.extraTerms=[];}
    const proposed=autoSchedule(data,withSuggestedPaths(data,next));commit(proposed,'Your roadmap is ready. Review program choices and plan checks.',{sync:true});
  };
  $('major-search').oninput=event=>populatePrograms(event.target.value);
  $('major-select').onchange=()=>syncRoadmaps($('major-select').value);
  $('load-mode').onchange=()=>{$('regular-limit').disabled=$('load-mode').value!=='custom';};
  $('prior-credit-mode').onchange=()=>{$('transfer-units').disabled=$('prior-credit-mode').value!=='transcript';};
  $('review-imported-choices').onclick=()=>openChoices();
  $('plan-name').onchange=event=>{const next=clone(state);next.name=event.target.value.trim()||'My graduation plan';commit(next);};
  $('ge-all').onchange=event=>setGE(data.ge_areas.map(a=>a.area_id),event.target.checked);
  $('ge-checklist').onchange=event=>{if(event.target.dataset.ge)setGE([event.target.dataset.ge],event.target.checked);};
  $('ge-overlays').onchange=event=>{if(event.target.dataset.ge)setGE([event.target.dataset.ge],event.target.checked);};
  $('ge-overlays').onclick=event=>{const b=event.target.closest('[data-overlay-picker]');if(b)openPicker({area:b.dataset.overlayPicker});};
  $('show-links').onchange=event=>{const next=clone(state);next.showLinks=event.target.checked;commit(next);};
  $('move-linked').onchange=event=>{const next=clone(state);next.moveLinked=event.target.checked;commit(next);};
  $('undo-button').onclick=undo;$('redo-button').onclick=redo;$('choices-button').onclick=()=>openChoices();$('links-button').onclick=openLinks;$('check-button').onclick=openCheck;
  $('add-course-button').onclick=()=>openPicker();$('export-button').onclick=exportJson;$('more-button').onclick=openTools;$('help-button').onclick=openHelp;$('add-term-button').onclick=openAddTerm;
  $('create-link-button').onclick=openCreateLink;$('clear-selection-button').onclick=()=>{selected.clear();focused='';updateSelection();highlight();};
  $('close-dialog').onclick=closeDialog;dialog.addEventListener('click',event=>{if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)closeDialog();}});
  dialog.addEventListener('close',()=>{focused='';highlight();});
  document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'&&!['INPUT','TEXTAREA','SELECT'].includes(event.target.tagName)){event.preventDefault();event.shiftKey?redo():undo();}if(event.key==='Escape'&&!dialog.open){selected.clear();focused='';updateSelection();highlight();}});
  $('import-file').onchange=async event=>{const file=event.target.files[0];if(!file)return;try{if(file.size>2_000_000)throw new Error('Choose a JSON plan smaller than 2 MB.');const next=importPlan(await file.text(),data);commit(next,'Saved plan imported.',{sync:true});closeDialog();}catch(error){toast('Import failed: '+error.message,true);}event.target.value='';};
  document.addEventListener('click',event=>{
    const complete=event.target.closest('[data-complete]');if(complete){event.stopPropagation();clearTimeout(clickTimer);toggleCompleted(complete.dataset.complete);return;}
    const select=event.target.closest('[data-select]');if(select){event.stopPropagation();clearTimeout(clickTimer);selectCourse(select.dataset.select);return;}
    const el=event.target.closest('.pm-course');if(!el)return;
    if(event.shiftKey){selectCourse(el.dataset.courseId);return;}
    clearTimeout(clickTimer);clickTimer=setTimeout(()=>openCourse(el.dataset.courseId),250);
  });
  document.addEventListener('dblclick',event=>{const card=event.target.closest('.pm-course');if(card&&!event.target.closest('button')){clearTimeout(clickTimer);toggleCompleted(card.dataset.courseId);}});
  document.addEventListener('keydown',event=>{const card=event.target.closest('.pm-course');if(!card||event.target.closest('button'))return;if(event.key==='Enter'){event.preventDefault();openCourse(card.dataset.courseId);}if(event.key===' '){event.preventDefault();selectCourse(card.dataset.courseId);}});
  document.addEventListener('dragstart',event=>{const card=event.target.closest('.pm-course');if(!card)return;clearTimeout(clickTimer);dragId=card.dataset.courseId;if(card.draggable!==true){event.preventDefault();return;}event.dataTransfer.setData('text/plain',dragId);event.dataTransfer.effectAllowed='move';card.classList.add('is-dragging');});
  document.addEventListener('dragover',event=>{const term=event.target.closest('[data-term-id]');if(term&&dragId){event.preventDefault();event.dataTransfer.dropEffect='move';document.querySelectorAll('.is-drop-target').forEach(t=>t.classList.remove('is-drop-target'));term.classList.add('is-drop-target');if(event.clientY<100)window.scrollBy(0,-12);else if(event.clientY>window.innerHeight-100)window.scrollBy(0,12);}});
  document.addEventListener('drop',event=>{const term=event.target.closest('[data-term-id]');if(!term||!dragId)return;event.preventDefault();const id=dragId;dragId='';document.querySelectorAll('.is-drop-target').forEach(t=>t.classList.remove('is-drop-target'));requestMove(id,term.dataset.termId);});
  document.addEventListener('dragend',()=>{dragId='';document.querySelectorAll('.is-dragging,.is-drop-target').forEach(el=>el.classList.remove('is-dragging','is-drop-target'));});
  new ResizeObserver(()=>requestAnimationFrame(drawLinks)).observe($('roadmap'));
  window.addEventListener('beforeunload',()=>{try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state));}catch{}});
}

async function boot(){
  hydrateIcons();
  try{
    const configUrl=new URL('../../data/program-mapper/config.json?v=2026.11.19.3',import.meta.url),configResponse=await fetch(configUrl,{credentials:'omit'});
    if(!configResponse.ok)throw new Error('Could not load the mapper configuration.');
    const config=await configResponse.json(),catalogUrl=new URL(config.catalogUrl,configUrl);
    if(!['http:','https:'].includes(catalogUrl.protocol))throw new Error('The catalog endpoint must use HTTP or HTTPS.');
    const response=await fetch(catalogUrl,{credentials:'omit'});if(!response.ok)throw new Error('The catalog could not be loaded. Try refreshing in a moment.');
    data=await response.json();if(!data.metadata||!['courses','programs','requirements','ge_areas'].every(key=>Array.isArray(data[key])))throw new Error('The catalog response has an unsupported format.');
    let restored=false;
    try{const saved=localStorage.getItem(STORAGE_KEY)||localStorage.getItem('csun-reimagined:program-mapper:v2')||localStorage.getItem('csun-reimagined:program-mapper:v1');if(saved){state=importPlan(saved,data);state=autoSchedule(data,state,{preserve:true});restored=true;}}catch{toast('Your previous save could not be restored. Import an exported backup if you have one.',true);}
    if(!state)state=autoSchedule(data,withSuggestedPaths(data,initialState(2026)));
    syncSetup();wireEvents();render();
    for(const id of ['major-select','minor-select','build-plan-button','add-course-button','export-button'])$(id).disabled=false;
    $('mapper-app').setAttribute('aria-busy','false');scheduleSave();
    if(restored)$('save-status').textContent='Your saved plan restored';
  }catch(error){$('mapper-app').setAttribute('aria-busy','false');$('load-error').hidden=false;$('load-error').textContent=error.message+' Serve this project through Amplify or a local web server, with the mapper data and modules included.';$('workspace').hidden=true;$('save-status').textContent='Catalog unavailable';}
}
boot();
