import {buildPlan, createIndex, isBusinessMajor, geCourseOptions, domainChoice} from './program-mapper-catalog.mjs';

export const SCHEMA_VERSION = 2;
export const SEASONS = ['Winter', 'Spring', 'Summer', 'Fall'];
export const GE_ALIASES = {'1A':'A2', '1B':'A3', '1C':'A1', '2-LD':'B4', '3A':'C1', '3B':'C2', '5A':'B1', '5B':'B2', '5C':'B3'};
export const clone = value => JSON.parse(JSON.stringify(value));
const unique = values => [...new Set(values)];
const finite = (n, fallback=0) => Number.isFinite(Number(n)) ? Number(n) : fallback;
export const termKey = (season, year) => `${year}-${season.toLowerCase()}`;
export const termOrder = term => term.year*4 + SEASONS.indexOf(term.season);
export const termLabel = term => term ? `${term.season} ${term.year}` : 'Unscheduled';
export const courseUnits = item => finite(item.units_min, 0);
export const shortCode = id => String(id).replaceAll('-', ' ');

export function initialState(year=2026) {
  return {schemaVersion:SCHEMA_VERSION, name:'My graduation plan',
    settings:{major:'cit-bs', minor:'', years:4, startYear:year, startSeason:'Fall',
      summer:false, winter:false, regularLimit:18, summerLimit:6, winterLimit:3, transferUnits:0},
    selections:{}, prerequisiteSelections:{}, legacySelections:{}, approvedChoices:[], completed:[], geCompleted:[], geAssignments:{},
    added:[], customCourses:[], removed:[], positions:{}, locked:[], links:[], extraTerms:[],
    showLinks:true, moveLinked:true, showCompleted:true, notes:{}, availability:{},unitOverrides:{}};
}

export function makeTerms(state) {
  const s=state.settings, start=Number(s.startYear)*4+SEASONS.indexOf(s.startSeason);
  const end=start+Number(s.years)*4, result=[];
  for(let q=start; q<end; q++) {
    const season=SEASONS[q%4], year=Math.floor(q/4);
    if(['Fall','Spring'].includes(season) || season==='Summer'&&s.summer || season==='Winter'&&s.winter) {
      result.push({id:termKey(season,year), season, year,
        limit:season==='Summer'?s.summerLimit:season==='Winter'?s.winterLimit:s.regularLimit});
    }
  }
  for(const extra of state.extraTerms) if(!result.some(t=>t.id===extra.id)) {
    result.push({...extra,limit:extra.season==='Summer'?s.summerLimit:extra.season==='Winter'?s.winterLimit:s.regularLimit});
  }
  return result.sort((a,b)=>termOrder(a)-termOrder(b));
}

export function catalogIndex(data, state) {
  const needsExtension=state.customCourses.length||Object.keys(state.unitOverrides||{}).length;
  const extended=needsExtension ? {...data,courses:[...data.courses,...state.customCourses].map(c=>{
    const units=state.unitOverrides?.[c.course_id];
    return units==null?c:{...c,original_units_min:c.units_min,original_units_max:c.units_max,units_min:units,
      components:c.components.length===1?c.components.map(p=>({...p,units_min:units})):c.components};
  })}:data;
  const ix=createIndex(extended);
  return {...ix, data:extended, canonical:id=>ix.aliases.get(String(id).replaceAll(' ','-'))?.course.course_id || id};
}

function nodeIds(node) {
  if(!node)return [];
  return unique([...(node.course_id?[node.course_id]:[]),...(node.children||[]).flatMap(nodeIds),
    ...(node.options||[]).flatMap(o=>nodeIds(o.rule))]);
}

/** All active curriculum choices, including resolved ones, remain editable. */
export function choiceDescriptors(data,state) {
  const result=[];
  function walk(n,role,context='',source='') {
    if(!n)return;
    let node=n;
    if(n.type==='DOMAIN_EMPHASIS') {
      if(state.settings.minor&&!n.minor_route.excluded_minors.includes(state.settings.minor))return;
      node=domainChoice(data,n);
    }
    if(n.type==='ANY_OF') node={...n,type:'CHOOSE_PATH',label:n.label||'Choose a course or sequence',
      choice_id:n.choice_id||[state.settings.major,'alternative',...nodeIds(n)].join(':'),
      options:n.children.map((rule,i)=>({id:`option-${i+1}`,label:nodeIds(rule).map(shortCode).join(' + '),rule}))};
    if(['CHOOSE_PATH','CHOOSE_OPTIONS','CHOOSE_COURSES','APPROVED_ELECTIVES','DOMAIN_EMPHASIS'].includes(node.type)) {
      if(node.type==='DOMAIN_EMPHASIS' && state.settings.minor && !node.minor_route.excluded_minors.includes(state.settings.minor))return;
      const generic=/^(?:select|choose|one of|two of|three of)/i.test(node.label||'');
      result.push({...node,role,label:generic&&context&&!context.includes(node.label)?context+' — '+node.label:node.label,source_url:node.source_url||source});
      const selected=state.selections[node.choice_id];
      const values=Array.isArray(selected)?selected:[selected];
      for(const option of node.options||[]) if(values.includes(option.id))walk(option.rule,role,option.label,node.source_url||source);
      return;
    }
    const nextContext=node.type==='REQUIREMENT_GROUP'&&!/^(?:select|choose|take|one of|two of|three of|program requirements)/i.test(node.label||'')?node.label:context;
    (node.children||[]).forEach(child=>walk(child,role,nextContext,node.source_url||source));
  }
  for(const id of [state.settings.major,state.settings.minor].filter(Boolean)) {
    for(const req of data.requirements.filter(r=>r.program_id===id))walk(req.rule,id===state.settings.major?'major':'minor','',data.programs.find(p=>p.program_id===id)?.source_url);
  }
  return result.filter((x,i,a)=>a.findIndex(y=>y.choice_id===x.choice_id)===i);
}

export function withSuggestedPaths(data,state) {
  // Kept as an API boundary for older callers. A sample roadmap never chooses a curriculum path.
  return clone(state);
}

export function prerequisiteChoiceId(self,node,kind='prerequisite') {
  let hash=2166136261;
  for(const char of JSON.stringify(node))hash=Math.imul(hash^char.charCodeAt(0),16777619);
  return `${self}:${kind}:${(hash>>>0).toString(36)}`;
}

