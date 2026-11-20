// Browser-compatible helpers. This builds a planning checklist, not an enrollment authorization.
const key = value => String(value).replaceAll(" ", "-");
const uniq = values => [...new Set(values)];
const children = node => node.children || [];
const indexCache=new WeakMap();

/** Assign a course to one base/campus area, maximizing covered units without splitting a course. */
function allocateAreas(candidates,capacities) {
  const left=new Map(capacities),assignment=new Map(),fixed=candidates.filter(c=>c.tags.length===1),flex=candidates.filter(c=>c.tags.length>1);
  for(const c of fixed) {
    const area=c.tags[0],units=Math.min(c.units,left.get(area)||0);
    if(units>0){assignment.set(c.id,area);left.set(area,left.get(area)-units);}
  }
  flex.sort((a,b)=>a.tags.length-b.tags.length||b.units-a.units||a.id.localeCompare(b.id));
  const areas=[...new Set(flex.flatMap(c=>c.tags))],initial=areas.map(a=>Math.round((left.get(a)||0)*100));
  const rows=flex.map(c=>({...c,units:Math.round(c.units*100),indices:c.tags.map(a=>areas.indexOf(a))}));
  const memo=new Map(),suffix=Array(rows.length+1).fill(0);
  for(let i=rows.length-1;i>=0;i--)suffix[i]=suffix[i+1]+rows[i].units;
  function solve(i,caps) {
    if(i===rows.length)return {score:0,area:-1};
    const key=i+'|'+caps.join(',');if(memo.has(key))return memo.get(key);
    const bound=Math.min(suffix[i],caps.reduce((a,b)=>a+b,0));
    if(!bound)return {score:0,area:-1};
    let best={score:-1,area:-1};
    const order=rows[i].indices.filter(j=>caps[j]>0).sort((a,b)=>Math.min(rows[i].units,caps[b])-Math.min(rows[i].units,caps[a]));
    for(const area of [...order,-1]) {
      const next=[...caps],gain=area<0?0:Math.min(rows[i].units,next[area]);if(area>=0)next[area]-=gain;
      const score=gain+solve(i+1,next).score;
      if(score>best.score)best={score,area};
      if(score===bound)break;
    }
    memo.set(key,best);return best;
  }
  let caps=initial;solve(0,caps);
  for(let i=0;i<rows.length;i++) {
    const result=solve(i,caps),area=result.area;
    if(area<0)continue;
    assignment.set(rows[i].id,areas[area]);caps=[...caps];caps[area]-=Math.min(rows[i].units,caps[area]);
  }
  return assignment;
}

export function createIndex(data) {
  if(indexCache.has(data))return indexCache.get(data);
  const courses = new Map(data.courses.map(c => [c.course_id,c]));
  const programs = new Map(data.programs.map(p => [p.program_id,p]));
  const aliases = new Map();
  for (const c of data.courses) {
    aliases.set(c.course_id,{course:c,components:c.components.map(x=>x.component_id)});
    for(const part of c.components) aliases.set(part.component_id,{course:c,components:[part.component_id]});
  }
  const result={courses,programs,aliases};indexCache.set(data,result);return result;
}
export function isBusinessMajor(program) {
  return /^(Accountancy|Information Systems|Business Administration),/.test(program?.name || "");
}
export function prerequisiteEdges(data, courseId, context={}) {
  const ix=createIndex(data), c=ix.courses.get(key(courseId));
  if(!c) throw new Error("Unknown course: "+courseId);
  const result=[];
  function walk(n,kind,path=[]) {
    if(!n)return;
    if(n.type==="CONDITIONAL") {
      if(n.when?.business_major && !context.business_major)return;
      return walk(n.then,kind,[...path,"conditional"]);
    }
    if(n.type==="COURSE") {
      result.push({course_id:c.course_id,required_course_id:n.course_id,
        required_components:n.component_ids || [],minimum_grade:n.minimum_grade || null,
        kind,logic_path:path,needs_review:false});
      return;
    }
    if(n.type==="REVIEW_REQUIRED") {
      for(const id of n.referenced_courses || []) result.push({
        course_id:c.course_id,required_course_id:id,required_components:[],minimum_grade:null,
        kind,logic_path:path,needs_review:true,message:n.message});
    }
    for(const x of children(n))walk(x,n.type==="CONCURRENT_ALLOWED"?"prerequisite_or_corequisite":kind,[...path,n.type]);
  }
  walk(c.prerequisites,"prerequisite");walk(c.corequisites,"corequisite");
  return result;
}

