import {buildPlan, createIndex, isBusinessMajor, geCourseOptions} from './program-mapper-catalog.mjs';

export const SCHEMA_VERSION = 1;
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
    selections:{}, approvedChoices:[], completed:[], geCompleted:[], geAssignments:{},
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
  function walk(n,role) {
    if(!n)return;
    let node=n;
    if(n.type==='ANY_OF') node={...n,type:'CHOOSE_PATH',label:n.label||'Choose a course or sequence',
      choice_id:n.choice_id||[state.settings.major,'alternative',...nodeIds(n)].join(':'),
      options:n.children.map((rule,i)=>({id:`option-${i+1}`,label:nodeIds(rule).map(shortCode).join(' + '),rule}))};
    if(['CHOOSE_PATH','CHOOSE_OPTIONS','CHOOSE_COURSES','APPROVED_ELECTIVES','DOMAIN_EMPHASIS'].includes(node.type)) {
      if(node.type==='DOMAIN_EMPHASIS' && state.settings.minor && !node.minor_route.excluded_minors.includes(state.settings.minor))return;
      result.push({...node,role});
      const selected=state.selections[node.choice_id];
      const values=Array.isArray(selected)?selected:[selected];
      for(const option of node.options||[]) if(values.includes(option.id))walk(option.rule,role);
      return;
    }
    (node.children||[]).forEach(child=>walk(child,role));
  }
  for(const id of [state.settings.major,state.settings.minor].filter(Boolean)) {
    for(const req of data.requirements.filter(r=>r.program_id===id))walk(req.rule,id===state.settings.major?'major':'minor');
  }
  return result.filter((x,i,a)=>a.findIndex(y=>y.choice_id===x.choice_id)===i);
}

export function withSuggestedPaths(data,state) {
  const next=clone(state);
  for(let i=0;i<12;i++) {
    let changed=false;
    for(const c of choiceDescriptors(data,next)) if(c.type==='CHOOSE_PATH' && !next.selections[c.choice_id] && c.options?.length) {
      next.selections[c.choice_id]=c.options[0].id; changed=true;
    }
    if(!changed)break;
  }
  return next;
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
      // Prefer an explicitly completed alternative, then courses already in this plan.
      const score=b=>{
        const target=ctx.terms?.findIndex(t=>t.id===ctx.positions?.[self]);
        const mistimed=b.deps.filter(e=>{
          const from=ctx.terms?.findIndex(t=>t.id===ctx.positions?.[e.from]);
          return from>=0&&target>=0&&(e.kind==='corequisite'?from!==target:from+e.gap>target);
        }).length;
        return b.deps.filter(e=>!present.has(e.from)).length*1000+mistimed*100+b.review.length*10+b.deps.length;
      };
      const pure=branches.filter(b=>b.deps.length||!b.review.length);
      const eligible=pure.length?pure:branches;
      return eligible.sort((a,b)=>score(a)-score(b))[0]||{deps:[],review:[]};
    }
    case 'ALL_OF': {
      const parts=(node.children||[]).map(n=>rulePlan(n,ctx,kind));
      return {deps:parts.flatMap(p=>p.deps),review:parts.flatMap(p=>p.review)};
    }
    case 'CONCURRENT_ALLOWED':return rulePlan({type:'ALL_OF',children:node.children},ctx,'concurrent');
    case 'CONDITIONAL':return node.when?.business_major&&!business?{deps:[],review:[]}:rulePlan(node.then,ctx,kind);
    case 'NOT_STATED':case 'NO_REQUIREMENT_STATED':return {deps:[],review:[]};
    case 'COMPLETED_REQUIREMENT': {
      const area=['LOWER_DIVISION_WRITING','1A'].includes(node.requirement)?'1A':node.requirement;
      if(ctx.geCompleted.includes(area))return {deps:[],review:[]};
      const item=ctx.items.find(c=>c.geAssignment===area || c.geArea===area || c.ge_areas?.includes(area));
      return item && item.id!==self?{deps:[{from:item.id,to:self,kind:'prerequisite',gap:1}],review:[]}:
        {deps:[],review:['Lower-division writing / GE prerequisite needs confirmation.']};
    }
    case 'MIN_COMPLETED_UNITS':return {deps:[],review:[],minUnits:node.units};
    default:return {deps:[],review:[node.message||node.requirement||'Placement, minimum grades or department permission needs confirmation.']};
  }
}

function minimumUnits(node) {
  if(!node)return 0;
  return Math.max(node.type==='MIN_COMPLETED_UNITS'?node.units:0,...(node.children||[]).map(minimumUnits));
}