export function choiceCourseOptions(data, descriptor) {
  const ids=descriptor.course_ids||descriptor.candidate_course_ids;
  if(ids?.length)return data.courses.filter(c=>ids.includes(c.course_id));
  if(descriptor.type==='DOMAIN_EMPHASIS') {
    const r=descriptor.elective_route;
    return data.courses.filter(c=>r.subjects.includes(c.code.split(' ')[0]) &&
      Number(c.code.match(/\d+/)?.[0])>=r.number_range[0] && Number(c.code.match(/\d+/)?.[0])<=r.number_range[1] && !r.excluded_codes.includes(c.code));
  }
  return data.courses.filter(c=>(!descriptor.subjects?.length||descriptor.subjects.includes(c.code.split(' ')[0])) &&
    (!descriptor.levels?.length||descriptor.levels.includes(Math.floor(Number(c.code.match(/\d+/)?.[0])/100))||descriptor.levels.includes(c.level)));
}

function rulePlan(node,ctx,kind='prerequisite') {
  if(!node)return {deps:[],review:[]};
  const {ix, present, completed, self, business}=ctx;
  switch(node.type) {
    case 'COURSE': {
      const id=ix.canonical(node.course_id);
      if(id===self || completed.has(id))return {deps:[],review:[]};
      return {deps:[{from:id,to:self,kind,gap:kind==='prerequisite'?1:0,minimumGrade:node.minimum_grade}],review:[]};
    }
    case 'ANY_OF': {
      const branches=(node.children||[]).map(n=>rulePlan(n,ctx,kind));
      const choiceId=prerequisiteChoiceId(self,node,kind), explicit=ctx.prerequisiteSelections?.[choiceId];
      const options=(node.children||[]).map((rule,i)=>({id:`option-${i+1}`,label:nodeIds(rule).map(shortCode).join(' + ')||'Placement / permission route',rule}));
      const descriptor={choice_id:choiceId,course_id:self,kind,options,source_url:ix.courses.get(self)?.source_url};
      if(/^option-\d+$/.test(explicit||'')) {
        const selected=branches[Number(explicit.slice(7))-1];
        if(selected)return {...selected,routeChoices:[descriptor,...(selected.routeChoices||[])]};
      }
      // Prefer an explicitly completed alternative, then courses already in this plan.
      const score=b=>{
        const target=ctx.terms?.findIndex(t=>t.id===ctx.positions?.[self]);
        const mistimed=b.deps.filter(e=>{
          const from=ctx.terms?.findIndex(t=>t.id===ctx.positions?.[e.from]);
          return from>=0&&target>=0&&(e.kind==='corequisite'?from!==target:from+e.gap>target);
        }).length;
        return b.deps.filter(e=>!present.has(e.from)).length*1000+mistimed*100+b.review.length*10+b.deps.length+finite(b.minUnits);
      };
      const eligible=branches.filter(b=>!b.review.length&&b.deps.every(e=>present.has(e.from)||completed.has(e.from)));
      if(eligible.length)return eligible.sort((a,b)=>score(a)-score(b))[0];
      // An unresolved program choice can reserve the sequence without selecting a course.
      const slot=ctx.items.find(c=>c.choice?.type==='CHOOSE_PATH'&&c.choice.options?.every(o=>
        branches.some(b=>b.deps.length&&!b.review.length&&b.deps.every(e=>nodeIds(o.rule).map(ix.canonical).includes(e.from)))));
      return {deps:slot?[{from:slot.id,to:self,kind,gap:kind==='prerequisite'?1:0,provisional:true}]:[],
        review:['Choose or confirm an eligible prerequisite alternative; no course has been selected automatically.'],
        pending:[descriptor],routeChoices:[descriptor]};
    }
    case 'ALL_OF': {
      const parts=(node.children||[]).map(n=>rulePlan(n,ctx,kind));
      return {deps:parts.flatMap(p=>p.deps),review:parts.flatMap(p=>p.review),pending:parts.flatMap(p=>p.pending||[]),routeChoices:parts.flatMap(p=>p.routeChoices||[]),minUnits:Math.max(0,...parts.map(p=>p.minUnits||0))};
    }
    case 'CONCURRENT_ALLOWED':return rulePlan({type:'ALL_OF',children:node.children},ctx,'concurrent');
    case 'CONDITIONAL':return node.when?.business_major&&!business?{deps:[],review:[]}:rulePlan(node.then,ctx,kind);
    case 'NOT_STATED':case 'NO_REQUIREMENT_STATED':return {deps:[],review:[]};
    case 'COMPLETED_REQUIREMENT': {
      const area=['LOWER_DIVISION_WRITING','1A'].includes(node.requirement)?'1A':node.requirement;
      if(ctx.geCompleted.includes(area))return {deps:[],review:[]};
      const item=ctx.items.find(c=>c.geAssignment===area || c.geArea===area || c.ge_areas?.includes(area)||c.geReservations?.includes(area));
      return item && item.id!==self?{deps:[{from:item.id,to:self,kind:'prerequisite',gap:1}],review:[]}:
        {deps:[],review:['Lower-division writing / GE prerequisite needs confirmation.']};
    }
    case 'MIN_COMPLETED_UNITS':return {deps:[],review:[],minUnits:node.units};
    default:return {deps:[],review:[node.message||node.requirement||'Placement, minimum grades or department permission needs confirmation.']};
  }
}

