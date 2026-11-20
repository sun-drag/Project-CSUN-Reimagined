// A small DOM contract harness for exercising the real page module when Chromium
// is unavailable. It does not claim to test layout, pointer hit testing or browser APIs.
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import * as core from '../../js/pages/account-core.mjs';

const decode=s=>String(s).replace(/&(?:amp|lt|gt|quot|#39|#\d+);/g,t=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#39;':"'"}[t]||String.fromCodePoint(Number(t.slice(2,-1)))));
const camel=s=>s.replace(/-([a-z])/g,(_,x)=>x.toUpperCase());
const kebab=s=>s.replace(/[A-Z]/g,x=>'-'+x.toLowerCase());
const voidTags=new Set(['AREA','BASE','BR','COL','EMBED','HR','IMG','INPUT','LINK','META','PARAM','SOURCE','TRACK','WBR']);
function matches(node,selector){
  if(node.tagName==='#TEXT')return false;
  return selector.split(',').some(part=>{
    part=part.trim();if(!part)return false;
    if(part.includes(' '))part=part.split(/\s+/).at(-1);
    if(part.endsWith(':checked')){if(!node.checked)return false;part=part.slice(0,-8);}
    const attrs=[...part.matchAll(/\[([^=\]]+)(?:="([^"]*)")?\]/g)];
    for(const [,key,value] of attrs){if(!Object.hasOwn(node.attrs,key)||value!==undefined&&node.attrs[key]!==value)return false;}
    part=part.replace(/\[[^\]]*\]/g,'');
    const id=part.match(/#([\w-]+)/)?.[1];if(id&&node.id!==id)return false;
    for(const [,c] of part.matchAll(/\.([\w-]+)/g))if(!node.classList.contains(c))return false;
    const tag=part.match(/^[A-Za-z][\w-]*/)?.[0];return !tag||node.tagName===tag.toUpperCase();
  });
}
function descendants(node){return node.children.flatMap(c=>[c,...descendants(c)]);}
class Element{
  constructor(tag,doc){this.tagName=tag.toUpperCase();this.attrs={};this.children=[];this.parentElement=null;this.ownerDocument=doc;this.listeners={};this.style={};this._value=undefined;this._checked=undefined;this._disabled=undefined;this.open=false;this.scrollTop=0;
    this.dataset=new Proxy({},{get:(_,key)=>this.attrs['data-'+kebab(String(key))],set:(_,key,value)=>{this.attrs['data-'+kebab(String(key))]=String(value);return true;}});
    const set=()=>new Set((this.attrs.class||'').split(/\s+/).filter(Boolean)),write=s=>this.attrs.class=[...s].join(' ');
    this.classList={contains:c=>set().has(c),add:(...names)=>{const s=set();names.forEach(n=>s.add(n));write(s);},remove:(...names)=>{const s=set();names.forEach(n=>s.delete(n));write(s);},toggle:(c,force)=>{const s=set(),on=force??!s.has(c);on?s.add(c):s.delete(c);write(s);return on;}};
  }
  get id(){return this.attrs.id||'';}set id(v){this.attrs.id=String(v);}
  get className(){return this.attrs.class||'';}set className(v){this.attrs.class=String(v);}
  get value(){if(this._value!==undefined)return this._value;if(this.tagName==='SELECT'){const opts=this.querySelectorAll('option');return (opts.find(o=>Object.hasOwn(o.attrs,'selected'))||opts[0])?.value||'';}if(this.tagName==='TEXTAREA')return this.textContent;return this.attrs.value||'';}set value(v){this._value=String(v);}
  get checked(){return this._checked??Object.hasOwn(this.attrs,'checked');}set checked(v){this._checked=!!v;}
  get disabled(){return this._disabled??Object.hasOwn(this.attrs,'disabled');}set disabled(v){this._disabled=!!v;}
  get hidden(){return Object.hasOwn(this.attrs,'hidden');}set hidden(v){v?this.attrs.hidden='':delete this.attrs.hidden;}
  get draggable(){return this.attrs.draggable==='true';}set draggable(v){this.attrs.draggable=String(v);}
  get textContent(){return this.tagName==='#TEXT'?this._text||'':this.children.map(c=>c.textContent).join('');}set textContent(v){this.children=[];const n=new Element('#TEXT',this.ownerDocument);n._text=String(v);this.append(n);}
  set innerHTML(html){this.children=[];this._value=undefined;parse(String(html),this,this.ownerDocument);}get innerHTML(){return this.children.map(n=>n.outerHTML).join('');}
  get outerHTML(){if(this.tagName==='#TEXT')return this._text||'';return '<'+this.tagName.toLowerCase()+Object.entries(this.attrs).map(([k,v])=>' '+k+'="'+v+'"').join('')+'>'+this.innerHTML+'</'+this.tagName.toLowerCase()+'>';}
  append(...nodes){for(const node of nodes){node.parentElement=this;this.children.push(node);}}
  prepend(node){node.parentElement=this;this.children.unshift(node);}
  remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(c=>c!==this);}
  setAttribute(k,v){this.attrs[k]=String(v);}getAttribute(k){return this.attrs[k]??null;}
  querySelectorAll(s){return descendants(this).filter(n=>matches(n,s));}querySelector(s){return this.querySelectorAll(s)[0]||null;}
  closest(s){let n=this;while(n){if(matches(n,s))return n;n=n.parentElement;}return null;}
  addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}
  trigger(type,extra={}){const event={pending:[],type,target:this,currentTarget:this,preventDefault(){this.defaultPrevented=true;},stopPropagation(){this.stopped=true;},...extra};let n=this;while(n){event.currentTarget=n;const result=n['on'+type]?.(event);if(result?.then)event.pending.push(result);for(const fn of n.listeners[type]||[]){const value=fn(event);if(value?.then)event.pending.push(value);}if(event.stopped)break;n=n.parentElement;}return event;}
  click(){if(this.tagName==='A'&&this.download)this.ownerDocument.downloads.push({filename:this.download,url:this.href});return this.trigger('click',{clientX:50,clientY:50});}
  focus(){this.ownerDocument.activeElement=this;}
  showModal(){this.open=true;this.focus();}close(){this.open=false;this.trigger('close');}
  getBoundingClientRect(){return {top:0,left:0,right:300,bottom:80,width:300,height:80};}
  insertAdjacentHTML(position,html){if(position!=='beforeend')throw new Error(position);parse(html,this,this.ownerDocument);}
  reportValidity(){return true;}scrollIntoView(){}
}
function parse(html,parent,doc){
  const stack=[parent],tokens=html.match(/<!--[\s\S]*?-->|<![^>]*>|<[^>]+>|[^<]+/g)||[];
  for(const token of tokens){
    if(token.startsWith('<!'))continue;
    if(token.startsWith('</')){const tag=token.slice(2,-1).trim().toUpperCase();for(let i=stack.length-1;i>0;i--)if(stack[i].tagName===tag){stack.splice(i);break;}continue;}
    if(token.startsWith('<')){const match=token.match(/^<([\w-]+)([\s\S]*?)\/?\s*>$/);if(!match)continue;const node=new Element(match[1],doc);
      for(const [,name,a,b,c] of match[2].matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g))node.attrs[name]=decode(a??b??c??'');
      stack.at(-1).append(node);if(!voidTags.has(node.tagName)&&!token.endsWith('/>'))stack.push(node);
    }else{const node=new Element('#TEXT',doc);node._text=decode(token);stack.at(-1).append(node);}
  }
}
export async function launchPage(page,options={}){
 const site=path.resolve(new URL('../..',import.meta.url).pathname),document=new Element('DOCUMENT',null);document.ownerDocument=document;
 document.getElementById=id=>document.querySelector('#'+id);document.createElement=tag=>new Element(tag,document);document.createElementNS=(_,tag)=>new Element(tag,document);
 const html=fs.readFileSync(path.join(site,'pages',page),'utf8');parse(html,document,document);document.body=document.querySelector('body');document.activeElement=document.body;
 const errors=[],storage=new Map(Object.entries(options.storage||{})),timers=new Set();const location={href:options.url||'https://site.test/pages/'+page};
 const context=vm.createContext({...core,AccountClient:class extends core.AccountClient { constructor(config){ super(config,options.fetch); } },document,URL,URLSearchParams,AbortController,fetch:options.fetch,location,history:{replaceState(_a,_b,url){location.href=String(url);}},console:{log(){},error:e=>errors.push(String(e))},
  localStorage:{getItem:key=>{if(options.storageBlocked)throw Error('Blocked');return storage.get(key)||null;},setItem:(key,v)=>{if(options.storageBlocked)throw Error('Blocked');storage.set(key,String(v));}},
  setTimeout:(fn,delay)=>{const timer=setTimeout(()=>{timers.delete(timer);try{fn();}catch(e){errors.push(e.stack);}},delay);timer.unref();timers.add(timer);return timer;},clearTimeout:t=>{clearTimeout(t);timers.delete(t);}});
 context.window={matchMedia:()=>({matches:false})};
 for(const match of html.matchAll(/<script type="module" src="([^"?]+)/g)){
  const file=path.resolve(site,'pages',match[1]),code=fs.readFileSync(file,'utf8').replace(/^import [\s\S]*?;\s*/,'').replace('void boot();','globalThis.accountReady = boot();');
  try{vm.runInContext('(function(){'+code+'\n})()',context,{filename:path.basename(file)});}catch(e){errors.push(e.stack);}
 }
 await context.accountReady;
 return {document,storage,errors,location,dispose(){for(const t of timers)clearTimeout(t);}};
}
