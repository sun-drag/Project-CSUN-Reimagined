import {RESOURCES,SCAMS,SECURITY_SOURCES,SECURITY_CHECKS,filterResources,loadSaved,escapeHTML as e,officialURL} from './student-tools-core.mjs?v=2026.11.19.1';
const $=id=>document.getElementById(id),KEY='csun-reimagined:security-checklist:v1';
let checked=[],timer;
try{checked=loadSaved(localStorage,KEY,SECURITY_CHECKS.map(c=>c[0]));}catch{}
function note(message){if(!$('st-toast'))return;$('st-toast').textContent=message;$('st-toast').hidden=false;clearTimeout(timer);timer=setTimeout(()=>$('st-toast').hidden=true,4000);}
function renderChecks(){
 if(!$('security-checklist'))return;
 $('security-progress').textContent=checked.length+' / '+SECURITY_CHECKS.length+' habits checked';
 $('security-checklist').innerHTML=SECURITY_CHECKS.map(([id,text])=>`<label><input type="checkbox" data-security-check="${e(id)}" ${checked.includes(id)?'checked':''}>${e(text)}</label>`).join('');
 $('security-checklist').querySelectorAll('[data-security-check]').forEach(box=>box.onchange=()=>{
  checked=box.checked?[...new Set([...checked,box.dataset.securityCheck])]:checked.filter(id=>id!==box.dataset.securityCheck);
  try{localStorage.setItem(KEY,JSON.stringify(checked));}catch{note('Checklist updated for this visit. Browser storage is unavailable.');}
  renderChecks();
 });
}
function renderScams(){
 if(!$('scam-grid'))return;const category=$('scam-category')?.value||'';
 $('scam-grid').innerHTML=SCAMS.filter(s=>!category||s.category===category).map(s=>`<details class="st-scam-card"><summary><span class="st-tag">${e(s.category)}</span><h3>${e(s.title)}</h3><p>${e(s.intro)}</p></summary><div class="st-scam-content"><h4>Warning signs</h4><ul>${s.signals.map(x=>'<li>'+e(x)+'</li>').join('')}</ul><h4>A safer next step</h4><p>${e(s.action)}</p><a class="st-text-link" href="${e(officialURL(SECURITY_SOURCES[s.source]))}" target="_blank" rel="noopener noreferrer">Read the official guidance ↗</a></div></details>`).join('');
}
const incidents={
 message:{title:'Pause, verify and report',steps:['Do not reply, use its links, scan its QR codes or open its attachments.','Verify the request through an official website, saved bookmark or contact method you already know.','For suspicious CSUN email, send the original message as an attachment to abuse@csun.edu. Include a short description of what happened, without sensitive information.'],link:'reporting',label:'Official reporting instructions'},
 credentials:{title:'Act promptly to protect your account',steps:['Open a trusted CSUN account page yourself. Change the affected password; if you reused it elsewhere, change those passwords too.','Reject unexpected Duo requests and contact the CSUN IT Help Center promptly, especially if you cannot sign in.','Tell IT what you entered or approved. Follow its account-recovery guidance; do not give anyone your password or MFA codes.'],link:'account',label:'Official CSUN account help'},
 money:{title:'Contact the payment provider promptly',steps:['Contact your bank, card issuer, gift-card issuer or payment service using independently found contact details. Explain that the payment may involve a scam and ask what recovery options are available.','Keep the relevant messages, receipts and transaction details. Do not send more money to someone promising to recover your funds.','Use the FTC’s recovery guidance and reporting service. If the scam used a CSUN account, also tell CSUN IT.'],link:'recovery',label:'FTC recovery and reporting guidance'},
 device:{title:'Get help through a trusted support channel',steps:['Stop interacting with the suspicious file, pop-up or caller. Do not grant remote access or install a tool they recommend.','If you suspect compromise, contact CSUN IT promptly and describe what you opened or installed. For a university-managed device, follow IT’s directions.','Use another trusted device for account changes if necessary, and preserve relevant message details for your report.'],link:'help',label:'Contact official CSUN IT support'}
};
function renderIncident(){if(!$('incident-guidance'))return;const item=incidents[$('incident-type').value]||incidents.message;
 $('incident-guidance').innerHTML=`<h3>${e(item.title)}</h3><ol>${item.steps.map(step=>'<li>'+e(step)+'</li>').join('')}</ol><a class="st-text-link" href="${e(officialURL(SECURITY_SOURCES[item.link]))}" target="_blank" rel="noopener noreferrer">${e(item.label)} ↗</a>${$('incident-type').value==='money'?'<p><a class="st-text-link" href="https://reportfraud.ftc.gov/" target="_blank" rel="noopener noreferrer">Report fraud to the FTC ↗</a></p>':''}`;
}
function renderResourcePreview(){
 if(!$('cyber-resource-results'))return;const query=$('cyber-resource-query').value;
 const rows=query.trim()?filterResources(RESOURCES,{query}).slice(0,3):RESOURCES.filter(r=>['it','pantry','lrc'].includes(r.id));
 $('cyber-resource-results').innerHTML=rows.map(r=>`<article class="st-mini-resource"><strong>${e(r.name)}</strong><p>${e(r.description)}</p><a href="resources.html?resource=${encodeURIComponent(r.id)}&amp;q=${encodeURIComponent(query)}">Details &amp; official links →</a></article>`).join('')||'<p class="st-caption">No match yet. Try a broader term or open the full resource finder.</p>';
}
renderChecks();renderScams();renderIncident();renderResourcePreview();
if($('scam-category'))$('scam-category').onchange=renderScams;
if($('incident-type'))$('incident-type').onchange=renderIncident;
if($('cyber-resource-query'))$('cyber-resource-query').oninput=renderResourcePreview;