export function ruleUnitRange(node,ix) {
  if(!node)return [0,0];
  if(['COURSE','REPEAT_COURSE'].includes(node.type)) {
    const c=ix.courses.get(node.course_id);if(!c)return [0,0];
    const parts=c.components.filter(p=>!node.component_ids?.length||node.component_ids.includes(p.component_id));
    return [parts.reduce((s,p)=>s+finite(p.units_min),0),parts.reduce((s,p)=>s+finite(p.units_max,p.units_min),0)];
  }
  if(['ANY_OF','CHOOSE_PATH'].includes(node.type)) {
    const ranges=(node.options?.map(o=>o.rule)||node.children||[]).map(n=>ruleUnitRange(n,ix));
    return ranges.length?[Math.min(...ranges.map(r=>r[0])),Math.max(...ranges.map(r=>r[1]))]:[0,0];
  }
  if(['CHOOSE_OPTIONS','CHOOSE_COURSES','APPROVED_ELECTIVES','DOMAIN_EMPHASIS'].includes(node.type)) {
    if(node.minimum_units!=null)return [node.minimum_units,node.maximum_units??node.minimum_units];
    if(node.type==='DOMAIN_EMPHASIS')return [node.elective_route.minimum_units,node.elective_route.minimum_units];
    const ranges=(node.options?.map(o=>ruleUnitRange(o.rule,ix))||node.course_ids?.map(id=>ruleUnitRange({type:'COURSE',course_id:id},ix))||[]);
    const count=node.minimum_count||1;
    return [ranges.map(r=>r[0]).sort((a,b)=>a-b).slice(0,count).reduce((a,b)=>a+b,0),
      ranges.map(r=>r[1]).sort((a,b)=>b-a).slice(0,count).reduce((a,b)=>a+b,0)];
  }
  return (node.children||[]).map(n=>ruleUnitRange(n,ix)).reduce((a,b)=>[a[0]+b[0],a[1]+b[1]],[0,0]);
}

function placeholderForChoice(choice,ix) {
  const selected=finite(choice.selected_units), target=finite(choice.minimum_units||choice.elective_route?.minimum_units,0);
  const range=ruleUnitRange(choice,ix);
  const estimate=Math.max(0,(target||range[0])-selected), maximum=Math.max(estimate,range[1]-selected);
  return {id:`choice:${choice.choice_id}`,code:'PROGRAM CHOICE',title:choice.label||'Choose a required course',
    units_min:estimate,units_max:maximum,remainingChoiceUnits:estimate,roles:['choice'],choiceId:choice.choice_id,
    placeholder:true,choice,needs_review:true,level:'lower_division',ge_areas:[]};
}

function reserveChoiceGE(plan,items,ix,programs) {
  const normalize=a=>['2-UD','5-UD'].includes(a)?'2/5-UD':a;
  function coverage(node) {
    if(node.type==='COURSE') {
      const c=ix.courses.get(node.course_id);if(!c)return new Map();
      const tags=new Set(c.ge_areas.map(normalize));
      for(const p of programs)for(const ov of p?.ge_overrides||[]) {
        if(ov.rule.type==='ANY_OF'&&ov.rule.children.some(n=>n.type==='COURSE'&&n.course_id===node.course_id))ov.targets.forEach(t=>tags.add(normalize(t)));
      }
      const base=[...tags].filter(t=>plan.ge_requirements.some(a=>a.kind!=='overlay'&&a.area_id===t));
      // Multiple base areas require an explicit allocation; never reserve both for one course.
      return base.length===1?new Map([[base[0],ruleUnitRange(node,ix)[0]]]):new Map();
    }
    const result=new Map();
    if(['ALL_OF','REQUIREMENT_GROUP'].includes(node.type))for(const child of node.children||[])for(const [tag,u]of coverage(child))result.set(tag,(result.get(tag)||0)+u);
    return result;
  }
  for(const item of items.filter(c=>c.choice?.type==='CHOOSE_PATH')) {
    const branches=item.choice.options.map(o=>coverage(o.rule));
    for(const area of plan.ge_requirements.filter(a=>a.kind!=='overlay')) {
      const amount=Math.min(area.additional_units_to_plan,...branches.map(b=>b.get(area.area_id)||0));
      if(amount>0){area.additional_units_to_plan-=amount;area.reserved_by_choices=[...(area.reserved_by_choices||[]),item.choiceId];
        item.geReservations=[...(item.geReservations||[]),area.area_id];}
    }
  }
}

export function selectedRoadmap(data,state) {
  const maps=(data.roadmaps||[]).filter(r=>r.program_id===state.settings.major);
  return maps.find(r=>r.roadmap_id===state.settings.roadmap)|| (maps.length===1?maps[0]:null);
}