function normalizeArea(id) { return ["2-UD","5-UD"].includes(id) ? "2/5-UD" : id; }

export function domainChoice(data,node) {
  const route=node.elective_route;
  const family=code=>String(code).replace(/\/L$/,'').replace(/(\d)L$/,'$1');
  const excluded=new Set(route.excluded_codes.map(family));
  const eligible=data.courses.filter(c=>route.subjects.includes(c.code.split(' ')[0])&&
    Number(c.code.match(/\d+/)?.[0])>=route.number_range[0]&&Number(c.code.match(/\d+/)?.[0])<=route.number_range[1]&&
    ![c.code,...c.components.map(p=>p.code)].some(code=>excluded.has(family(code))));
  return {type:'CHOOSE_PATH',choice_id:node.choice_id+':route',label:node.label+': choose a route',source_url:'https://catalog.csun.edu/academics/comp/programs/bs-computer-information-technology/',
    options:[{id:'cit-comp-electives',label:'15 units of eligible upper-division CIT / COMP electives',rule:{type:'APPROVED_ELECTIVES',choice_id:node.choice_id,
      label:'CIT / COMP domain electives',minimum_units:route.minimum_units,candidate_course_ids:eligible.map(c=>c.course_id),combined_caps:route.combined_caps,strict_eligibility:true,
      constraints:['Excluded courses in the major cannot be reused here. COMP 488 and CIT 488 together may contribute at most 6 units.']}},
    {id:'approved-package',label:'Domain Emphasis Package · 15 units · all departments',rule:{type:'APPROVED_ELECTIVES',choice_id:node.choice_id+':approved',label:'Domain Emphasis Package',
      minimum_units:node.approved_package_route.minimum_units,maximum_lower_division_units:node.approved_package_route.maximum_lower_division_units,
      ge_overlap_allowed:false,approval_needed:true,candidate_course_ids:[],constraints:['Department chair approval is required before enrollment. At most 6 lower-division units; courses cannot overlap GE.']}}]};
}