function placeholderForChoice(choice,ix) {
  const selected=finite(choice.selected_units), target=finite(choice.minimum_units||choice.elective_route?.minimum_units,0);
  const estimate=target?Math.max(0,target-selected):choice.minimum_count?Math.max(0,choice.minimum_count-(choice.selected||[]).length)*3:3;
  return {id:`choice:${choice.choice_id}`,code:'PROGRAM CHOICE',title:choice.label||'Choose a required course',
    units_min:Math.min(estimate||3,3),remainingChoiceUnits:estimate||3,roles:['choice'],choiceId:choice.choice_id,
    placeholder:true,choice,needs_review:true,level:'lower_division',ge_areas:[]};
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
    items.push({...row,id:row.course_id,completed:completed.has(row.course_id),geAssignment:state.geAssignments[row.course_id]});
  }
  for(const choice of plan.choices) {
    const placeholder=placeholderForChoice(choice,ix), count=Math.min(40,Math.ceil(placeholder.remainingChoiceUnits/3));
    for(let n=0;n<count;n++)items.push({...placeholder,id:placeholder.id+':'+n,
      units_min:Math.min(3,placeholder.remainingChoiceUnits-n*3)});
  }
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
      const ctx={ix,present,completed,self:item.id,business,items,geCompleted:state.geCompleted,positions:state.positions,terms:makeTerms(state)};
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
  const known=items.reduce((sum,c)=>sum+courseUnits(c),0)+finite(state.settings.transferUnits);
  let electiveRemaining=Math.max(0,minimum-known), i=0;
  while(electiveRemaining>0.01 && i<100) {
    const u=Math.min(3,electiveRemaining);
    items.push({id:`elective:${i++}`,code:'ELECTIVE',title:'Choose a degree elective',units_min:u,
      roles:['elective'],placeholder:true,level:'lower_division',ge_areas:[]});
    electiveRemaining-=u;
  }
  const present=new Set(items.map(c=>c.id)), edges=[], review=[];
  const upperGeTags=new Set(['2/5-UD','2-UD','5-UD','3A','3B','4','F']);
  for(const item of items) {
    if(item.placeholder)continue;
    const ctx={ix,present,completed,self:item.id,business,items,geCompleted:state.geCompleted,positions:state.positions,terms:makeTerms(state)};
    for(const [node,kind] of [[item.prerequisites,'prerequisite'],[item.corequisites,'corequisite']]) {
      const result=rulePlan(node,ctx,kind);
      edges.push(...result.deps);
      result.review.forEach(message=>review.push({id:item.id,message}));
    }
    item.minUnits=minimumUnits(item.prerequisites);
    const majorUpperGe=plan.ge_requirements.find(a=>a.area_id==='2/5-UD')?.covered_by_planned_courses?.includes(item.id);
    if(item.level==='upper_division'&&(item.ge_areas?.some(a=>upperGeTags.has(a))||majorUpperGe)) {
      item.minUnits=Math.max(item.minUnits,60);
      for(const areaId of ['1A','1B','1C','2-LD']) {
        const area=plan.ge_requirements.find(a=>a.area_id===areaId);
        if(state.geCompleted.includes(areaId)||area?.covered_by_major_completion)continue;
        const prior=items.filter(c=>c.geArea===areaId||c.geAssignment===areaId||area?.covered_by_planned_courses?.includes(c.id));
        for(const source of prior)if(source.id!==item.id&&!source.completed)edges.push({from:source.id,to:item.id,kind:'prerequisite',gap:1});
      }
    }
  }
  for(const link of state.links) {
    const members=link.members.filter(id=>present.has(id));
    for(let i=1;i<members.length;i++) edges.push({from:members[i-1],to:members[i],kind:link.kind==='corequisite'?'corequisite':'linked',gap:link.kind==='corequisite'?0:1,linkId:link.id});
  }
  const dedup=edges.filter((e,i,a)=>e.from!==e.to&&a.findIndex(o=>o.from===e.from&&o.to===e.to&&o.kind===e.kind)===i);
  return {ix,checklist:plan,items,edges:dedup,review,minimum,terms:makeTerms(state),baseAreas};
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
    ready.sort((a,b)=>(depths.get(b)-depths.get(a)) || Number(groups.get(a).every(c=>c.placeholder))-Number(groups.get(b).every(c=>c.placeholder)));
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
  if(p.schemaVersion!==SCHEMA_VERSION||!p.settings||!Array.isArray(p.completed))throw new Error('This file is not a supported mapper plan.');
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
  const safeKey=k=>typeof k==='string'&&k.length<250&&!['__proto__','constructor','prototype'].includes(k);
  const strings=a=>Array.isArray(a)?unique(a.filter(safeKey)).slice(0,1000):[];
  for(const key of ['completed','geCompleted','added','removed','locked','approvedChoices'])state[key]=strings(p[key]);
  state.name=String(p.name||state.name).slice(0,100);
  for(const key of ['positions','notes','geAssignments','selections','availability']) {
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
  return state;
}

export function safeOfficialUrl(value) {
  try {const url=new URL(value);return url.protocol==='https:'&&(url.hostname==='csun.edu'||url.hostname.endsWith('.csun.edu'))?url.href:'';}
  catch{return '';}
}