/** Turn the catalog checklist into real course cards and explicit unresolved slots. */
export function derivePlan(data,state) {
  const ix=catalogIndex(data,state), completed=new Set(state.completed.map(ix.canonical));
  const plan=buildPlan(ix.data,{major_id:state.settings.major,minor_id:state.settings.minor||undefined,
    selections:state.selections,approved_choices:state.approvedChoices,completed:state.completed,
    ge_courses:state.added.filter(id=>ix.courses.has(id)),ge_assignments:state.geAssignments,excluded_course_ids:state.removed});
  const removed=new Set(state.removed), items=[];
  for(const row of plan.required_courses) {
    if(removed.has(row.course_id))continue;
    const parts=row.components.filter(p=>row.required_components.includes(p.component_id));
    items.push({...row,id:row.course_id,units_min:parts.some(p=>p.units_min==null)?null:parts.reduce((s,p)=>s+finite(p.units_min),0),
      units_max:parts.reduce((s,p)=>s+finite(p.units_max,p.units_min),0),completed:completed.has(row.course_id),geAssignment:state.geAssignments[row.course_id]});
  }
  for(const choice of plan.choices) {
    const placeholder=placeholderForChoice(choice,ix), single=choice.type==='CHOOSE_PATH'&&placeholder.units_max<=6, count=single?1:Math.max(1,Math.min(40,Math.ceil(placeholder.remainingChoiceUnits/3)));
    for(let n=0;n<count;n++)items.push({...placeholder,id:placeholder.id+':'+n,
      units_min:single?placeholder.units_min:Math.max(0,Math.min(3,placeholder.remainingChoiceUnits-n*3)),
      units_max:single?placeholder.units_max:Math.max(0,Math.min(3,placeholder.remainingChoiceUnits-n*3))});
  }
  reserveChoiceGE(plan,items,ix,[ix.programs.get(state.settings.major),ix.programs.get(state.settings.minor)]);
  const baseAreas=plan.ge_requirements.filter(a=>a.kind!=='overlay');
  for(const area of baseAreas) {
    if(state.geCompleted.includes(area.area_id))continue;
    let remaining=area.additional_units_to_plan;
    let n=0;
    while(remaining>0.01 && n<10) {
      const u=Math.min(area.area_id==='5C'?1:3,remaining);
      items.push({id:`ge:${area.area_id}:${n++}`,code:`GE ${area.area_id}`,title:area.name,
        units_min:u,roles:['ge'],placeholder:true,geArea:area.area_id,ge_areas:[area.area_id],
        level:area.area_id==='2/5-UD'?'upper_division':'lower_division',minUnits:area.area_id==='2/5-UD'?60:0});
      remaining-=u;
    }
  }
  // Resolve prerequisite closure without interpreting review-only referenced courses as mandatory.
  const business=isBusinessMajor(ix.programs.get(state.settings.major));
  for(let pass=0;pass<16;pass++) {
    const present=new Set(items.map(c=>c.id)); let changed=false;
    for(const item of [...items]) {
      if(item.placeholder || item.completed)continue;
      const ctx={ix,present,completed,self:item.id,business,items,geCompleted:state.geCompleted,positions:state.positions,terms:makeTerms(state),prerequisiteSelections:state.prerequisiteSelections};
      for(const node of [item.prerequisites,item.corequisites]) {
        const result=rulePlan(node,ctx,node===item.corequisites?'corequisite':'prerequisite');
        for(const edge of result.deps) {
          if(present.has(edge.from) || completed.has(edge.from) || removed.has(edge.from))continue;
          const course=ix.courses.get(edge.from);
          if(course && items.length<450) {
            items.push({...course,id:course.course_id,completed:completed.has(course.course_id),roles:['preparation']});
            present.add(course.course_id);changed=true;
          }
        }
      }
    }
    if(!changed)break;
  }
  const minimum=ix.programs.get(state.settings.major)?.degree_unit_minimum||120;
  const roadmap=selectedRoadmap(data,state);
  const electiveSlots=roadmap?.semesters.flatMap(s=>s.rows.filter(r=>/^(?:(?:degree|free|general) )?elective$/i.test(r.label.trim())).map(r=>({semester:s.index,units:Math.max(...(r.units_label.match(/\d+(?:\.\d+)?/g)||['0']).map(Number))})))||[];
  const known=items.reduce((sum,c)=>sum+courseUnits(c),0)+finite(state.settings.transferUnits);
  let electiveRemaining=Math.max(0,minimum-known), i=0;
  while(electiveRemaining>0.01 && i<100) {
    const slot=electiveSlots[i],u=Math.min(slot?.units>0?slot.units:3,electiveRemaining);
    items.push({id:`elective:${i++}`,code:'ELECTIVE',title:'Choose a degree elective',units_min:u,
      roles:['elective'],placeholder:true,level:'lower_division',ge_areas:[],roadmapSemester:slot?.semester});
    electiveRemaining-=u;
  }
  const present=new Set(items.map(c=>c.id)), edges=[], review=[], pendingPrerequisites=[], prerequisiteChoices=[];
  const upperGeTags=new Set(['2/5-UD','2-UD','5-UD','3A','3B','4','F']);
  for(const item of items) {
    if(item.placeholder)continue;
    const ctx={ix,present,completed,self:item.id,business,items,geCompleted:state.geCompleted,positions:state.positions,terms:makeTerms(state),prerequisiteSelections:state.prerequisiteSelections};
    if(item.completed)continue;
    item.minUnits=0;
    for(const [node,kind] of [[item.prerequisites,'prerequisite'],[item.corequisites,'corequisite']]) {
      const result=rulePlan(node,ctx,kind);
      item.minUnits=Math.max(item.minUnits,result.minUnits||0);
      edges.push(...result.deps);
      pendingPrerequisites.push(...(result.pending||[]));
      prerequisiteChoices.push(...(result.routeChoices||[]));
      result.review.forEach(message=>review.push({id:item.id,message}));
    }
    const majorUpperGe=plan.ge_requirements.find(a=>a.area_id==='2/5-UD')?.covered_by_planned_courses?.includes(item.id);
    if(item.level==='upper_division'&&(item.ge_areas?.some(a=>upperGeTags.has(a))||majorUpperGe)) {
      item.minUnits=Math.max(item.minUnits,60);
      for(const areaId of ['1A','1B','1C','2-LD']) {
        const area=plan.ge_requirements.find(a=>a.area_id===areaId);
        if(state.geCompleted.includes(areaId)||area?.covered_by_major_completion)continue;
        const prior=items.filter(c=>c.geArea===areaId||c.geAssignment===areaId||c.geReservations?.includes(areaId)||area?.covered_by_planned_courses?.includes(c.id));
        for(const source of prior)if(source.id!==item.id&&!source.completed)edges.push({from:source.id,to:item.id,kind:'prerequisite',gap:1});
      }
    }
  }
  for(const link of state.links) {
    const members=link.members.filter(id=>present.has(id));
    for(let i=1;i<members.length;i++) edges.push({from:members[i-1],to:members[i],kind:link.kind==='corequisite'?'corequisite':'linked',gap:link.kind==='corequisite'?0:1,linkId:link.id});
  }
  const dedup=edges.filter((e,i,a)=>e.from!==e.to&&a.findIndex(o=>o.from===e.from&&o.to===e.to&&o.kind===e.kind)===i);
  const geSlotUse=new Map();
  for(const item of items) {
    const matches=roadmap?.semesters.flatMap(s=>s.rows.map(r=>({...r,semester:s.index,season:s.season,year:s.year}))).filter(r=>
      r.course_ids.includes(item.id)||(item.choice&&nodeIds(item.choice).some(id=>r.course_ids.includes(id)))||
      item.geArea&&r.ge_areas.includes(item.geArea))||[];
    if(matches.length) {
      if(item.geArea) {
        const selected=matches.find(r=>(geSlotUse.get(r.semester+':'+r.source_line)||0)<Number(r.units_label.match(/\d+/)?.[0]||3))||matches.at(-1);
        item.roadmapSemester=selected.semester;const key=selected.semester+':'+selected.source_line;geSlotUse.set(key,(geSlotUse.get(key)||0)+courseUnits(item));
      } else item.roadmapSemester=Math.min(...matches.map(r=>r.semester));
      const source=matches.find(r=>r.semester===item.roadmapSemester);
      if(source){item.roadmapSeason=source.season;item.roadmapYear=source.year;}
    }
    if(roadmap?.program_id==='cit-bs'&&item.choiceId?.startsWith('cit-domain'))item.roadmapSemester=[4,5,5,6,7][Number(item.id.split(':').at(-1))]??7;
  }
  return {ix,checklist:plan,items,edges:dedup,review,pendingPrerequisites,prerequisiteChoices,minimum,terms:makeTerms(state),baseAreas,roadmap};
}