export function buildPlan(data, options) {
  const ix=createIndex(data),major=ix.programs.get(options.major_id),
    minor=options.minor_id ? ix.programs.get(options.minor_id) : null;
  if(!major || major.type!=="major")throw new Error("Select a known major.");
  if(options.minor_id && (!minor || minor.type!=="minor"))throw new Error("Select a known minor.");
  const required=new Map(), choices=[],notices=[],errors=[];
  const canonical=id=>ix.aliases.get(key(id))?.course.course_id||key(id);
  const manualAssignments=new Map(Object.entries(options.ge_assignments||{}).map(([id,area])=>[canonical(id),area]));
  const selections=options.selections || {},selectedChoiceCourses=new Map();
  const requirementChecks=[],reviewConditions=[];

  const completedParts=new Set();
  for(const code of options.completed || []) {
    const a=ix.aliases.get(key(typeof code==="string"?code:code.course_id));
    if(a)for(const p of a.components)completedParts.add(p);
  }
  function add(id,role,parts=null) {
    const alias=ix.aliases.get(key(id)),c=alias?.course||ix.courses.get(key(id));
    if(!c) {errors.push("Unknown course: "+id);return;}
    if(!required.has(c.course_id))required.set(c.course_id,{...c,roles:[],required_components:[]});
    const row=required.get(c.course_id);
    row.roles=uniq([...row.roles,role]);
    row.required_components=uniq([...row.required_components,...(parts || alias?.components || c.components.map(x=>x.component_id))]);
  }
  function selectedCredits(ids) {
    let total=0,unknown=false;
    for(const id of uniq(ids.map(canonical))){
      const r=required.get(id);if(!r)continue;
      for(const part of r.components.filter(p=>r.required_components.includes(p.component_id))) {
        if(part.units_min==null)unknown=true;else total+=part.units_min;
      }
    }
    return {units:total,unknown};
  }
  function nodeIds(n) {
    if(!n)return [];
    if(n.type==="COURSE" || n.type==="REPEAT_COURSE")return [canonical(n.course_id)];
    return uniq([...children(n).flatMap(nodeIds),...(n.options||[]).flatMap(o=>nodeIds(o.rule)),...(n.candidate_course_ids||[])]);
  }
  const choiceId=n=>n.choice_id || [n.source_program || major.program_id,"alternative",...nodeIds(n)].join(":");
  function walk(n,role) {
    if(!n)return;
    if(n.type==="COURSE") {
      add(n.course_id,role,n.component_ids);
      if(n.requested_variant&&required.has(canonical(n.course_id))) {
        const row=required.get(canonical(n.course_id));row.requested_variants=uniq([...(row.requested_variants||[]),n.requested_variant]);
      }
      return;
    }
    if(n.type==="ALL_OF")return children(n).forEach(x=>walk(x,role));
    if(n.type==="REQUIREMENT_GROUP") {
      children(n).forEach(x=>walk(x,n.preparation_only?role+":preparation":role));
      if(n.minimum_units!=null || (n.constraints||[]).length) requirementChecks.push({
        group_id:n.group_id,label:n.label,minimum_units:n.minimum_units,
        maximum_units:n.maximum_units,course_ids:nodeIds(n),constraints:n.constraints||[],source_url:n.source_url});
      return;
    }
    if(n.type==="ANY_OF") {
      return walk({type:"CHOOSE_PATH",choice_id:choiceId(n),label:n.label || "Choose a course or course sequence",
        options:children(n).map((rule,i)=>({id:"option-"+(i+1),label:nodeIds(rule).map(id=>ix.courses.get(id)?.code||id).join(" + "),rule}))},role);
    }
    if(n.type==="CONDITION" || n.type==="REVIEW_REQUIRED") {
      reviewConditions.push({...n,role});return;
    }
    if(n.type==="REPEAT_COURSE") {
      add(n.course_id,role,n.component_ids);
      const row=required.get(canonical(n.course_id));
      if(row)row.repeat_requirement={minimum_enrollments:n.minimum_enrollments,minimum_units:n.minimum_units,source_url:n.source_url};
      reviewConditions.push({kind:"repeat_requirement",...n,role});return;
    }
    if(n.type==="CHOOSE_OPTIONS") {
      const raw=selections[n.choice_id], selected=uniq(raw==null?[]:(Array.isArray(raw)?raw:[raw]));
      const opts=n.options||[],chosen=[],alreadyRequired=new Set(required.keys());
      for(const value of selected) {
        let option=opts.find(o=>o.id===value);
        if(!option) {
          const matching=opts.filter(o=>nodeIds(o.rule).length===1 && nodeIds(o.rule)[0]===key(value));
          if(matching.length===1)option=matching[0];
        }
        if(!option)errors.push("Invalid selection for "+n.choice_id+": "+value);
        else if(!chosen.includes(option)){
          const excluded=(n.exclude_selected_choice_ids||[]).flatMap(id=>selectedChoiceCourses.get(id)||[]);
          if(n.separate_enrollment_required_if_already_required&&nodeIds(option.rule).some(id=>alreadyRequired.has(id))) {
            errors.push('A distinct repeat/topic enrollment requires confirmation in '+n.choice_id+'. The same enrollment cannot count in both blocks.');
          } else if(nodeIds(option.rule).some(id=>excluded.includes(id)))errors.push("A course cannot be counted again in "+n.choice_id+" after being used in the core requirement.");
          else {chosen.push(option);walk(option.rule,role);}
        }
      }
      const ids=uniq(chosen.flatMap(o=>nodeIds(o.rule))).filter(id=>required.has(id)),credits=selectedCredits(ids);
      selectedChoiceCourses.set(n.choice_id,ids);
      const lower=selectedCredits(ids.filter(id=>ix.courses.get(id).level==='lower_division'));
      const lowerExceeded=n.maximum_lower_division_units!=null&&lower.units>n.maximum_lower_division_units;
      if(lowerExceeded)errors.push('Too many lower-division units in '+n.choice_id);
      const subsetMissing=(n.subset_minima||[]).filter(sub=>{
        if(sub.option_ids)return chosen.filter(o=>sub.option_ids.includes(o.id)).length<(sub.minimum_count||0);
        const eligible=ids.filter(id=>(!sub.subjects || sub.subjects.includes(ix.courses.get(id).code.split(" ")[0])) &&
          (!sub.course_ids || sub.course_ids.includes(id)) &&
          (!sub.levels || sub.levels.includes(ix.courses.get(id).level)));
        const units=selectedCredits(eligible);
        return (sub.minimum_units!=null && units.units<sub.minimum_units) ||
          (sub.minimum_count!=null && eligible.length<sub.minimum_count);
      });
      const descendantsOpen=choices.some(c=>chosen.some(o=>nodeIds(o.rule).some(id=>(c.options||[]).some(x=>nodeIds(x.rule).includes(id)))));
      if(lowerExceeded || chosen.length<(n.minimum_count||0) || credits.units<(n.minimum_units||0) || subsetMissing.length || credits.unknown || descendantsOpen || (!n.minimum_count && !n.minimum_units && !chosen.length))
        choices.push({...n,selected:chosen.map(o=>o.id),selected_units:credits.unknown?null:credits.units,missing_subsets:subsetMissing});
      if(n.maximum_count!=null && chosen.length>n.maximum_count)errors.push("Too many options in "+n.choice_id);
      return;
    }
    if(n.type==="APPROVED_ELECTIVES") {
      if(n.top_up_to_program_minimum) {
        const current=[...required.values()].filter(c=>c.roles.includes(role));
        const credit=selectedCredits(current.map(c=>c.course_id));
        n={...n,minimum_units:credit.unknown?null:Math.max(0,(n.program_minimum||0)-credit.units)};
        if(n.minimum_units===0)return;
      }
      const value=selections[n.choice_id],selected=uniq((value==null?[]:(Array.isArray(value)?value:[value])).map(key));
      const valid=[];
      for(const id of selected) {
        if(!ix.courses.has(id))errors.push("Unknown elective: "+id);
        else if((n.candidate_course_ids||[]).length && !n.candidate_course_ids.includes(id) && (n.strict_eligibility||!options.approved_choices?.includes(n.choice_id)))errors.push(id+" is not eligible in "+n.choice_id);
        else {valid.push(id);add(id,role);}
      }
      for(const cap of n.combined_caps||[]) {
        const units=selectedCredits(valid.filter(id=>cap.codes.includes(ix.courses.get(id).code))).units;
        if(units>cap.maximum_units)errors.push(`Combined course cap exceeded in ${n.choice_id}: maximum ${cap.maximum_units} units.`);
      }
      if(n.ge_overlap_allowed===false)for(const id of valid) {
        required.get(canonical(id)).exclude_from_ge=true;
        if(options.ge_assignments?.[id])errors.push('A domain-package course cannot also be assigned to GE. Remove the GE assignment or change the package.');
      }
      const lower=selectedCredits(valid.filter(id=>ix.courses.get(id).level==="lower_division"));
      selectedChoiceCourses.set(n.choice_id,valid);
      const lowerCapExceeded=n.maximum_lower_division_units!=null && lower.units>n.maximum_lower_division_units;
      if(lowerCapExceeded)errors.push("Too many lower division credits in "+n.choice_id);
      const credit=selectedCredits(valid),confirmed=!n.approval_needed || options.approved_choices?.includes(n.choice_id);
      if(lowerCapExceeded || credit.units<(n.minimum_units||0) || valid.length<(n.minimum_count||0) || credit.unknown || !confirmed || (!n.minimum_units && !n.minimum_count && !selected.length))
        choices.push({...n,selected:valid,selected_units:credit.unknown?null:credit.units,approval_confirmed:!!confirmed});
      return;
    }
    if(n.type==="CHOOSE_PATH") {
      const selected=selections[n.choice_id],chosen=n.options.find(x=>x.id===selected || nodeIds(x.rule).length===1 && nodeIds(x.rule)[0]===key(selected));
      if(chosen){selectedChoiceCourses.set(n.choice_id,nodeIds(chosen.rule));return walk(chosen.rule,role);}
      choices.push({...n});
      if(selected)errors.push("Invalid selection for "+n.choice_id);
      return;
    }
    if(n.type==="CHOOSE_COURSES") {
      const selected=uniq((selections[n.choice_id] || []).map(key));
      for(const id of selected) {
        if(!n.course_ids.includes(id))errors.push(id+" is not in "+n.choice_id);
        else add(id,role);
      }
      const valid=selected.filter(id=>n.course_ids.includes(id));
      selectedChoiceCourses.set(n.choice_id,valid);
      const units=valid.reduce((a,id)=>a+(ix.courses.get(id)?.units_min || 0),0);
      const missingSubsets=(n.subset_minima || []).filter(s =>
        valid.filter(id=>s.course_ids.includes(id)).reduce((a,id)=>a+(ix.courses.get(id)?.units_min || 0),0)<s.minimum_units);
      if(units<n.minimum_units || missingSubsets.length)
        choices.push({...n,selected:valid,selected_units:units,missing_subsets:missingSubsets});
      return;
    }
    if(n.type==="DOMAIN_EMPHASIS") {
      if(minor && n.minor_route.excluded_minors.includes(minor.program_id))errors.push('CIT cannot use a Computer Science or Information Systems minor. Choose another minor or a domain-emphasis route.');
      if(minor && options.use_minor_for_domain!==false &&
        !n.minor_route.excluded_minors.includes(minor.program_id)) {
        notices.push({kind:"domain_link",message:minor.name+" is the proposed CIT domain-emphasis route; do not add another 15-unit elective block.",
          needs_confirmation:!options.domain_minor_confirmed});
      } else {
        return walk(domainChoice(data,n),role);
      }
      return;
    }
    if(n.type==="DISPLAY_GROUPS") {
      choices.push({type:"PROGRAM_GROUPS",program_id:role==="major"?major.program_id:minor.program_id,
        groups:n.groups,needs_review:true,message:n.message});
      notices.push({kind:"program_review",message:"These source-grouped requirements need interpretation before automatic planning."});
      return;
    }
    notices.push({kind:"requirement_review",message:"Requirement type needs a mapper-specific handler: "+n.type});
  }
  for(const p of [major,minor].filter(Boolean)) {
    if(p.requires_additional_major && !options.additional_major_id)notices.push({kind:"additional_major_needed",program_id:p.program_id,message:"This program is offered as a double major; select the other major as well."});
    for(const condition of p.conditions || [])reviewConditions.push({...condition,program_id:p.program_id});
    if(p.unavailable_with_major_name===major.name)errors.push("This minor is unavailable with the selected major.");
    for(const r of data.requirements.filter(r=>r.program_id===p.program_id))walk(r.rule,p.type);
  }
  for(const id of options.ge_courses || [])add(key(id),"ge");
  let rows=[...required.values()];
  for(const row of rows)row.choice_ids=[...selectedChoiceCourses].filter(([,ids])=>ids.includes(row.course_id)).map(([id])=>id);
  for(const r of rows)r.completed=r.required_components.every(p=>completedParts.has(p));
  const context={business_major:isBusinessMajor(major)};
  const edges=rows.flatMap(r=>prerequisiteEdges(data,r.course_id,context));
  const reviewCourses=rows.filter(r=>r.needs_review);
  for(const c of reviewCourses)notices.push({kind:"course_review",course_id:c.course_id,source_url:c.source_url,
    message:"Some eligibility information needs confirmation; see the course source."});

  // Count each selected catalog entry once. Component-only requirements count only their pieces.
  const listedUnits=rows.reduce((sum,r)=>sum+r.components
    .filter(p=>r.required_components.includes(p.component_id))
    .reduce((s,p)=>s+(p.units_min || 0),0),0);
  const unknownUnitCourses=rows.filter(r=>r.components.some(p=>
    r.required_components.includes(p.component_id) && p.units_min==null)).map(r=>r.course_id);
  function plannedMatches(n) {
    if(n.type==="COURSE") {
      const r=required.get(canonical(n.course_id));
      return !!r && (n.component_ids || []).every(p=>r.required_components.includes(p));
    }
    if(n.type==="ALL_OF")return children(n).every(plannedMatches);
    if(n.type==="ANY_OF")return children(n).some(plannedMatches);
    return false;
  }
  const effectiveTags=new Map(rows.map(r=>[r.course_id,new Set(r.ge_areas)])),majorCovered=new Set();
  for(const p of [major,minor].filter(Boolean)) {
    
    for(const ov of p.ge_overrides || []) {
      for(const code of ov.wi_if_taken_at_csun || []) {
        const a=ix.aliases.get(key(code));
        if(a && effectiveTags.has(a.course.course_id))effectiveTags.get(a.course.course_id).add("WI");
      }
      if(ov.rule.type==="MAJOR_COMPLETION") {
        for(const t of ov.targets) {
          if(t==="ALL-GE")for(const a of data.ge_areas.filter(a=>a.kind==="base"))majorCovered.add(a.area_id);
          else majorCovered.add(normalizeArea(t));
        }
      } else if(plannedMatches(ov.rule)) {
        function attach(n) {
          if(n.type==="COURSE" && required.has(canonical(n.course_id)))for(const t of ov.targets)
            effectiveTags.get(canonical(n.course_id)).add(normalizeArea(t));
          for(const x of children(n))if(plannedMatches(x))attach(x);
        }
        attach(ov.rule);
        for(const code of ov.wi_if_taken_at_csun || []) {
          const a=ix.aliases.get(key(code));
          if(a && effectiveTags.has(a.course.course_id))effectiveTags.get(a.course.course_id).add("WI");
        }
      }
    }
  }
  const unitAreas=data.ge_areas.filter(a=>a.kind==="base" || a.kind==="campus");
  function coverage(completedOnly,priorAreas=false) {
    const used=new Map(unitAreas.map(a=>[a.area_id,[]]));
    const amount=new Map(unitAreas.map(a=>[a.area_id,
      (!completedOnly || options.major_completed) && majorCovered.has(a.area_id) ? a.required_units : 0]));
    const ambiguous=[],candidates=[],split=[],details=[];
    for(const r of rows.filter(r=>!options.excluded_course_ids?.includes(r.course_id))) {
      if(completedOnly && !r.completed)continue;
      let tags=uniq([...effectiveTags.get(r.course_id)].map(normalizeArea))
        .filter(t=>unitAreas.some(a=>a.area_id===t));
      if(r.exclude_from_ge)tags=tags.filter(t=>unitAreas.some(a=>a.area_id===t&&a.kind==='campus'));
      const manual=manualAssignments.get(r.course_id);
      if(manual&&!tags.includes(manual)){errors.push(r.code+' is not eligible for the assigned GE area '+manual);tags=[];}
      if(manual)tags=tags.filter(t=>t===manual);
      const credits=r.components.filter(p=>r.required_components.includes(p.component_id))
        .reduce((s,p)=>s+(p.units_min || 0),0);
      if(tags.length>1) {
        // A lecture + lab may cover separate science lecture and lab blocks.
        const lecture=tags.find(t=>t==="5A" || t==="5B");
        const lab=r.components.find(p=>r.required_components.includes(p.component_id)&&p.component_id.endsWith("L") && p.units_min===1);
        if(lecture && tags.includes("5C") && tags.length===2 && lab) {
          split.push({id:r.course_id,area:lecture,units:Math.max(0,credits-1)},{id:r.course_id,area:'5C',units:1});
          continue;
        }
      }
      const campus=tags.filter(t=>unitAreas.some(a=>a.area_id===t&&a.kind==='campus'));
      const base=tags.filter(t=>!campus.includes(t));
      // Campus requirements and GE are distinct checks; an explicitly designated course
      // can meet one of each while its earned units still occur only once in rows.
      if(campus.length&&base.length) {
        candidates.push({id:r.course_id+':campus',courseId:r.course_id,tags:campus,units:credits});
        candidates.push({id:r.course_id+':base',courseId:r.course_id,tags:base,units:credits});
      } else if(tags.length)candidates.push({id:r.course_id,tags,units:credits,manual:!!manual});
    }
    function apply(id,area,units) {
      const accepted=Math.min(units,unitAreas.find(a=>a.area_id===area).required_units-amount.get(area));
      if(accepted<=0)return;
      amount.set(area,amount.get(area)+accepted);used.get(area).push(id);details.push({course_id:id,area_id:area,units:accepted});
    }
    for(const c of split)if(!priorAreas||!options.completed_ge_areas?.includes(c.area))apply(c.id,c.area,c.units);
    const remaining=new Map(unitAreas.map(a=>[a.area_id,priorAreas&&options.completed_ge_areas?.includes(a.area_id)?0:a.required_units-amount.get(a.area_id)]));
    const assignments=allocateAreas(candidates,remaining);
    for(const c of candidates)if(assignments.has(c.id))apply(c.courseId||c.id,assignments.get(c.id),c.units);
    return {amount,used,ambiguous,details};
  }
  const planned=coverage(false,true),baseline=options.completed_ge_areas?.length?coverage(false):planned,completed=coverage(true);
  const ge=data.ge_areas.map(a => {
    if(a.kind==="overlay")return {...a,eligible_planned_courses:rows.filter(r=>!r.exclude_from_ge&&!options.excluded_course_ids?.includes(r.course_id)).filter(r=>{
      const tags=effectiveTags.get(r.course_id);
      if(a.area_id==="IC-BASIC")return tags.has("IC") && a.rules.areas.some(t=>tags.has(t));
      if(a.area_id==="IC-SUBJECT")return tags.has("IC") && !["1A","1B","1C","2-LD"].some(t=>tags.has(t));
      if(a.area_id==="UD-GE")return r.level==="upper_division" &&
        [...tags].some(t=>["2/5-UD","2-UD","5-UD","3A","3B","4","F"].includes(t));
      return tags.has(a.rules.designation || a.area_id);
    }).map(r=>r.course_id),allocation_note:"Overlay checks share credits; apply the listed distribution/grade conditions."};
    return {...a,planned_units:planned.amount.get(a.area_id),completed_units:completed.amount.get(a.area_id),
      baseline_additional_units_to_plan:Math.max(0,a.required_units-baseline.amount.get(a.area_id)),
      additional_units_to_plan:Math.max(0,a.required_units-planned.amount.get(a.area_id)),
      units_remaining_to_complete:Math.max(0,a.required_units-completed.amount.get(a.area_id)),
      covered_by_planned_courses:planned.used.get(a.area_id),covered_by_major_completion:majorCovered.has(a.area_id)};
  });
  const checks=requirementChecks.map(check=>{
    const selected=check.course_ids.filter(id=>required.has(id)),credits=selectedCredits(selected);
    return {...check,selected_units:credits.unknown?null:credits.units,minimum_met:check.minimum_units==null?null:!credits.unknown && credits.units>=check.minimum_units,
      status:credits.unknown?"credits_need_review":credits.units<(check.minimum_units||0)?"more_selections_needed":"credit_minimum_met"};
  });
  return {major:{id:major.program_id,name:major.name},minor:minor?{id:minor.program_id,name:minor.name}:null,
    required_courses:rows,choices,ge_requirements:ge,prerequisite_edges:edges,
    requirement_checks:checks,review_conditions:reviewConditions,
    unplanned_prerequisite_course_ids:uniq(edges.filter(e=>!required.has(e.required_course_id)).map(e=>e.required_course_id)),
    ambiguous_ge_assignments:planned.ambiguous,automatic_ge_assignments:planned.details,notices,errors:uniq(errors),
    listed_curriculum_units:unknownUnitCourses.length?null:listedUnits,
    known_curriculum_units:listedUnits,units_needing_review:unknownUnitCourses,
    additional_base_ge_units_to_plan:ge.filter(a=>a.kind==="base").reduce((s,a)=>s+a.additional_units_to_plan,0),
    additional_campus_units_to_plan:ge.filter(a=>a.kind==="campus").reduce((s,a)=>s+a.additional_units_to_plan,0),
    planning_complete:choices.length===0 && !checks.some(c=>c.minimum_met===false),
    certification_status:"not_certified",
    status:"Planning checklist; eligibility and unresolved source conditions still require confirmation."};
}

/** Return course cards approved for a GE area; overlay and allocation rules still apply. */
export function geCourseOptions(data, areaId) {
  const target=normalizeArea(areaId);
  return data.courses.filter(c=>c.ge_areas.some(a=>normalizeArea(a)===target))
    .sort((a,b)=>a.code.localeCompare(b.code,undefined,{numeric:true}));
}