/** Atomic groups keep separate corequisite cards in one semester. */
function groupsFor(derived) {
  const ids=new Set(derived.items.map(c=>c.id)), parent=new Map([...ids].map(id=>[id,id]));
  const root=id=>{while(parent.get(id)!==id)id=parent.get(id);return id;};
  for(const e of derived.edges) if(e.kind==='corequisite' && ids.has(e.from)&&ids.has(e.to))parent.set(root(e.to),root(e.from));
  const groups=new Map();
  for(const item of derived.items) {const r=root(item.id);if(!groups.has(r))groups.set(r,[]);groups.get(r).push(item);}
  return {groups,root};
}

export function autoSchedule(data,input,{preserve=false}={}) {
  const state=clone(input), d=derivePlan(data,state), {groups,root}=groupsFor(d);
  const positions={...state.positions}, loads=new Map(d.terms.map(t=>[t.id,0]));
  const termIx=id=>d.terms.findIndex(t=>t.id===id);
  const inEdges=new Map([...groups.keys()].map(id=>[id,[]]));
  const internallyConflicted=new Set(d.edges.filter(e=>e.gap>0&&groups.has(root(e.to))&&root(e.from)===root(e.to)).map(e=>root(e.to)));
  for(const e of d.edges) if(groups.has(root(e.to))&&groups.has(root(e.from))&&root(e.from)!==root(e.to))inEdges.get(root(e.to)).push(e);
  const depthMemo=new Map();
  const depth=(id,visiting=new Set())=>{
    if(visiting.has(id))return 0;
    if(depthMemo.has(id))return depthMemo.get(id);
    const next=new Set(visiting).add(id);
    const children=d.edges.filter(e=>root(e.from)===id && root(e.to)!==id && groups.has(root(e.to)));
    const value=children.length?Math.min(30,Math.max(...children.map(e=>e.gap+depth(root(e.to),next)))):0;
    depthMemo.set(id,value);return value;
  };
  const depths=new Map([...groups.keys()].map(id=>[id,depth(id)]));
  const termWeight=t=>['Fall','Spring'].includes(t.season)?1:Math.min(1,Number(t.limit)/Number(state.settings.regularLimit));
  const targetUnits=d.items.filter(c=>!c.completed).reduce((sum,c)=>sum+courseUnits(c),0)/d.terms.reduce((sum,t)=>sum+termWeight(t),0);
  const unresolved=new Set(groups.keys());
  // Preserve user placements and completed cards. Auto-rebalance honors explicit locks.
  for(const [id,members] of groups) {
    const keep=members.find(c=>state.locked.includes(c.id)&&positions[c.id]) || members.find(c=>c.completed&&positions[c.id]);
    if(keep) {
      for(const c of members)positions[c.id]=positions[keep.id];
      unresolved.delete(id);
    } else if(!preserve)members.forEach(c=>delete positions[c.id]);
  }
  if(preserve) for(const [id,members] of groups) if(members.every(c=>positions[c.id]&&termIx(positions[c.id])>=0))unresolved.delete(id);
  for(const c of d.items) if(!unresolved.has(root(c.id)) && !c.completed && loads.has(positions[c.id]))loads.set(positions[c.id],loads.get(positions[c.id])+courseUnits(c));
  for(let round=0;round<d.items.length+5 && unresolved.size;round++) {
    const ready=[...unresolved].filter(id=>!internallyConflicted.has(id)&&inEdges.get(id).every(e=>!unresolved.has(root(e.from)) || d.items.find(c=>c.id===e.from)?.completed));
    if(!ready.length)break;
    // Place available foundation / GE credit before testing upper-division standing.
    ready.sort((a,b)=>Number(groups.get(a).some(c=>c.minUnits>0))-Number(groups.get(b).some(c=>c.minUnits>0)) ||
      (depths.get(b)-depths.get(a)) || Number(groups.get(a).every(c=>c.placeholder))-Number(groups.get(b).every(c=>c.placeholder)));
    let progress=false;
    for(const id of ready) {
      const members=groups.get(id), units=members.filter(c=>!c.completed).reduce((s,c)=>s+courseUnits(c),0);
      let earliest=0;
      for(const e of inEdges.get(id)) if(!d.items.find(c=>c.id===e.from)?.completed) {
        const idx=termIx(positions[e.from]);
        if(idx<0){earliest=d.terms.length;break;}
        earliest=Math.max(earliest,idx+e.gap);
      }
      const minUnits=Math.max(...members.map(c=>c.minUnits||0));
      let chosen=-1;
      const possible=[];
      for(let t=earliest;t<d.terms.length;t++) {
        const term=d.terms[t];
        const creditsBefore=finite(state.settings.transferUnits)+d.items.filter(c=>c.completed||termIx(positions[c.id])>=0&&termIx(positions[c.id])<t).reduce((s,c)=>s+courseUnits(c),0);
        // If standing is pending, later groups may fill earlier semesters in a future pass.
        if(creditsBefore<minUnits)continue;
        if(members.some(c=>state.availability[c.id]?.length&&!state.availability[c.id].includes(term.season)))continue;
        if(loads.get(term.id)+units>Number(term.limit)+0.001)continue;
        possible.push(t);
      }
      if(possible.length) {
        const latest=d.terms.length-1-depths.get(id);
        const onTime=possible.filter(t=>t<=latest);
        const eligible=onTime.length?onTime:possible;
        chosen=eligible.find(t=>loads.get(d.terms[t].id)+units<=Math.min(Number(d.terms[t].limit),targetUnits*termWeight(d.terms[t]))+0.5)??eligible[0];
        if(Number(state.settings.years)===4) {
          const hints=members.map(c=>c.roadmapSemester).filter(Number.isFinite);
          if(hints.length) {
            const regular=d.terms.filter(t=>['Fall','Spring'].includes(t.season));
            const hint=members.find(c=>c.roadmapSemester===Math.max(...hints));
            const suggested=['Summer','Winter'].includes(hint?.roadmapSeason)?d.terms.findIndex(t=>t.season===hint.roadmapSeason&&t.year===Number(state.settings.startYear)+hint.roadmapYear):termIx(regular[Math.max(...hints)]?.id);
            if(possible.includes(suggested))chosen=suggested;
          }
        }
      }
      if(chosen>=0) {
        members.forEach(c=>positions[c.id]=d.terms[chosen].id);
        loads.set(d.terms[chosen].id,loads.get(d.terms[chosen].id)+units);
        unresolved.delete(id);progress=true;
        break;
      }
    }
    if(!progress) {
      // Fill an unblocked elective/GE group so minimum-standing courses can become ready.
      const fillers=ready.filter(id=>groups.get(id).every(c=>c.placeholder&&!c.minUnits));
      if(!fillers.length)break;
      break;
    }
  }
  for(const id of unresolved)for(const c of groups.get(id))delete positions[c.id];
  state.positions=Object.fromEntries(d.items.filter(c=>positions[c.id]).map(c=>[c.id,positions[c.id]]));
  return state;
}

export function validatePlan(data,state,derived=derivePlan(data,state)) {
  const issues=[], byId=new Map(derived.items.map(c=>[c.id,c])), ti=new Map(derived.terms.map((t,i)=>[t.id,i]));
  for(const message of derived.checklist.errors)issues.push({severity:'error',kind:'program',message});
  for(const choice of derived.pendingPrerequisites||[])issues.push({severity:'warning',id:choice.course_id,kind:'prerequisite-choice',message:`${shortCode(choice.course_id)}: confirm a prerequisite alternative in Program choices. Eligibility is unresolved.`});
  if(derived.roadmap) {
    const suggested=new Map();
    for(const semester of derived.roadmap.semesters)for(const row of semester.rows)for(const id of row.course_ids)suggested.set(id,Math.min(suggested.get(id)??Infinity,semester.index));
    for(const edge of derived.edges.filter(e=>e.gap>0&&!e.provisional))if(suggested.has(edge.from)&&suggested.has(edge.to)&&suggested.get(edge.from)>=suggested.get(edge.to))
      issues.push({severity:'warning',id:edge.to,kind:'source-conflict',message:`The sample roadmap places ${shortCode(edge.from)} with or after ${shortCode(edge.to)}, while the course page requires it earlier. This plan follows the course prerequisite. Confirm prior credit or an approved exception.`});
    const years=Math.max(...derived.roadmap.semesters.map(s=>s.year));
    if(years>Number(state.settings.years))issues.push({severity:'warning',kind:'roadmap-horizon',message:`The official reference extends into year ${years}. Your selected ${state.settings.years}-year timeline may require more time.`});
    for(const season of ['Summer','Winter'])if(derived.roadmap.semesters.some(s=>s.season===season)&&!state.settings[season.toLowerCase()])
      issues.push({severity:'warning',kind:'roadmap-session',message:`The official roadmap includes ${season} sessions. Your plan has no ${season} sessions enabled; confirm the revised timing and offerings.`});
  }
  for(const check of derived.checklist.requirement_checks.filter(c=>c.minimum_met===false))issues.push({severity:'warning',kind:'program-credits',message:`${check.label}: ${check.selected_units??'?'} of ${check.minimum_units} required units selected. Review this program block.`});
  for(const c of derived.checklist.required_courses)if(state.removed.includes(c.course_id)&&c.roles.some(r=>r==='major'||r==='minor'))issues.push({severity:'warning',id:c.course_id,kind:'removed',message:`${c.code} was removed but remains a program requirement. Confirm an approved substitution or restore it.`});
  for(const e of derived.edges) {
    const from=byId.get(e.from),to=byId.get(e.to);
    if(to?.completed || from?.completed)continue;
    if(!from) {issues.push({severity:'error',id:e.to,kind:'missing',message:`${shortCode(e.from)} is a prerequisite missing from this plan.`});continue;}
    const a=ti.get(state.positions[e.from]),b=ti.get(state.positions[e.to]);
    if(a==null||b==null)continue;
    if(e.kind==='corequisite'?a!==b:b<a+e.gap)issues.push({severity:'error',id:e.to,kind:'sequence',
      message:`${from.code} ${e.kind==='corequisite'?'must share a semester with':e.gap?'must come before':'must be before or alongside'} ${to.code}.`});
  }
  for(const t of derived.terms) {
    const cards=derived.items.filter(c=>state.positions[c.id]===t.id&&!c.completed);
    const units=cards.reduce((s,c)=>s+courseUnits(c),0);
    if(units>Number(t.limit)+0.01)issues.push({severity:'warning',kind:'load',term:t.id,message:`${termLabel(t)} has ${units} units; your limit is ${t.limit}.`});
  }
  for(const c of derived.items) {
    if(!c.placeholder&&c.source_coverage&&c.source_coverage!=='individual_course_page')issues.push({severity:'warning',id:c.id,kind:'course-source',message:`${c.code}: the program lists this course, but its individual course requirements are unconfirmed in this snapshot. Check the linked official program source.`});
    if(c.repeat_requirement)issues.push({severity:'warning',id:c.id,kind:'repeat-requirement',message:`${c.code}: this block includes repeated enrollments or topics. Confirm each enrollment and its units; one completed card does not certify the repeat requirement.`});
    if(c.requested_variants?.length)issues.push({severity:'warning',id:c.id,kind:'course-variant',message:`${c.code}: the program specifies ${c.requested_variants.join(' / ')} within this catalog family. Confirm the exact variant, credit value and any separate enrollments.`});
    if(c.units_min==null)issues.push({severity:'warning',id:c.id,kind:'unknown-credits',message:`${c.code}: catalog units are unconfirmed. The unit estimate excludes this course until confirmed.`});
    const index=ti.get(state.positions[c.id]);
    if(index==null)issues.push({severity:'warning',id:c.id,kind:'unscheduled',message:`${c.code}: choose a semester or extend your timeline.`});
    if(c.completed)continue;
    const before=finite(state.settings.transferUnits)+derived.items.filter(other=>other.id!==c.id&&(other.completed||ti.get(state.positions[other.id])<index)).reduce((s,x)=>s+courseUnits(x),0);
    if(index!=null && c.minUnits && before<c.minUnits)issues.push({severity:'error',id:c.id,kind:'standing',message:`${c.code} needs ${c.minUnits} prior units; this plan has ${before} before that semester.`});
    const t=derived.terms[index];
    if(t&&state.availability[c.id]?.length&&!state.availability[c.id].includes(t.season))issues.push({severity:'error',id:c.id,kind:'availability',message:`${c.code} is outside the seasons you selected.`});
  }
  const placeholders=derived.items.filter(c=>c.placeholder);
  if(placeholders.length)issues.push({severity:'warning',kind:'choices',message:`${placeholders.length} reserved GE, elective or program cards still need specific course selections.`});
  for(const area of derived.checklist.ge_requirements.filter(a=>a.kind==='overlay')) {
    if(state.geCompleted.includes(area.area_id))continue;
    const candidates=derived.items.filter(c=>area.eligible_planned_courses.includes(c.id));
    const units=candidates.reduce((sum,c)=>sum+courseUnits(c),0);
    if(area.required_units&&units<area.required_units||area.required_courses&&candidates.length<area.required_courses)issues.push({severity:'warning',kind:'ge-overlay',message:`${area.area_id}: choose eligible courses to cover ${area.required_units?area.required_units+' shared units':area.required_courses+' course'} of ${area.name}. These units can overlap other GE areas; distribution rules still apply.`});
  }
  return issues;
}

/** A rejected move never mutates the input state. Explicit linked groups keep their offsets. */
export function moveCourse(data,input,id,target,{linked=input.moveLinked}={}) {
  const state=clone(input), d=derivePlan(data,state), terms=d.terms, byId=new Map(d.items.map(c=>[c.id,c]));
  const at=course=>terms.findIndex(t=>t.id===state.positions[course]);
  const dest=terms.findIndex(t=>t.id===target), source=at(id), delta=dest-source;
  if(!byId.has(id)||dest<0)return {ok:false,message:'Choose an existing course and semester.'};
  const moving=new Set([id]);
  if(linked) {
    let changed=true;
    while(changed){changed=false;for(const group of state.links)if(group.members.some(c=>moving.has(c)))for(const c of group.members)if(byId.has(c)&&!moving.has(c)){moving.add(c);changed=true;}}
  }
  // Separate lecture/lab cards must stay together even when custom group movement is off.
  let changed=true;
  while(changed){changed=false;for(const e of d.edges)if(e.kind==='corequisite'&&(moving.has(e.from)||moving.has(e.to)))for(const c of [e.from,e.to])if(byId.has(c)&&!moving.has(c)&&!byId.get(c).completed){moving.add(c);changed=true;}}
  if([...moving].some(c=>state.locked.includes(c)))return {ok:false,message:'A course in this move is locked. Unlock it in course details first.'};
  for(const c of moving) {
    const idx=source<0?dest:at(c)<0?dest:at(c)+delta;
    if(idx<0||idx>=terms.length)return {ok:false,message:'This course link would leave the timeline. Add a term or choose a different semester.'};
    state.positions[c]=terms[idx].id;
  }
  // Moving a prerequisite later ripples forward through its dependents.
  for(let pass=0;pass<d.items.length;pass++) {
    let updated=false;
    for(const e of derivePlan(data,state).edges) {
      if(!moving.has(e.from)||byId.get(e.to)?.completed||!byId.has(e.to))continue;
      const a=at(e.from),b=at(e.to);
      if(a<0||b<0)continue;
      const needed=e.kind==='corequisite'?a:Math.max(b,a+e.gap);
      if(needed===b)continue;
      if(needed>=terms.length)return {ok:false,message:`${byId.get(e.to).code} would fall beyond your timeline. Add a term or move the sequence earlier.`};
      if(state.locked.includes(e.to))return {ok:false,message:`${byId.get(e.to).code} is locked and would need to move.`};
      // Preserve explicit custom groups encountered by a downstream ripple too.
      const group=linked?state.links.find(g=>g.members.includes(e.to)):null;
      const shift=needed-b;
      for(const member of group?.members||[e.to]) {
        if(!byId.has(member)||byId.get(member).completed)continue;
        const idx=at(member)+shift;
        if(idx<0||idx>=terms.length||state.locked.includes(member))return {ok:false,message:'A downstream linked group cannot fit in the selected timeline.'};
        state.positions[member]=terms[idx].id;moving.add(member);
      }
      updated=true;
    }
    if(!updated)break;
    if(pass===d.items.length-1)return {ok:false,message:'These course links form a cycle. Edit the links before moving this course.'};
  }
  const before=validatePlan(data,input,d), after=validatePlan(data,state);
  const signature=e=>`${e.kind}|${e.id}|${e.message}`;
  const oldErrors=new Set(before.filter(e=>e.severity==='error').map(signature));
  const newError=after.find(e=>e.severity==='error'&&!oldErrors.has(signature(e)));
  if(newError)return {ok:false,message:newError.message};
  return {ok:true,state,moved:[...moving],warnings:after.filter(e=>e.kind==='load')};
}

export function createLink(data,input,members,kind,label='') {
  const state=clone(input), d=derivePlan(data,state), valid=new Set(d.items.filter(c=>!c.placeholder).map(c=>c.id));
  const ids=unique(members).filter(id=>valid.has(id));
  if(ids.length<2)return {ok:false,message:'Select at least two catalog or custom courses.'};
  const ti=id=>d.terms.findIndex(t=>t.id===state.positions[id]);
  ids.sort((a,b)=>ti(a)-ti(b));
  if(ids.some(id=>state.locked.includes(id)))return {ok:false,message:'Unlock these courses before creating a link.'};
  const newLink={id:`link-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,label:label.trim().slice(0,80)||'My course link',kind,members:ids};
  // Normalize group positions immediately, then run the same atomic move validation.
  if(kind==='corequisite') {
    const base=Math.max(0,...ids.map(ti));
    ids.forEach(id=>state.positions[id]=d.terms[base]?.id);
  } else {
    let index=Math.max(0,ti(ids[0]));
    for(const id of ids){index=Math.max(index,ti(id));if(index>=d.terms.length)return {ok:false,message:'Add a term to fit this sequence.'};state.positions[id]=d.terms[index++].id;}
  }
  state.links.push(newLink);
  const oldErrors=new Set(validatePlan(data,input).filter(e=>e.severity==='error').map(e=>e.message));
  const error=validatePlan(data,state).find(e=>e.severity==='error'&&!oldErrors.has(e.message));
  if(error)return {ok:false,message:error.message};
  return {ok:true,state,link:newLink};
}

export function geOptions(data,areaId) {
  return geCourseOptions(data,areaId).filter(c=>c.source_coverage!=='unresolved_program_reference');
}

export function exportPlan(state,data) {
  return JSON.stringify({application:'CSUN Reimagined Program Mapper',catalogYear:data.metadata.catalog_year,
    exportedAt:new Date().toISOString(),plan:state},null,2);
}

/** Strict import boundary: no arbitrary HTML, URLs, data prototypes or unlimited arrays. */
export function importPlan(text,data) {
  if(typeof text!=='string'||text.length>2_000_000)throw new Error('Choose a plan JSON file smaller than 2 MB.');
  const raw=JSON.parse(text), p=raw.plan||raw;
  if(![1,SCHEMA_VERSION].includes(p.schemaVersion)||!p.settings||!Array.isArray(p.completed))throw new Error('This file is not a supported mapper plan.');
  const state=initialState(), s=p.settings;
  const programs=new Map(data.programs.map(x=>[x.program_id,x]));
  if(programs.get(s.major)?.type!=='major'||s.minor&&programs.get(s.minor)?.type!=='minor')throw new Error('This plan names a program outside the loaded catalog.');
  for(const [key,min,max] of [['years',1,8],['startYear',2000,2100],['regularLimit',1,30],['summerLimit',1,20],['winterLimit',1,12],['transferUnits',0,300]]) {
    if(!Number.isFinite(Number(s[key]))||Number(s[key])<min||Number(s[key])>max)throw new Error(`Invalid ${key} in this plan.`);
  }
  if(!Number.isInteger(Number(s.years))||!Number.isInteger(Number(s.startYear)))throw new Error('Plan years and start year must be whole numbers.');
  if(!['Fall','Spring'].includes(s.startSeason))throw new Error('Invalid starting semester.');
  state.settings={major:s.major,minor:s.minor||'',startSeason:s.startSeason,summer:!!s.summer,winter:!!s.winter};
  for(const key of ['years','startYear','regularLimit','summerLimit','winterLimit','transferUnits'])state.settings[key]=Number(s[key]);
  if(typeof s.roadmap==='string'&&(data.roadmaps||[]).some(r=>r.roadmap_id===s.roadmap&&r.program_id===s.major))state.settings.roadmap=s.roadmap;
  const safeKey=k=>typeof k==='string'&&k.length<250&&!['__proto__','constructor','prototype'].includes(k);
  const strings=a=>Array.isArray(a)?unique(a.filter(safeKey)).slice(0,1000):[];
  for(const key of ['completed','geCompleted','added','removed','locked','approvedChoices'])state[key]=strings(p[key]);
  state.name=String(p.name||state.name).slice(0,100);
  for(const key of ['positions','notes','geAssignments','selections','availability','prerequisiteSelections','legacySelections']) {
    if(!p[key]||typeof p[key]!=='object'||Array.isArray(p[key]))continue;
    for(const [k,v] of Object.entries(p[key]).slice(0,2000))if(safeKey(k)) {
      if(typeof v==='string')state[key][k]=v.slice(0,key==='notes'?2000:250);
      if(Array.isArray(v))state[key][k]=strings(v);
    }
  }
  state.extraTerms=(p.extraTerms||[]).filter(t=>t&&SEASONS.includes(t.season)&&Number.isInteger(t.year)&&t.year>=2000&&t.year<=2100).slice(0,40).map(t=>({id:termKey(t.season,t.year),season:t.season,year:t.year}));
  state.links=(p.links||[]).filter(g=>g&&safeKey(g.id)&&['sequence','corequisite'].includes(g.kind)).slice(0,100).map(g=>({id:g.id,label:String(g.label||'Course link').slice(0,80),kind:g.kind,members:strings(g.members).slice(0,40)}));
  state.customCourses=(p.customCourses||[]).slice(0,100).filter(c=>c&&safeKey(c.course_id)&&/^CUSTOM-/.test(c.course_id)&&Number(c.units_min)>=0&&Number(c.units_min)<=30).map(c=>({
    course_id:c.course_id,code:String(c.code||'CUSTOM').slice(0,30),title:String(c.title||'Custom course').slice(0,180),
    units_min:Number(c.units_min),units_max:Number(c.units_min),components:[{component_id:c.course_id,code:String(c.code).slice(0,30),units_min:Number(c.units_min),units_max:Number(c.units_min)}],
    prerequisites:{type:'NOT_STATED'},corequisites:{type:'NOT_STATED'},ge_areas:[],level:'lower_division',needs_review:true,
    description:String(c.description||'').slice(0,2000),source_url:safeOfficialUrl(c.source_url),custom:true}));
  for(const [id,value] of Object.entries(p.unitOverrides||{})) {
    const course=[...data.courses,...state.customCourses].find(c=>c.course_id===id),units=Number(value);
    if(safeKey(id)&&course?.components.length===1&&Number.isFinite(units)&&units>=course.units_min&&units<=course.units_max)state.unitOverrides[id]=units;
  }
  // Custom links preserve any explicitly declared custom prerequisite relations in the export.
  for(const key of ['showLinks','moveLinked','showCompleted'])state[key]=p[key]!==false;
  if(p.schemaVersion===1) {
    state.legacySelections=clone(state.selections);state.selections={};state.approvedChoices=[];
    // Preserve recorded progress, while previous automatic paths wait for explicit confirmation.
    state.added=unique([...state.added,...state.completed.filter(id=>data.courses.some(c=>c.course_id===id))]);
  }
  return state;
}

export function safeOfficialUrl(value) {
  try {const url=new URL(value);return url.protocol==='https:'&&(url.hostname==='csun.edu'||url.hostname.endsWith('.csun.edu'))?url.href:'';}
  catch{return '';}
}
