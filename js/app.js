(function(){
'use strict';
const D=window.DATA, NET=window.NET;
const $=(s,r)=> (r||document).querySelector(s), $$=(s,r)=>[...(r||document).querySelectorAll(s)];
const ESTADOS=['Pendiente','Contactado','Reunión agendada','En conversación','Seguimiento','Cerrado / sin interés'];
const LS_KEY='cpii2026_fao_seguimiento_v1';
const TIPOS={alianza:'Alianza',gobernanza:'Gobernanza ADI',proyecto:'Proyecto conjunto',evento:'Sala compartida',persona:'Persona puente',fao:'Vínculo FAO'};
const TIPO_DESC={alianza:'Alianza o vínculo registrado en la hoja Alianzas',gobernanza:'Persona o institución con rol en el directorio/consejos de ADI',proyecto:'Proyecto, programa o iniciativa que nombra a ambas organizaciones',evento:'Impulsan o comparten la misma sala/panel del evento',persona:'Una misma persona figura como contacto de ambas',fao:'Vínculo documentado de FAO Perú (ego)'};
const PAL=['#70BCFF','#448AC7','#1D4F7A','#00B0F0','#002060'];
const orgById=new Map(D.orgs.map(o=>[o.id,o])), perById=new Map(D.people.map(p=>[p.id,p]));
const nodeById=new Map(D.nodes.map(n=>[n.id,n])); nodeById.set(0,D.fao);
D.orgs.forEach(o=>{o.personas=D.people.filter(p=>p.org_id===o.id);});

/* ---------- utilidades ---------- */
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
function fmt(s){ // etiquetas [V] [I] [PC]
  return esc(s).replace(/\[(PC|V|I|CG)(?:[^\]]*)\]/g,(m,t)=>`<span class="chip ${t==='PC'?'pc':''}" title="${t==='PC'?'Por confirmar':t==='V'?'Verificado':t==='I'?'Inferencia':'Por verificar'}">${t}</span>`).replace(/\n/g,'<br>');
}
const isPC=s=>/\[PC/.test(String(s||''));
const cls=(p,v)=>p+String(v||'').replace(/\s+/g,'');
function toast(t){const e=$('#toast');e.textContent=t;e.style.display='block';clearTimeout(toast._t);toast._t=setTimeout(()=>e.style.display='none',2200);}

/* ---------- estado de seguimiento (localStorage) ---------- */
let ST={org:{},per:{}};
try{ST=Object.assign(ST,JSON.parse(localStorage.getItem(LS_KEY)||'{}'));}catch(e){}
function save(){try{localStorage.setItem(LS_KEY,JSON.stringify(ST));}catch(e){toast('No se pudo guardar en este navegador');}}
function getS(k,id){const r=ST[k][id]||{};return {estado:r.estado||'Pendiente',proxima:r.proxima||'',fecha:r.fecha||'',notas:r.notas||'',ts:r.ts||''};}
function setS(k,id,patch){ST[k][id]=Object.assign({},ST[k][id]||{},patch,{ts:new Date().toISOString()});save();}
const eIdx=e=>Math.max(0,ESTADOS.indexOf(e));

/* ---------- campos derivados del evento [I] ---------- */
function asist(ev){ev=String(ev||'');
  if(/no figura|vínculo vía/i.test(ev)) return 'No figura';
  if(/TBC|\[PC\]|web 2026|speaker 2025|agenda previa|speaker web|2025/i.test(ev) && !/(Lun|Mar) \d\d/.test(ev)) return 'Por confirmar';
  return 'En agenda';}
function dias(ev){const d=new Set();String(ev||'').replace(/\b(Lun|Mar)\w* (\d\d)/g,(m,a,b)=>d.add(a+' '+b));return [...d];}
D.orgs.forEach(o=>{o.asist=asist(o.evento);o.dias=dias(o.evento);o.pc=[o.anio,o.descripcion,o.contacto,o.proyectos.join('')].some(isPC)||o.proyectos.some(isPC);o.nPC=[o.anio,o.regiones,o.intereses,o.descripcion,...o.proyectos,o.contacto].filter(isPC).length;
  o.maxInf=Math.max(0,...o.personas.map(p=>['BAJO','MEDIO','ALTO','MUY ALTO'].indexOf(p.influencia)+1));});
D.people.forEach(p=>{p.asist=asist(p.evento);p.dias=dias(p.evento);p.pc=isPC(p.cargo)||isPC(p.titulo);});
const INFV={'MUY ALTO':4,'ALTO':3,'MEDIO':2,'BAJO':1}, RELV={'ALTO':3,'MEDIO':2,'BAJO':1};

/* ---------- red global ---------- */
const NS={layers:new Set(['alianza','gobernanza','proyecto','persona']),fao:true,ext:true,color:'com',size:'deg',labels:true,sel:null,selEdge:null,vb:null,pos:{}};
let GM=null,MM=null,CM=null,CPM=null,GV=null,GP=null;
const orgIds=new Set(D.orgs.map(o=>o.id));
function recalcNet(){
  const baseNodes=D.nodes.filter(n=>NS.ext||!n.externo);
  GM=NET.build(baseNodes,D.edges,NS.layers); MM=NET.metrics(GM); CM=NET.communities(GM); CPM=NET.cutpoints(GM);
  const withFao=baseNodes.concat([D.fao]), allE=D.edges.concat(D.fao_edges);
  const layF=new Set(NS.layers); layF.add('fao');
  GP=NET.build(withFao,allE,layF);              // grafo para caminos desde FAO (siempre con FAO)
  const lay=new Set(NS.layers); if(NS.fao) lay.add('fao');
  GV=NS.fao?GP:NET.build(baseNodes,D.edges,lay); // grafo visible
  const key=[...lay].sort().join()+NS.ext;
  if(NS._key!==key){NS.pos=NET.layout(GV,1000,720);NS._key=key;NS.posIds=GV.ids.slice();NS.vb={x:0,y:0,w:1000,h:720};}
}
const mv=(id,m)=>{const i=GM.idx.get(id);return i==null?0:MM[m][i];};
const comOf=id=>{const i=GM.idx.get(id);return i==null?-1:CM.label[i];};

/* ---------- vistas ---------- */
const VIEWS=['resumen','organizaciones','personas','agenda','red','alianzas','leyenda'];
let lastView='resumen';
function go(h){location.hash=h;}
function route(){
  const h=(location.hash.replace(/^#\/?/,'').split('?')[0])||'resumen'; const [a,b]=h.split('/');
  if((a==='org'||a==='per')&&!$('.view.on')){$('#v-resumen').classList.add('on');RENDER.resumen();}
  if(a==='org'&&orgById.has(+b)){openOrg(+b,true);return;}
  if(a==='per'&&perById.has(+b)){openPer(+b,true);return;}
  closeDrawer(true);
  const v=VIEWS.includes(a)?a:'resumen'; lastView=v;
  $$('.view').forEach(e=>e.classList.toggle('on',e.id==='v-'+v));
  $$('#tabs a').forEach(e=>e.classList.toggle('on',e.dataset.v===v));
  RENDER[v]&&RENDER[v]();
  window.scrollTo(0,0);
}
const RENDER={};

/* ===== RESUMEN ===== */
RENDER.resumen=function(){
  const O=D.orgs,P=D.people;
  const cnt=(arr,f)=>arr.filter(f).length;
  const sO=ESTADOS.map(e=>cnt(O,o=>getS('org',o.id).estado===e)), sP=ESTADOS.map(e=>cnt(P,p=>getS('per',p.id).estado===e));
  const contacted=O.length-sO[0];
  const pri=O.filter(o=>o.relevancia==='ALTO').sort((a,b)=>(b.maxInf-a.maxInf)||(a.id-b.id));
  $('#v-resumen').innerHTML=`
  <h2 class="t">Resumen para el evento</h2>
  <p class="lead">Todo se recalcula solo: cambia el estado en cada ficha y este panel se actualiza. Toca un número para ver esas organizaciones.</p>
  <div class="kpis">
    <button class="kpi btn" data-go="organizaciones?reset=1"><b>${O.length}</b><span>Organizaciones</span></button>
    <button class="kpi btn" data-go="organizaciones?reset=1&rel=ALTO"><b>${cnt(O,o=>o.relevancia==='ALTO')}</b><span>Relevancia alta</span></button>
    <button class="kpi btn" data-go="organizaciones?reset=1&rel=MEDIO"><b>${cnt(O,o=>o.relevancia==='MEDIO')}</b><span>Relevancia media</span></button>
    <button class="kpi btn" data-go="organizaciones?reset=1&rel=BAJO"><b>${cnt(O,o=>o.relevancia==='BAJO')}</b><span>Relevancia baja</span></button>
    <button class="kpi btn" data-go="personas?reset=1"><b>${P.length}</b><span>Personas</span></button>
    <button class="kpi btn" data-go="personas?reset=1&inf=MUY%20ALTO"><b>${cnt(P,p=>p.influencia==='MUY ALTO')}</b><span>Influencia muy alta</span></button>
    <button class="kpi btn" data-go="alianzas"><b>${D.alianzas.length}</b><span>Alianzas registradas</span></button>
    <button class="kpi btn" data-go="organizaciones?reset=1&pc=1"><b>${cnt(O,o=>o.pc)}</b><span>Orgs con algún campo [PC]</span></button>
    <div class="kpi"><b>${contacted}</b><span>Orgs ya contactadas</span></div>
  </div>
  <h3 class="s">Seguimiento (se actualiza al cambiar el estado)</h3>
  <div class="scroll"><table class="tbl" style="max-width:640px"><thead><tr><th>Estado</th><th class="num">Organizaciones</th><th class="num">Personas</th></tr></thead><tbody>
  ${ESTADOS.map((e,i)=>`<tr><td><span class="chip s-${i}">${e}</span></td><td class="num"><button class="link" data-go="organizaciones?reset=1&est=${encodeURIComponent(e)}">${sO[i]}</button></td><td class="num"><button class="link" data-go="personas?reset=1&est=${encodeURIComponent(e)}">${sP[i]}</button></td></tr>`).join('')}
  </tbody></table></div>
  <h3 class="s">Prioridades de networking (relevancia alta · ordenadas por influencia del contacto)</h3>
  <div class="scroll"><table class="tbl"><thead><tr><th>Organización</th><th>Contacto clave</th><th>Estado</th><th>Participación en el evento</th><th>Gancho de conversación</th><th>Qué pedir / ofrecer</th></tr></thead><tbody>
  ${pri.map(o=>{const k=o.personas.slice().sort((a,b)=>INFV[b.influencia]-INFV[a.influencia])[0];const s=getS('org',o.id);
    return `<tr><td><button class="link" data-org="${o.id}">${esc(o.corto)}</button></td><td>${k?`<button class="link" data-per="${k.id}">${esc(k.nombre)}</button> <span class="chip ${cls('i-',k.influencia)}">${esc(k.influencia)}</span>`:'—'}</td><td><span class="chip s-${eIdx(s.estado)}">${esc(s.estado)}</span></td><td>${fmt(o.evento)}</td><td>${fmt(o.gancho||o.uvm)}</td><td>${fmt(o.pedir||o.oportunidad)}</td></tr>`;}).join('')}
  </tbody></table></div>
  <h3 class="s">Reglas de oro para FAO (no salirse del mandato)</h3>
  ${D.reglas.map(r=>`<div class="flag">${fmt(r)}</div>`).join('')}
  <h3 class="s">Alertas: datos contradictorios o por confirmar</h3>
  ${D.alertas_excel.map(r=>`<div class="flag">⚠ ${fmt(r)}</div>`).join('')}
  <p class="note" style="margin-top:8px">Hallazgos nuevos de la búsqueda web (23-oct-2026) en la pestaña «Leyenda y alertas».</p>`;
};

/* ===== LISTADOS (orgs y personas) ===== */
const FILT={org:{q:'',rel:'',est:'',dia:'',asi:'',pc:'',ord:'rel'},per:{q:'',inf:'',est:'',dia:'',asi:'',org:'',ord:'inf'}};
function parseQuery(){const h=location.hash.split('?')[1];if(!h)return {};const o={};h.split('&').forEach(kv=>{const [k,v]=kv.split('=');o[k]=decodeURIComponent(v||'');});return o;}
const FILT0=JSON.parse(JSON.stringify(FILT));
function applyQuery(kind){const q=parseQuery();if(q.reset)FILT[kind]=Object.assign({},FILT0[kind]);Object.keys(q).forEach(k=>{if(k in FILT[kind])FILT[kind][k]=q[k];});}
function optList(vals,cur,all){return `<option value="">${all}</option>`+vals.map(v=>`<option ${v===cur?'selected':''}>${esc(v)}</option>`).join('');}

RENDER.organizaciones=function(){
  applyQuery('org'); const F=FILT.org;
  $('#v-organizaciones').innerHTML=`
  <h2 class="t">Organizaciones</h2>
  <p class="lead">Una tarjeta por organización. Toca la tarjeta para abrir la ficha completa; cambia el estado con el menú de color.</p>
  <div class="filters">
    <input type="search" id="fo-q" placeholder="Buscar organización, proyecto, persona…" value="${esc(F.q)}">
    <label>Relevancia<select id="fo-rel">${optList(['ALTO','MEDIO','BAJO'],F.rel,'Todas')}</select></label>
    <label>Estado<select id="fo-est">${optList(ESTADOS,F.est,'Todos')}</select></label>
    <label>Día<select id="fo-dia">${optList(['Lun 26','Mar 27'],F.dia,'Todos')}</select></label>
    <label>En el evento<select id="fo-asi">${optList(['En agenda','Por confirmar','No figura'],F.asi,'Todas')}</select></label>
    <label>Datos<select id="fo-pc"><option value="">Todos</option><option value="1" ${F.pc==='1'?'selected':''}>Con campos [PC]</option></select></label>
    <label>Ordenar<select id="fo-ord"><option value="rel" ${F.ord==='rel'?'selected':''}>Relevancia</option><option value="nom" ${F.ord==='nom'?'selected':''}>Nombre</option><option value="est" ${F.ord==='est'?'selected':''}>Estado</option><option value="inf" ${F.ord==='inf'?'selected':''}>Influencia del contacto</option><option value="num" ${F.ord==='num'?'selected':''}>Nº de personas</option></select></label>
    <span class="count" id="fo-n"></span>
  </div>
  <div class="grid" id="fo-grid"></div>`;
  const bind=(id,k)=>{const el=$(id);el.addEventListener(el.tagName==='INPUT'?'input':'change',()=>{F[k]=el.value;drawOrgs();});};
  bind('#fo-q','q');bind('#fo-rel','rel');bind('#fo-est','est');bind('#fo-dia','dia');bind('#fo-asi','asi');bind('#fo-pc','pc');bind('#fo-ord','ord');
  drawOrgs();
};
function orgHay(o){return norm([o.nombre,o.tipo,o.descripcion,o.proyectos.join(' '),o.regiones,o.personas.map(p=>p.nombre+' '+p.cargo).join(' '),(o.investigacion||[]).map(h=>h.t+' '+h.d).join(' ')].join(' '));}
orgById.forEach(o=>o._hay=orgHay(o));
function drawOrgs(){
  const F=FILT.org,q=norm(F.q); const list=D.orgs.filter(o=>
    (!q||o._hay.includes(q))&&(!F.rel||o.relevancia===F.rel)&&(!F.est||getS('org',o.id).estado===F.est)&&(!F.dia||o.dias.includes(F.dia))&&(!F.asi||o.asist===F.asi)&&(!F.pc||o.pc));
  const so={rel:(a,b)=>RELV[b.relevancia]-RELV[a.relevancia]||a.id-b.id,nom:(a,b)=>a.nombre.localeCompare(b.nombre,'es'),est:(a,b)=>eIdx(getS('org',a.id).estado)-eIdx(getS('org',b.id).estado)||a.id-b.id,inf:(a,b)=>b.maxInf-a.maxInf||a.id-b.id,num:(a,b)=>b.personas.length-a.personas.length||a.id-b.id};
  list.sort(so[F.ord]||so.rel);
  $('#fo-n').textContent=list.length+' de '+D.orgs.length;
  $('#fo-grid').innerHTML=list.map(orgCard).join('')||'<p class="note">Sin resultados con estos filtros.</p>';
}
function stSelect(kind,id,cur){return `<select class="sel s-${eIdx(cur)}" data-st="${kind}:${id}" aria-label="Estado">${ESTADOS.map(e=>`<option ${e===cur?'selected':''}>${e}</option>`).join('')}</select>`;}
function orgCard(o){const s=getS('org',o.id);
  return `<article class="card r-${o.relevancia[0]} ${s.estado.startsWith('Cerrado')?'done':''}" data-org="${o.id}" tabindex="0">
    <h4>${esc(o.nombre)}</h4>
    <div class="meta"><span class="chip ${cls('r-',o.relevancia)}">Relevancia ${esc(o.relevancia)}</span><span class="chip">${esc(o.tipo.split('(')[0].trim().slice(0,38))}</span>${o.nPC>2?'<span class="chip pc" title="Varios campos por confirmar">PC×'+o.nPC+'</span>':''}</div>
    <div class="ev">${fmt(o.evento)}</div>
    <div class="sub">${esc(o.regiones)}</div>
    <div class="row"><span class="ppl">${o.personas.length} persona${o.personas.length===1?'':'s'}</span>${stSelect('org',o.id,s.estado)}</div>
  </article>`;}

RENDER.personas=function(){
  applyQuery('per'); const F=FILT.per;
  $('#v-personas').innerHTML=`
  <h2 class="t">Personas</h2>
  <p class="lead">Quién es quién. Busca por nombre, cargo u organización; abre la ficha para ver cómo alinear la conversación.</p>
  <div class="filters">
    <input type="search" id="fp-q" placeholder="Buscar persona, cargo u organización…" value="${esc(F.q)}">
    <label>Influencia<select id="fp-inf">${optList(['MUY ALTO','ALTO','MEDIO','BAJO'],F.inf,'Todas')}</select></label>
    <label>Estado<select id="fp-est">${optList(ESTADOS,F.est,'Todos')}</select></label>
    <label>Día<select id="fp-dia">${optList(['Lun 26','Mar 27'],F.dia,'Todos')}</select></label>
    <label>En el evento<select id="fp-asi">${optList(['En agenda','Por confirmar','No figura'],F.asi,'Todas')}</select></label>
    <label>Ordenar<select id="fp-ord"><option value="inf" ${F.ord==='inf'?'selected':''}>Influencia</option><option value="nom" ${F.ord==='nom'?'selected':''}>Nombre</option><option value="org" ${F.ord==='org'?'selected':''}>Organización</option><option value="est" ${F.ord==='est'?'selected':''}>Estado</option></select></label>
    <span class="count" id="fp-n"></span>
  </div><div class="grid" id="fp-grid"></div>`;
  const bind=(id,k)=>{const el=$(id);el.addEventListener(el.tagName==='INPUT'?'input':'change',()=>{F[k]=el.value;drawPers();});};
  bind('#fp-q','q');bind('#fp-inf','inf');bind('#fp-est','est');bind('#fp-dia','dia');bind('#fp-asi','asi');bind('#fp-ord','ord');
  drawPers();
};
D.people.forEach(p=>p._hay=norm([p.nombre,p.org,p.cargo,p.descripcion,p.asociatividad].join(' ')));
function drawPers(){
  const F=FILT.per,q=norm(F.q); const list=D.people.filter(p=>(!q||p._hay.includes(q))&&(!F.inf||p.influencia===F.inf)&&(!F.est||getS('per',p.id).estado===F.est)&&(!F.dia||p.dias.includes(F.dia))&&(!F.asi||p.asist===F.asi)&&(!F.org||String(p.org_id)===String(F.org)));
  const so={inf:(a,b)=>INFV[b.influencia]-INFV[a.influencia]||a.id-b.id,nom:(a,b)=>a.nombre.localeCompare(b.nombre,'es'),org:(a,b)=>a.org_id-b.org_id||a.id-b.id,est:(a,b)=>eIdx(getS('per',a.id).estado)-eIdx(getS('per',b.id).estado)||a.id-b.id};
  list.sort(so[F.ord]||so.inf);
  $('#fp-n').textContent=list.length+' de '+D.people.length;
  $('#fp-grid').innerHTML=list.map(perCard).join('')||'<p class="note">Sin resultados con estos filtros.</p>';
}
function perCard(p){const s=getS('per',p.id);const o=orgById.get(p.org_id);
  return `<article class="card r-${p.influencia==='BAJO'?'B':p.influencia==='MEDIO'?'M':'A'} ${s.estado.startsWith('Cerrado')?'done':''}" data-per="${p.id}" tabindex="0">
    <h4>${esc(p.nombre)}</h4>
    <div class="meta"><span class="chip ${cls('i-',p.influencia)}">Influencia ${esc(p.influencia)}</span>${p.web?'<span class="chip" title="Cargo hallado en la web">web</span>':''}</div>
    <div class="sub"><b>${esc(o.corto)}</b> · ${fmt(p.cargo)}</div>
    <div class="ev">${fmt(p.evento)}</div>
    <div class="row"><span class="ppl">${p.contacto&&!/^\[PC\] No público/.test(p.contacto)?'Con contacto':'Sin contacto público'}</span>${stSelect('per',p.id,s.estado)}</div>
  </article>`;}

/* ===== AGENDA (extraída del texto de participación) [I] ===== */
function parseAgenda(){
  const items=[];
  const add=(who,txt)=>{ let day=null; String(txt||'').split(/\s·\s/).forEach(part=>{
      const dm=part.match(/\b(Lun|Mar)\w* (\d\d)/); if(dm) day=dm[1]+' '+dm[2];
      const tm=part.match(/(\d\d:\d\d)/); if(!tm) return;
      const label=part.replace(/\(?\b(Lun|Mar)\w* \d\d\b/,'').replace(/\d\d:\d\d/,'').replace(/[()]/g,'').replace(/\s+/g,' ').replace(/^[\s:·-]+|[\s:·-]+$/g,'')||'Participación';
      if(day) items.push({day,time:tm[1],label,who}); }); };
  D.orgs.forEach(o=>add({k:'org',id:o.id,n:o.corto},o.evento)); D.people.forEach(p=>add({k:'per',id:p.id,n:p.nombre,o:orgById.get(p.org_id).corto},p.evento));
  const m=new Map(); items.forEach(i=>{const k=i.day+'|'+i.time+'|'+i.label; if(!m.has(k)) m.set(k,{day:i.day,time:i.time,label:i.label,who:[]}); if(!m.get(k).who.some(w=>w.k===i.who.k&&w.id===i.who.id)) m.get(k).who.push(i.who);});
  return [...m.values()].sort((a,b)=>a.day.localeCompare(b.day)||a.time.localeCompare(b.time));
}
RENDER.agenda=function(){
  const ag=parseAgenda(); const days=['Lun 26','Mar 27'];
  $('#v-agenda').innerHTML=`<h2 class="t">Agenda del evento</h2>
  <p class="lead">Construida automáticamente con la columna «Participación en el evento» del Excel ([I] inferencia). Úsala para saber quién está en cada momento y a quién acercarse; contrasta siempre con la agenda oficial v3 (aún hay TBD).</p>
  <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(340px,1fr))">${days.map(d=>`<div><h3 class="s" style="margin-top:0">${d==='Lun 26'?'Lunes 26':'Martes 27'}</h3>
  ${ag.filter(x=>x.day===d).map(x=>`<div class="card" style="cursor:default;min-height:0;margin-bottom:8px"><div><span class="chip s-3">${x.time}</span> <b>${esc(x.label)}</b></div><div class="pill-row">${x.who.map(w=>`<button class="pill" data-${w.k}="${w.id}">${esc(w.n)}${w.o?` <small>· ${esc(w.o)}</small>`:''}</button>`).join('')}</div></div>`).join('')||'<p class="note">Sin entradas con hora.</p>'}</div>`).join('')}</div>
  <h3 class="s">Sin hora definida o por confirmar</h3>
  <div class="pill-row">${D.orgs.filter(o=>!/\d\d:\d\d/.test(o.evento)).map(o=>`<button class="pill" data-org="${o.id}">${esc(o.corto)} <small>· ${esc(o.asist)}</small></button>`).join('')}</div>`;
};

/* ===== FICHAS ===== */
function drawerEl(){return $('#drawer');}
function openDrawer(html){const d=drawerEl();d.innerHTML=html;d.classList.add('open');$('#dbg').classList.add('open');d.setAttribute('aria-hidden','false');d.scrollTop=0;document.body.style.overflow='hidden';
  $('.x',d).addEventListener('click',()=>go('#/'+lastView));}
function closeDrawer(silent){const d=drawerEl();d.classList.remove('open');$('#dbg').classList.remove('open');d.setAttribute('aria-hidden','true');document.body.style.overflow='';}
function trackBox(kind,id){const s=getS(kind,id);
  return `<div class="sec"><h5>Seguimiento</h5><div class="track" data-kind="${kind}" data-id="${id}">
    <div class="states">${ESTADOS.map((e,i)=>`<button class="s-${i} ${e===s.estado?'on':''}" data-set="${esc(e)}">${e}</button>`).join('')}</div>
    <div class="two"><label><small>Próxima acción</small><input type="text" data-f="proxima" value="${esc(s.proxima)}" placeholder="Ej.: pedir fecha de mesa técnica"></label><label><small>Fecha</small><input type="date" data-f="fecha" value="${esc(s.fecha)}"></label></div>
    <label><small>Notas de la conversación</small><textarea data-f="notas" placeholder="Qué se habló, compromisos, datos de contacto…">${esc(s.notas)}</textarea></label>
    <small class="sv">${s.ts?'Guardado '+new Date(s.ts).toLocaleString('es-PE'):'Se guarda solo al escribir o cambiar el estado.'}</small></div></div>`;}
function pillOrg(id){const o=orgById.get(id);return o?`<button class="pill" data-org="${id}">${esc(o.corto)}</button>`:'';}
function pathHtml(targetId){
  if(!GP||!GP.idx.has(targetId)) return '';
  const p=NET.shortest(GP,GP.idx.get(0),GP.idx.get(targetId)); if(!p) return '<p class="note">Sin camino conocido desde FAO en los vínculos registrados: contacto directo o vía ADI.</p>';
  return `<div class="path">${p.map((i,k)=>`${k?'<span class="arr">→</span>':''}${GP.ids[i]===0?'<span class="chip s-2">FAO Perú</span>':pillOrg(GP.ids[i])||`<span class="pill">${esc(nodeById.get(GP.ids[i]).corto)}</span>`}`).join('')}</div><p class="note">${p.length-1===1?'Vínculo directo documentado.':'Pasos de intermediación: '+(p.length-2)+' (presentación a través de la organización intermedia).'}</p>`;
}
function openOrg(id,fromRoute){
  const o=orgById.get(id); if(!NS._init){recalcNet();NS._init=1;}
  const nb=[]; const i=GM.idx.get(id); if(i!=null) GM.adj[i].forEach((w,j)=>nb.push(GM.ids[j]));
  const links=GM.links.filter(l=>l.a===i||l.b===i);
  const ali=D.alianzas.filter(a=>a.org===o.nombre);
  const web=(o.investigacion||[]);
  openDrawer(`<div class="dh"><button class="x" aria-label="Cerrar">×</button><h2>${esc(o.nombre)}</h2>
    <div class="meta"><span class="chip ${cls('r-',o.relevancia)}">Relevancia ${esc(o.relevancia)}</span><span class="chip">${esc(o.tipo)}</span><span class="chip ${o.asist==='En agenda'?'s-3':''}">${esc(o.asist)}</span>${o.dias.map(d=>`<span class="chip s-1">${d}</span>`).join('')}</div></div>
  <div class="db">
    ${trackBox('org',id)}
    <div class="sec"><h5 class="n">Quién es</h5><p>${fmt(o.descripcion)}</p>
      <dl class="kv" style="margin-top:8px"><dt>Año en Perú</dt><dd>${fmt(o.anio)}</dd><dt>Regiones</dt><dd>${fmt(o.regiones)}</dd><dt>Asociatividad</dt><dd>${fmt(o.asociatividad)}</dd><dt>En el evento</dt><dd>${fmt(o.evento)}</dd></dl></div>
    <div class="sec"><h5>Personas clave</h5><div class="pill-row">${o.personas.map(p=>`<button class="pill" data-per="${p.id}">${esc(p.nombre)} <small>· ${esc(p.influencia)}</small></button>`).join('')||'<span class="note">Sin personas registradas.</span>'}</div></div>
    ${o.gancho?`<div class="sec"><h5 class="n">Gancho de conversación y qué pedir</h5><p><b>Gancho:</b> ${fmt(o.gancho)}</p><p><b>Pedir / ofrecer:</b> ${fmt(o.pedir)}</p></div>`:''}
    <div class="sec"><h5>Proyectos e iniciativas (Excel)</h5><ul>${o.proyectos.map(p=>`<li>${fmt(p)}</li>`).join('')}</ul></div>
    <div class="sec"><h5 class="n">Proyectos sociales: búsqueda web (23-oct-2026)</h5>${web.length?web.map(h=>`<div class="web"><b>${esc(h.t)}</b>${esc(h.d)}<div class="src">Fuente: <a href="${esc(h.u)}" target="_blank" rel="noopener">${esc(h.f)}</a>${h.fecha?' · '+esc(h.fecha):''}</div></div>`).join(''):'<div class="flag">No se hallaron datos adicionales verificables en la búsqueda web. Se mantienen los datos del Excel; completar con la propia organización durante el evento.</div>'}
      <p class="note">Los hallazgos web no son [V] del Excel: contrastar cifras y fechas antes de citarlas.</p></div>
    <div class="sec"><h5>Para FAO</h5><dl class="kv"><dt>Intereses</dt><dd>${fmt(o.intereses)}</dd><dt>Cómo alinear</dt><dd>${fmt(o.alineacion)}</dd><dt>Una Vida Mejor</dt><dd>${fmt(o.uvm)}</dd><dt>Oportunidades</dt><dd>${fmt(o.oportunidad)}</dd></dl></div>
    <div class="sec"><h5 class="n">Relaciones en la red</h5>
      <p style="margin-bottom:6px"><b>Camino desde FAO</b></p>${pathHtml(id)}
      <p style="margin:10px 0 6px"><b>Vinculada con (${nb.length})</b></p><div class="pill-row">${nb.map(n=>orgIds.has(n)?pillOrg(n):`<span class="pill">${esc(nodeById.get(n).corto)} <small>· externo</small></span>`).join('')||'<span class="note">Sin vínculos registrados en el Excel: oportunidad de mapeo.</span>'}</div>
      ${links.length?`<ul style="margin-top:8px">${links.map(l=>{const other=GM.ids[l.a===i?l.b:l.a];return `<li><b>${esc(nodeById.get(other).corto)}</b> · ${l.tipos.map(t=>TIPOS[t]).join(', ')}<br><span class="note">${l.detalle.slice(0,2).map(d=>esc(d.txt)).join(' — ')}</span></li>`;}).join('')}</ul>`:''}
      ${ali.length?`<p style="margin:10px 0 4px"><b>Alianzas en el extranjero / aliados (hoja Alianzas)</b></p><ul>${ali.map(a=>`<li><b>${esc(a.aliado)}</b> · ${esc(a.tipo)} · ${esc(a.iniciativas)} <span class="note">(${esc(a.en_evento)})</span></li>`).join('')}</ul>`:''}
      <p style="margin-top:8px"><button class="btn alt" data-netfocus="${id}">Ver en el mapa de red</button></p></div>
    <div class="sec"><h5>Contacto y fuentes</h5><dl class="kv"><dt>Contacto</dt><dd>${fmt(o.contacto)}</dd><dt>Web</dt><dd>${o.web?`<a href="${esc(o.web)}" target="_blank" rel="noopener">${esc(o.web.replace(/^https?:\/\//,'').slice(0,60))}</a>`:'—'}</dd><dt>Fuentes (Excel)</dt><dd>${o.fuentes.map(f=>esc(f)).join('<br>')}${o.fuente_url?`<br><a href="${esc(o.fuente_url)}" target="_blank" rel="noopener">Abrir fuente principal</a>`:''}</dd></dl></div>
  </div>`);
  if(!fromRoute) go('#/org/'+id);
}
function openPer(id,fromRoute){
  const p=perById.get(id), o=orgById.get(p.org_id); if(!NS._init){recalcNet();NS._init=1;}
  const mates=o.personas.filter(x=>x.id!==id);
  openDrawer(`<div class="dh"><button class="x" aria-label="Cerrar">×</button><h2>${esc(p.nombre)}</h2>
    <div class="meta"><span class="chip ${cls('i-',p.influencia)}">Influencia ${esc(p.influencia)}</span><span class="chip ${p.asist==='En agenda'?'s-3':''}">${esc(p.asist)}</span>${p.dias.map(d=>`<span class="chip s-1">${d}</span>`).join('')}</div></div>
  <div class="db">
    ${trackBox('per',id)}
    <div class="sec"><h5 class="n">Quién es</h5><dl class="kv"><dt>Organización</dt><dd><button class="link" data-org="${o.id}">${esc(o.nombre)}</button></dd><dt>Cargo</dt><dd>${fmt(p.cargo)}</dd><dt>Autoridad</dt><dd>${fmt(p.titulo)}</dd><dt>Trayectoria</dt><dd>${fmt(p.carrera)}</dd><dt>Regiones</dt><dd>${fmt(p.regiones)}</dd><dt>Asociatividad</dt><dd>${fmt(p.asociatividad)}</dd></dl>
      <p style="margin-top:8px">${fmt(p.descripcion)}</p></div>
    ${p.web?`<div class="sec"><h5>Dato hallado en la web</h5><div class="web"><b>${esc(p.web.campo)}</b>${esc(p.web.valor)}<div class="src">${esc(p.web.nivel)} · Fuente: <a href="${esc(p.web.url)}" target="_blank" rel="noopener">${esc(p.web.fuente)}</a> · ${esc(p.web.fecha)}</div></div><p class="note">El Excel marcaba este dato como [PC]; no escribir el cargo exacto hasta confirmarlo.</p></div>`:''}
    <div class="sec"><h5>En el evento y cómo alinearse</h5><dl class="kv"><dt>Participación</dt><dd>${fmt(p.evento)}</dd><dt>Cómo alinear</dt><dd>${fmt(p.alineacion)}</dd><dt>Verificación</dt><dd>${fmt(p.verificacion)}</dd></dl></div>
    <div class="sec"><h5 class="n">Camino desde FAO</h5>${pathHtml(o.id)}</div>
    ${mates.length?`<div class="sec"><h5>Otras personas de ${esc(o.corto)}</h5><div class="pill-row">${mates.map(x=>`<button class="pill" data-per="${x.id}">${esc(x.nombre)} <small>· ${esc(x.influencia)}</small></button>`).join('')}</div></div>`:''}
    <div class="sec"><h5>Contacto</h5><dl class="kv"><dt>Celular / correo</dt><dd>${fmt(p.contacto)}</dd><dt>Perfil</dt><dd>${p.linkedin?`<a href="${esc(p.linkedin)}" target="_blank" rel="noopener">Buscar en LinkedIn</a>`:'—'}</dd></dl></div>
  </div>`);
  if(!fromRoute) go('#/per/'+id);
}

/* ===== RED ===== */
const SHORT={deg:'Conexiones (grado)',bet:'Intermediación (broker)',clo:'Cercanía',eig:'Influencia en la red (eigenvector)',clu:'Cohesión local',wdeg:'Fuerza de vínculos'};
RENDER.red=function(){
  if(!NS._init){recalcNet();NS._init=1;}else recalcNet();
  const L=NS.layers;
  $('#v-red').innerHTML=`<h2 class="t">Red de actores</h2>
  <p class="lead">Cada punto es una organización; cada línea, una relación registrada (alianza, proyecto conjunto, gobernanza de ADI, persona puente o sala compartida). Arrastra los puntos, haz zoom, toca un nodo o una línea para ver el detalle. Las métricas se recalculan al activar o desactivar capas.</p>
  <div class="netctl">
    <div class="grp"><span>Capas de relación</span>${['alianza','proyecto','gobernanza','persona','evento'].map(t=>`<label title="${esc(TIPO_DESC[t])}"><input type="checkbox" data-layer="${t}" ${L.has(t)?'checked':''}> ${TIPOS[t]}</label>`).join('')}</div>
    <div class="grp"><span>Mostrar</span><label><input type="checkbox" id="n-fao" ${NS.fao?'checked':''}> FAO Perú</label><label><input type="checkbox" id="n-ext" ${NS.ext?'checked':''}> Aliados externos</label><label><input type="checkbox" id="n-lab" ${NS.labels?'checked':''}> Etiquetas</label></div>
    <div class="grp"><span>Color</span><select id="n-col"><option value="com" ${NS.color==='com'?'selected':''}>Grupo (comunidad)</option><option value="rel" ${NS.color==='rel'?'selected':''}>Relevancia FAO</option><option value="est" ${NS.color==='est'?'selected':''}>Estado de contacto</option></select><span>Tamaño</span><select id="n-size">${['deg','bet','clo','eig','wdeg'].map(m=>`<option value="${m}" ${NS.size===m?'selected':''}>${SHORT[m]}</option>`).join('')}</select></div>
  </div>
  <div class="netwrap"><div class="netbox"><svg id="net" viewBox="0 0 1000 720" role="img" aria-label="Mapa de relaciones entre actores"></svg>
    <div class="zoom"><button id="z-in" aria-label="Acercar">+</button><button id="z-out" aria-label="Alejar">−</button><button id="z-rs" aria-label="Restablecer" style="font-size:12px">⟲</button></div>
    <div class="legend" id="n-leg"></div></div>
    <div class="side" id="n-side"></div></div>
  <h3 class="s">Hallazgos del análisis de redes</h3><div class="insights" id="n-ins"></div>
  <h3 class="s">Rankings (organizaciones de la lista)</h3><div class="rankgrid" id="n-rank"></div>
  <h3 class="s">Cómo leer estas métricas</h3>
  <div class="flag"><b>Conexiones (grado):</b> con cuántas organizaciones está vinculada directamente. <b>Intermediación (broker):</b> proporción de los caminos más cortos entre otras organizaciones que pasan por ella; alta = puente entre grupos. <b>Cercanía:</b> qué tan pocos pasos la separan de todas las demás alcanzables; alta = ve la red rápido. <b>Influencia (eigenvector):</b> está conectada a organizaciones que a su vez están bien conectadas. <b>Cohesión local:</b> qué parte de sus vínculos están vinculados entre sí (triángulos). <b>Grupos:</b> detectados por modularidad (algoritmo voraz Clauset-Newman-Moore). Los vínculos provienen solo de lo registrado en el Excel y la web: una organización sin líneas indica falta de dato, no falta de relaciones.</div>`;
  $$('[data-layer]').forEach(c=>c.addEventListener('change',()=>{c.checked?NS.layers.add(c.dataset.layer):NS.layers.delete(c.dataset.layer);NS.sel=null;NS.selEdge=null;RENDER.red();}));
  $('#n-fao').addEventListener('change',e=>{NS.fao=e.target.checked;RENDER.red();});
  $('#n-ext').addEventListener('change',e=>{NS.ext=e.target.checked;RENDER.red();});
  $('#n-lab').addEventListener('change',e=>{NS.labels=e.target.checked;drawNet();});
  $('#n-col').addEventListener('change',e=>{NS.color=e.target.value;drawNet();});
  $('#n-size').addEventListener('change',e=>{NS.size=e.target.value;drawNet();});
  $('#z-in').addEventListener('click',()=>zoom(0.8));$('#z-out').addEventListener('click',()=>zoom(1.25));$('#z-rs').addEventListener('click',()=>{NS.vb={x:0,y:0,w:1000,h:720};setVB();});
  drawNet(); drawSide(); drawInsights(); drawRank();
};
function nodeColor(n){
  if(n.id===0) return {fill:'#00B0F0',stroke:'#002060'};
  if(n.externo) return {fill:'#FFFFFF',stroke:'#448AC7',dash:true};
  const o=orgById.get(n.id);
  if(NS.color==='rel') return {fill:o.relevancia==='ALTO'?'#1D4F7A':o.relevancia==='MEDIO'?'#448AC7':'#D9D9D9',stroke:'#002060'};
  if(NS.color==='est'){const c=['#EEEEEE','#70BCFF','#00B0F0','#448AC7','#1D4F7A','#D9D9D9'][eIdx(getS('org',n.id).estado)];return {fill:c,stroke:'#002060'};}
  const g=comOf(n.id), sz=CM.groups[g]?CM.groups[g].length:1; return {fill:sz<2?'#EEEEEE':PAL[g%PAL.length],stroke:'#002060'};
}
function nodeR(n){ if(n.id===0) return 15; const v=mv(n.id,NS.size); const mx=Math.max(...MM[NS.size].filter((x,i)=>orgIds.has(GM.ids[i])),1e-9); return 6+ (v/mx)*17; }
function drawNet(){
  const svg=$('#net'); if(!svg) return; const S=[];
  const sel=NS.sel; const neigh=new Set(); if(sel!=null){const i=GV.idx.get(sel); if(i!=null) GV.adj[i].forEach((w,j)=>neigh.add(GV.ids[j]));}
  S.push('<g id="eg">');
  GV.links.forEach((l,k)=>{const a=NS.pos[l.a],b=NS.pos[l.b]; if(!a||!b) return;
    const act=sel!=null&&(l.source===sel||l.target===sel); const dim=sel!=null&&!act; const t=l.tipos[0];
    const dash=l.tipos.length>1?'':({gobernanza:'7 4',evento:'2 4',persona:'8 3 2 3',fao:'',alianza:'',proyecto:''}[t]||'');
    const col=l.tipos.includes('fao')?'#00B0F0':'#1D4F7A';
    S.push(`<line data-a="${l.source}" data-b="${l.target}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${col}" stroke-width="${1.2+l.w*1.1+(l.tipos.includes('fao')?1:0)}" ${dash?`stroke-dasharray="${dash}"`:''} opacity="${dim?0.08:act?1:0.55}"></line><line class="eh" data-e="${k}" data-a="${l.source}" data-b="${l.target}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="transparent" stroke-width="12" style="cursor:pointer"></line>`);});
  S.push('</g><g id="ng">');
  GV.nodes.forEach(n=>{const p=NS.pos[GV.idx.get(n.id)]; if(!p) return; const c=nodeColor(n); const r=nodeR(n); const dim=sel!=null&&sel!==n.id&&!neigh.has(n.id);
    const label=NS.labels?`<text x="0" y="${r+12}" text-anchor="middle" font-size="${n.id===0?13:10.5}" font-weight="${n.id===0||n.id===sel?800:600}" fill="#002060" paint-order="stroke" stroke="#fff" stroke-width="3">${esc(n.corto)}</text>`:'';
    const shape=n.id===0?`<rect x="${-r}" y="${-r}" width="${2*r}" height="${2*r}" fill="${c.fill}" stroke="${c.stroke}" stroke-width="2.5"></rect>`:`<circle r="${r}" fill="${c.fill}" stroke="${c.stroke}" stroke-width="${n.id===sel?4:1.6}" ${c.dash?'stroke-dasharray="3 3"':''}></circle>`;
    S.push(`<g class="nd" data-n="${n.id}" transform="translate(${p.x},${p.y})" opacity="${dim?0.18:1}" style="cursor:pointer"><title>${esc(n.nombre)}</title>${shape}${label}</g>`);});
  S.push('</g>');
  svg.innerHTML=S.join(''); setVB();
  // Leyenda
  let leg=''; if(NS.color==='com'){leg=CM.groups.filter(g=>g.length>=2).slice(0,5).map((g,i)=>`<span style="margin-right:8px"><i style="background:${PAL[i%PAL.length]}"></i>Grupo ${i+1} (${g.length})</span>`).join('')+'<span><i style="background:#EEEEEE;border:1px solid #D9D9D9"></i>Sin vínculos</span>';}
  else if(NS.color==='rel') leg='<span style="margin-right:8px"><i style="background:#1D4F7A"></i>Alta</span><span style="margin-right:8px"><i style="background:#448AC7"></i>Media</span><span><i style="background:#D9D9D9"></i>Baja</span>';
  else leg=ESTADOS.map((e,i)=>`<span style="margin-right:8px"><i style="background:${['#EEEEEE','#70BCFF','#00B0F0','#448AC7','#1D4F7A','#D9D9D9'][i]};border:1px solid #D9D9D9"></i>${e}</span>`).join('');
  leg+='<br>'+['alianza','gobernanza','persona','evento'].filter(t=>NS.layers.has(t)).map(t=>`<span style="margin-right:8px"><span class="ln" style="border-top-style:${{alianza:'solid',gobernanza:'dashed',persona:'dashed',evento:'dotted'}[t]}"></span>${TIPOS[t]}</span>`).join('')+' <span style="margin-right:8px"><i style="background:#fff;border:2px dashed #448AC7;border-radius:50%"></i>Externo</span>';
  $('#n-leg').innerHTML=leg; bindNet();
}
function setVB(){const v=NS.vb;$('#net').setAttribute('viewBox',`${v.x} ${v.y} ${v.w} ${v.h}`);}
function zoom(f,cx,cy){const v=NS.vb; const mx=cx==null?v.x+v.w/2:cx,my=cy==null?v.y+v.h/2:cy; const nw=Math.max(200,Math.min(2000,v.w*f)),nh=nw*0.72; NS.vb={x:mx-(mx-v.x)*nw/v.w,y:my-(my-v.y)*nh/v.h,w:nw,h:nh};setVB();}
function bindNet(){
  const svg=$('#net'); const pt=(e)=>{const r=svg.getBoundingClientRect(),v=NS.vb;return {x:v.x+(e.clientX-r.left)/r.width*v.w,y:v.y+(e.clientY-r.top)/r.height*v.h};};
  let drag=null,moved=false;
  $$('.nd',svg).forEach(g=>{g.addEventListener('pointerdown',e=>{e.stopPropagation();drag={id:+g.dataset.n,el:g};moved=false;g.setPointerCapture(e.pointerId);});
    g.addEventListener('pointermove',e=>{if(!drag||drag.el!==g)return;moved=true;const p=pt(e);const i=GV.idx.get(drag.id);NS.pos[i]={x:p.x,y:p.y};g.setAttribute('transform',`translate(${p.x},${p.y})`);
      $$('#eg line',svg).forEach(ln=>{if(+ln.dataset.a===drag.id){ln.setAttribute('x1',p.x);ln.setAttribute('y1',p.y);}if(+ln.dataset.b===drag.id){ln.setAttribute('x2',p.x);ln.setAttribute('y2',p.y);}});});
    g.addEventListener('pointerup',e=>{if(!drag)return;const id=drag.id;const wasMoved=moved;drag=null;if(wasMoved){drawNet();}else{NS.sel=(NS.sel===id)?null:id;NS.selEdge=null;drawNet();drawSide();}});});
  $$('.eh',svg).forEach(l=>l.addEventListener('click',e=>{e.stopPropagation();NS.selEdge=+l.dataset.e;NS.sel=null;drawNet();drawSide();}));
  let pan=null; svg.addEventListener('pointerdown',e=>{if(e.target.closest('.nd'))return;pan={x:e.clientX,y:e.clientY,vb:Object.assign({},NS.vb),m:false};svg.classList.add('drag');svg.setPointerCapture(e.pointerId);});
  svg.addEventListener('pointermove',e=>{if(!pan)return;const r=svg.getBoundingClientRect();const dx=(e.clientX-pan.x)/r.width*pan.vb.w,dy=(e.clientY-pan.y)/r.height*pan.vb.h;if(Math.abs(dx)+Math.abs(dy)>2)pan.m=true;NS.vb={x:pan.vb.x-dx,y:pan.vb.y-dy,w:pan.vb.w,h:pan.vb.h};setVB();});
  svg.addEventListener('pointerup',()=>{if(pan){const was=pan.m;pan=null;svg.classList.remove('drag');if(!was&&(NS.sel!=null||NS.selEdge!=null)){NS.sel=null;NS.selEdge=null;drawNet();drawSide();}}});
  svg.onwheel=e=>{e.preventDefault();const p=pt(e);zoom(e.deltaY>0?1.12:0.89,p.x,p.y);};
}
function drawSide(){
  const el=$('#n-side'); if(!el) return;
  if(NS.selEdge!=null){const l=GV.links[NS.selEdge];const a=nodeById.get(l.source),b=nodeById.get(l.target);
    el.innerHTML=`<h4>Relación</h4><p><b>${esc(a.corto)}</b> ↔ <b>${esc(b.corto)}</b></p><p style="margin:6px 0">${l.tipos.map(t=>`<span class="chip s-3">${TIPOS[t]}</span>`).join(' ')}</p><ul style="margin-left:18px;font-size:12.5px">${l.detalle.map(d=>`<li><span class="tag">${TIPOS[d.tipo]}</span><br>${esc(d.txt)}</li>`).join('')}</ul><p style="margin-top:8px" class="pill-row">${orgIds.has(l.source)?pillOrg(l.source):''}${orgIds.has(l.target)?pillOrg(l.target):''}</p>`;return;}
  if(NS.sel==null){el.innerHTML=`<h4>Detalle</h4><p class="empty">Toca una organización o una línea del mapa para ver sus conexiones, su posición en la red y el camino desde FAO.</p><p class="empty" style="margin-top:8px">Las organizaciones debajo del mapa («Sin vínculos») no tienen relaciones registradas en el Excel.</p>`;return;}
  const id=NS.sel; const n=nodeById.get(id);
  if(id===0){el.innerHTML=`<h4>FAO Perú</h4><p>Nodo de referencia: se une a las organizaciones con vínculo documentado en el Excel.</p><div class="pill-row" style="margin-top:8px">${D.fao_edges.map(e=>pillOrg(e.target)).join('')}</div>`;return;}
  const i=GM.idx.get(id), nb=[]; if(i!=null) GM.adj[i].forEach((w,j)=>nb.push(GM.ids[j]));
  if(!orgIds.has(id)){el.innerHTML=`<h4>${esc(n.nombre)}</h4><p class="note">Aliado externo (no está en la lista de asistentes).</p><p style="margin:6px 0">Vinculado con:</p><div class="pill-row">${nb.map(pillOrg).join('')}</div>`;return;}
  const o=orgById.get(id); const rk=m=>1+MM[m].filter((v,k)=>orgIds.has(GM.ids[k])&&v>MM[m][i]+1e-12).length;
  const pc=pathHtml(id);
  el.innerHTML=`<h4>${esc(o.nombre)}</h4><p><span class="chip ${cls('r-',o.relevancia)}">Relevancia ${esc(o.relevancia)}</span> <span class="chip s-${eIdx(getS('org',id).estado)}">${esc(getS('org',id).estado)}</span></p>
  <dl class="kv" style="margin:8px 0;grid-template-columns:120px 1fr"><dt>Conexiones</dt><dd>${MM.deg[i]} <small class="note">(puesto ${rk('deg')})</small></dd><dt>Broker</dt><dd>${(MM.bet[i]*100).toFixed(1)}% <small class="note">(puesto ${rk('bet')})</small></dd><dt>Cercanía</dt><dd>${MM.clo[i].toFixed(2)} <small class="note">(puesto ${rk('clo')})</small></dd><dt>Influencia</dt><dd>${MM.eig[i].toFixed(2)} <small class="note">(puesto ${rk('eig')})</small></dd><dt>Cohesión</dt><dd>${MM.clu[i].toFixed(2)}</dd><dt>Grupo</dt><dd>${CM.groups[CM.label[i]].length>1?'Grupo '+(CM.label[i]+1)+' ('+CM.groups[CM.label[i]].length+')':'Sin vínculos'}</dd></dl>
  <p><b>Vinculada con</b></p><div class="pill-row" style="margin:4px 0 10px">${nb.map(x=>orgIds.has(x)?pillOrg(x):`<span class="pill">${esc(nodeById.get(x).corto)}</span>`).join('')||'<span class="note">Sin vínculos con las capas activas.</span>'}</div>
  ${pc?`<p><b>Camino desde FAO</b></p>${pc}`:''}
  <p style="margin-top:10px"><button class="btn" data-org="${id}">Abrir ficha</button></p>`;
}
function topN(m,n,filter){const arr=[];GM.ids.forEach((id,i)=>{if(!orgIds.has(id))return;if(filter&&!filter(id,i))return;arr.push({id,i,v:MM[m][i]});});arr.sort((a,b)=>b.v-a.v||a.id-b.id);return arr.slice(0,n);}
function drawRank(){
  const box=$('#n-rank'); if(!box) return;
  const rows=(m,f,pct)=>{const t=topN(m,8,(id,i)=>MM[m][i]>0);const mx=t.length?t[0].v:1;return `<table class="tbl"><tbody>${t.map((r,k)=>`<tr><td style="width:24px">${k+1}</td><td><button class="link" data-org="${r.id}">${esc(orgById.get(r.id).corto)}</button></td><td class="num">${f(r.v)}<span class="bar" style="width:${Math.round(60*r.v/mx)}px"></span></td></tr>`).join('')||'<tr><td>—</td></tr>'}</tbody></table>`;};
  const alianzas=GM.ids.map((id,i)=>({id,i,v:[...GM.adj[i].keys()].filter(j=>{const l=GM.links.find(x=>(x.a===i&&x.b===j)||(x.a===j&&x.b===i));return l&&l.tipos.includes('alianza');}).length}));
  const t2=alianzas.filter(a=>orgIds.has(a.id)&&a.v>0).sort((a,b)=>b.v-a.v||a.id-b.id).slice(0,8);const mx2=t2.length?t2[0].v:1;
  box.innerHTML=[['Más conexiones (grado)',rows('deg',v=>v)],['Más céntricos (cercanía)',rows('clo',v=>v.toFixed(2))],['Más influyentes (eigenvector)',rows('eig',v=>v.toFixed(2))],['Brokers (intermediación)',rows('bet',v=>(v*100).toFixed(1)+'%')],['Más interconectados (cohesión local)',(()=>{const t=topN('clu',8,(id,i)=>MM.deg[i]>=2&&MM.clu[i]>0);return `<table class="tbl"><tbody>${t.map((r,k)=>`<tr><td style="width:24px">${k+1}</td><td><button class="link" data-org="${r.id}">${esc(orgById.get(r.id).corto)}</button></td><td class="num">${r.v.toFixed(2)} <small class="note">(${MM.deg[r.i]} vínc.)</small></td></tr>`).join('')||'<tr><td>—</td></tr>'}</tbody></table>`;})()],['Con más alianzas registradas',`<table class="tbl"><tbody>${t2.map((r,k)=>`<tr><td style="width:24px">${k+1}</td><td><button class="link" data-org="${r.id}">${esc(orgById.get(r.id).corto)}</button></td><td class="num">${r.v}<span class="bar" style="width:${Math.round(60*r.v/mx2)}px"></span></td></tr>`).join('')||'<tr><td>—</td></tr>'}</tbody></table>`]]
    .map(([t,h])=>`<div class="ins"><h4>${t}</h4>${h}</div>`).join('');
}
function nm(id){const o=orgById.get(id);return o?o.corto:nodeById.get(id).corto;}
function drawInsights(){
  const box=$('#n-ins'); if(!box) return;
  const E=GM.links.length, I=[];
  const t1=topN('deg',3), b=topN('bet',5,(id,i)=>MM.bet[i]>0), c=topN('clo',3), ev=topN('eig',3);
  const hub=t1[0]; const share=hub?Math.round(100*MM.deg[hub.i]/Math.max(E,1)):0;
  const comp=NET.components(GM); const big=Math.max(...comp.sizes); const iso=GM.ids.filter((id,i)=>orgIds.has(id)&&MM.deg[i]===0);
  // Hub
  if(hub) I.push(`<div class="ins"><h4>Nodo más concentrado</h4><div class="big">${esc(nm(hub.id))} concentra ${MM.deg[hub.i]} de ${E} vínculos (${share}% de la red) y por ella pasa el ${(MM.bet[hub.i]*100).toFixed(0)}% de los caminos más cortos entre otras organizaciones.</div><ol>${t1.map(r=>`<li><b>${esc(nm(r.id))}</b>: ${MM.deg[r.i]} conexiones</li>`).join('')}</ol></div>`);
  // Céntricos
  I.push(`<div class="ins"><h4>Más céntricos</h4><div class="big">${c.length?esc(nm(c[0].id))+' es la organización desde la que se llega más rápido al resto':'—'}${ev[0]&&ev[0].id!==(c[0]||{}).id?`; ${esc(nm(ev[0].id))} destaca por estar conectada a nodos bien conectados`:''}.</div><ol>${c.map(r=>`<li><b>${esc(nm(r.id))}</b>: cercanía ${r.v.toFixed(2)}</li>`).join('')}</ol><p class="note" style="margin-top:6px">Influencia (eigenvector): ${ev.map(r=>esc(nm(r.id))+' '+r.v.toFixed(2)).join(' · ')}</p></div>`);
  // Interconectados
  const grp=CM.groups.map((g,gi)=>({g,gi})).filter(x=>x.g.length>=3).map(x=>{const set=new Set(x.g);let inE=0;GM.links.forEach(l=>{if(set.has(l.a)&&set.has(l.b))inE++;});const pos=x.g.length*(x.g.length-1)/2;const hubi=x.g.slice().sort((a,b)=>MM.deg[b]-MM.deg[a])[0];return {gi:x.gi,n:x.g.length,dens:inE/pos,inE,hub:hubi,g:x.g};}).sort((a,b)=>b.dens*Math.log(b.n+1)-a.dens*Math.log(a.n+1));
  const gr=grp.slice(0,4);
  I.push(`<div class="ins"><h4>Grupos más interconectados</h4><div class="big">${gr.length?`El grupo en torno a ${esc(nm(GM.ids[gr[0].hub]))} (${gr[0].n} organizaciones) tiene densidad ${(gr[0].dens*100).toFixed(0)}%.`:'No hay grupos de 3+ con las capas activas.'}</div><ol>${gr.map(x=>`<li><b>${esc(nm(GM.ids[x.hub]))}</b> y ${x.n-1} más · densidad ${(x.dens*100).toFixed(0)}%<br><span class="note">${x.g.slice(0,6).map(j=>esc(nm(GM.ids[j]))).join(', ')}${x.n>6?'…':''}</span></li>`).join('')}</ol><p class="note" style="margin-top:6px">${CM.groups.filter(g=>g.length>=2).length} grupos detectados (modularidad ${CM.Q.toFixed(2)}).</p></div>`);
  // Brokers
  const brokers=b.map(r=>{const gs=new Set();GM.adj[r.i].forEach((w,j)=>gs.add(CM.label[j]));gs.add(CM.label[r.i]);return {...r,ng:gs.size};});
  I.push(`<div class="ins"><h4>Brokers (puentes entre grupos)</h4><div class="big">${brokers[0]?`${esc(nm(brokers[0].id))} es el principal puente; ${brokers.slice(1,3).map(r=>esc(nm(r.id))).join(' y ')||'—'} le siguen.`:'Sin brokers con las capas activas.'}</div><ol>${brokers.map(r=>`<li><b>${esc(nm(r.id))}</b>: ${(r.v*100).toFixed(1)}% · conecta ${r.ng} grupo${r.ng===1?'':'s'}</li>`).join('')}</ol><p class="note" style="margin-top:6px">Un broker alto es quien puede presentar a dos mundos que de otro modo no se tocan.</p></div>`);
  // Puntos de falla
  const cps=CPM.filter(c=>orgIds.has(GM.ids[c.v])).slice(0,5);
  I.push(`<div class="ins"><h4>Puntos únicos de articulación</h4><div class="big">${cps.length?`Si ${esc(nm(GM.ids[cps[0].v]))} no participa, ${cps[0].aislados} organizaciones quedan desconectadas del resto de la red.`:'No hay nodos cuya ausencia fragmente la red.'}</div><ol>${cps.map(c=>`<li><b>${esc(nm(GM.ids[c.v]))}</b>: aísla ${c.aislados}</li>`).join('')}</ol><p class="note" style="margin-top:6px">Priorizar la relación con estos nodos asegura el acceso a esas organizaciones.</p></div>`);
  // Aislados
  I.push(`<div class="ins"><h4>Sin vínculos registrados</h4><div class="big">${iso.length} de ${D.orgs.length} organizaciones no tienen ninguna relación en el Excel; la red conectada abarca ${big} nodos.</div><div class="pill-row">${iso.map(id=>pillOrg(id)).join('')}</div><p class="note" style="margin-top:6px">Es un vacío de datos, no necesariamente de relaciones: son los mejores candidatos para preguntar «¿con quién trabajan aquí?» en el evento.</p></div>`);
  // Para FAO
  {const f=GP.idx.get(0);const fn=[...GP.adj[f].keys()].map(j=>GP.ids[j]);
    const reach=fn.map(id=>{const i=GM.idx.get(id);const extra=i==null?0:[...GM.adj[i].keys()].filter(j=>!fn.includes(GM.ids[j])&&orgIds.has(GM.ids[j])).length;return {id,extra};}).sort((a,b)=>b.extra-a.extra);
    const two=GP.ids.filter((id,i)=>{if(!orgIds.has(id)||fn.includes(id))return false;const q=NET.shortest(GP,f,i);return q&&q.length===3;}).length;
    I.push(`<div class="ins"><h4>Para FAO Perú</h4><div class="big">FAO tiene ${fn.length} vínculos directos documentados; ${reach[0]?esc(nm(reach[0].id))+' abre '+reach[0].extra+' organizaciones adicionales':''}. ${two} organizaciones están a un solo intermediario.</div><ol>${reach.slice(0,4).map(r=>`<li><b>${esc(nm(r.id))}</b>: +${r.extra} organizaciones a un paso</li>`).join('')}</ol><p class="note" style="margin-top:6px">En la ficha de cada organización verás el camino sugerido desde FAO.</p></div>`);}
  box.innerHTML=I.join('');
}

/* ===== ALIANZAS ===== */
RENDER.alianzas=function(){
  const links=GM?GM.links:null; if(!NS._init){recalcNet();NS._init=1;}
  const all=new Set(['alianza','gobernanza','proyecto','evento','persona']); const G=NET.build(D.nodes,D.edges,all);
  $('#v-alianzas').innerHTML=`<h2 class="t">Alianzas y relaciones</h2>
  <p class="lead">Primero la hoja «Alianzas» del Excel (vínculos en el extranjero); después todas las relaciones detectadas entre organizaciones, con su tipo y la evidencia.</p>
  <h3 class="s" style="margin-top:0">Alianzas registradas (${D.alianzas.length})</h3>
  <div class="scroll"><table class="tbl"><thead><tr><th>Organización</th><th>Aliado / vínculo</th><th>Tipo y país</th><th>Iniciativas</th><th>¿En el evento?</th><th>Fuente</th></tr></thead><tbody>${D.alianzas.map(a=>{const o=D.orgs.find(x=>x.nombre===a.org);return `<tr><td><button class="link" data-org="${o.id}">${esc(o.corto)}</button></td><td>${esc(a.aliado)}</td><td>${esc(a.tipo)}</td><td>${fmt(a.iniciativas)}</td><td>${esc(a.en_evento)}</td><td>${a.fuente_url?`<a href="${esc(a.fuente_url)}" target="_blank" rel="noopener">${esc(a.fuente)}</a>`:esc(a.fuente)}</td></tr>`;}).join('')}</tbody></table></div>
  <h3 class="s">Todas las relaciones entre organizaciones (${G.links.length})</h3>
  <div class="filters"><label>Tipo<select id="al-t"><option value="">Todos</option>${Object.keys(TIPOS).filter(t=>t!=='fao').map(t=>`<option value="${t}">${TIPOS[t]}</option>`).join('')}</select></label><input type="search" id="al-q" placeholder="Filtrar por organización…"><span class="count" id="al-n"></span></div>
  <div class="scroll"><table class="tbl"><thead><tr><th>Organización A</th><th>Organización B</th><th>Tipo</th><th>Evidencia</th></tr></thead><tbody id="al-b"></tbody></table></div>`;
  const draw=()=>{const t=$('#al-t').value,q=norm($('#al-q').value);const rows=G.links.filter(l=>(!t||l.tipos.includes(t))&&(!q||norm(nm(l.source)+' '+nm(l.target)).includes(q)));
    $('#al-n').textContent=rows.length+' relaciones';
    $('#al-b').innerHTML=rows.map(l=>{const a=l.source,b=l.target;const lk=id=>orgIds.has(id)?`<button class="link" data-org="${id}">${esc(nm(id))}</button>`:esc(nm(id))+' <span class="chip">externo</span>';
      return `<tr><td>${lk(a)}</td><td>${lk(b)}</td><td>${l.tipos.map(x=>`<span class="chip s-3">${TIPOS[x]}</span>`).join(' ')}</td><td>${l.detalle.slice(0,3).map(d=>esc(d.txt)).join('<br>')}</td></tr>`;}).join('');};
  $('#al-t').addEventListener('change',draw);$('#al-q').addEventListener('input',draw);draw();
};

/* ===== LEYENDA ===== */
RENDER.leyenda=function(){
  $('#v-leyenda').innerHTML=`<h2 class="t">Leyenda, supuestos y trazabilidad</h2>
  <h3 class="s" style="margin-top:0">Etiquetas de calidad del dato</h3>
  <dl class="kv" style="max-width:820px"><dt><span class="chip">V</span></dt><dd>Verificado en una fuente citada (web ADI, agenda v3, brief FAO, web oficial).</dd><dt><span class="chip">I</span></dt><dd>Inferencia propia (intereses, influencia estimada, alineamiento con FAO y «Una Vida Mejor»).</dd><dt><span class="chip pc">PC</span></dt><dd>Por confirmar: no se halló dato público. No usar como dato firme.</dd><dt>web</dt><dd>Dato añadido en esta app a partir de una búsqueda web del 23-oct-2026, con fuente enlazada. No tiene la categoría [V] del Excel.</dd></dl>
  <h3 class="s">Alertas nuevas de la búsqueda web</h3>${D.alertas_web.map(r=>`<div class="flag">⚠ ${fmt(r)}</div>`).join('')}
  <h3 class="s">Alertas del Excel</h3>${D.alertas_excel.map(r=>`<div class="flag">⚠ ${fmt(r)}</div>`).join('')}
  <h3 class="s">Cómo se construyó la red (supuestos)</h3>
  <ul style="margin-left:20px;max-width:900px">
  <li><b>Alianza:</b> filas de la hoja «Alianzas»; si el aliado es otra organización de la lista se une directamente, si no, aparece como nodo externo.</li>
  <li><b>Gobernanza ADI:</b> personas con rol en el Directorio/Executive Board/Advisory Board de ADI unen su organización con ADI; también socios fundadores y promotores.</li>
  <li><b>Proyecto conjunto:</b> una organización nombra a otra en sus proyectos o descripción (búsqueda por nombre; revisada a mano; se retiraron dos vínculos demasiado indirectos).</li>
  <li><b>Sala compartida:</b> mismas «Room N» en la columna de participación. Vínculo débil, desactivado por defecto.</li>
  <li><b>Persona puente:</b> una misma persona figura como contacto de dos organizaciones.</li>
  <li><b>FAO Perú:</b> vínculos documentados en las columnas «Cómo FAO puede alinearse» y «Descripción» del Excel (ADI, COFIDE, Wyss, GSG, IICA, Es Hoy). No entra en el cálculo de rankings.</li>
  <li>El peso de cada vínculo es el número de tipos distintos entre el par. Las métricas (grado, intermediación, cercanía, eigenvector, cohesión, grupos y puntos de articulación) se calculan en el navegador y se validaron contra NetworkX.</li>
  <li>La agenda y los campos «En agenda / Por confirmar / No figura» se derivan por reglas de texto de la columna de participación [I].</li></ul>
  <h3 class="s">Cómo usar</h3>
  <p>Toca una tarjeta para abrir su ficha. Cambia el estado de seguimiento con el menú de color o con los botones de la ficha; añade próxima acción, fecha y notas. Todo se guarda en este navegador; usa «Exportar respaldo» (al pie) para llevarlo a otro dispositivo o hacer copia. Colores: paleta FAO 448AC7, 5B92C8, 70BCFF, 1D4F7A, 002060, 00B0F0, EEEEEE.</p>`;
};

/* ---------- búsqueda global ---------- */
function bindSearch(){
  const inp=$('#gs'),res=$('#gr'); let cur=-1,items=[];
  const run=()=>{const q=norm(inp.value.trim()); if(q.length<2){res.classList.remove('open');return;}
    const sc=(txt)=>{const t=norm(txt);return t===q?0:t.startsWith(q)?1:t.includes(q)?2:9;};
    const A=[];D.orgs.forEach(o=>{const s=Math.min(sc(o.nombre),sc(o.corto),o._hay.includes(q)?5:9);if(s<9)A.push({k:'org',id:o.id,s,t:o.nombre,sub:o.tipo});});
    D.people.forEach(p=>{const s=Math.min(sc(p.nombre),p._hay.includes(q)?4:9);if(s<9)A.push({k:'per',id:p.id,s,t:p.nombre,sub:orgById.get(p.org_id).corto+' · '+p.cargo});});
    A.sort((a,b)=>a.s-b.s||(a.k==='org'?-1:1)); items=A.slice(0,14); cur=-1;
    res.innerHTML=items.length?items.map((r,i)=>`<button data-i="${i}"><span class="k ${r.k==='per'?'p':''}">${r.k==='org'?'Org':'Persona'}</span><span>${esc(r.t)}<small>${esc(r.sub)}</small></span></button>`).join(''):'<div class="none">Sin resultados</div>';
    res.classList.add('open');};
  const pick=i=>{const r=items[i];if(!r)return;res.classList.remove('open');inp.value='';inp.blur();r.k==='org'?openOrg(r.id):openPer(r.id);};
  inp.addEventListener('input',run);inp.addEventListener('focus',run);
  inp.addEventListener('keydown',e=>{const bs=$$('button',res);if(e.key==='ArrowDown'){cur=Math.min(bs.length-1,cur+1);}else if(e.key==='ArrowUp'){cur=Math.max(0,cur-1);}else if(e.key==='Enter'){pick(Math.max(0,cur));return;}else if(e.key==='Escape'){res.classList.remove('open');return;}else return;e.preventDefault();bs.forEach((b,i)=>b.classList.toggle('act',i===cur));if(bs[cur])bs[cur].scrollIntoView({block:'nearest'});});
  res.addEventListener('click',e=>{const b=e.target.closest('button');if(b)pick(+b.dataset.i);});
  document.addEventListener('click',e=>{if(!e.target.closest('.gsearch'))res.classList.remove('open');});
}

/* ---------- delegación de eventos ---------- */
document.addEventListener('click',e=>{
  const t=e.target;
  const sel=t.closest('select[data-st]'); if(sel) return; // el menú gestiona su propio cambio
  const so=t.closest('[data-set]'); if(so){const tb=so.closest('.track');setS(tb.dataset.kind,+tb.dataset.id,{estado:so.dataset.set});$$('.states button',tb).forEach(b=>b.classList.toggle('on',b===so));$('.sv',tb).textContent='Guardado '+new Date().toLocaleString('es-PE');refreshLists();toast('Estado: '+so.dataset.set);return;}
  const nf=t.closest('[data-netfocus]'); if(nf){NS.sel=+nf.dataset.netfocus;NS.selEdge=null;go('#/red');return;}
  const go_=t.closest('[data-go]'); if(go_){go('#/'+go_.dataset.go);return;}
  const ob=t.closest('[data-org]'); if(ob&&!t.closest('select')){openOrg(+ob.dataset.org);return;}
  const pb=t.closest('[data-per]'); if(pb&&!t.closest('select')){openPer(+pb.dataset.per);return;}
});
document.addEventListener('change',e=>{const s=e.target.closest('select[data-st]');if(!s)return;const [k,id]=s.dataset.st.split(':');setS(k,+id,{estado:s.value});s.className='sel s-'+eIdx(s.value);toast('Estado: '+s.value);
  const card=s.closest('.card'); if(card) card.classList.toggle('done',s.value.startsWith('Cerrado'));});
document.addEventListener('input',e=>{const f=e.target.closest('.track [data-f]');if(!f)return;const tb=f.closest('.track');setS(tb.dataset.kind,+tb.dataset.id,{[f.dataset.f]:f.value});$('.sv',tb).textContent='Guardado '+new Date().toLocaleString('es-PE');});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&drawerEl().classList.contains('open'))go('#/'+lastView);
  if((e.key==='Enter'||e.key===' ')&&e.target.matches('.card[data-org],.card[data-per]')){e.preventDefault();e.target.click();}});
$('#dbg').addEventListener('click',()=>go('#/'+lastView));
function refreshLists(){ if(lastView==='organizaciones'&&$('#fo-grid')) drawOrgs(); if(lastView==='personas'&&$('#fp-grid')) drawPers(); if(lastView==='resumen') RENDER.resumen(); }

/* ---------- respaldo ---------- */
function dl(name,txt,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([txt],{type}));a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},500);}
$('#b-exp').addEventListener('click',()=>{dl('cpii2026_seguimiento_'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify(ST,null,1),'application/json');toast('Respaldo exportado');});
$('#b-csv').addEventListener('click',()=>{
  const q=v=>'"'+String(v==null?'':v).replace(/"/g,'""')+'"'; const rows=[['Tipo','Nombre','Organización','Estado','Próxima acción','Fecha','Notas','Actualizado']];
  D.orgs.forEach(o=>{const s=getS('org',o.id);rows.push(['Organización',o.nombre,o.nombre,s.estado,s.proxima,s.fecha,s.notas,s.ts]);});
  D.people.forEach(p=>{const s=getS('per',p.id);rows.push(['Persona',p.nombre,orgById.get(p.org_id).nombre,s.estado,s.proxima,s.fecha,s.notas,s.ts]);});
  dl('cpii2026_seguimiento.csv','\ufeff'+rows.map(r=>r.map(q).join(',')).join('\n'),'text/csv;charset=utf-8');toast('CSV exportado');});
$('#b-imp').addEventListener('click',()=>$('#f-imp').click());
$('#f-imp').addEventListener('change',e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{try{const j=JSON.parse(r.result);if(!j||typeof j!=='object'||!j.org||!j.per)throw 0;
  if(!confirm('Esto reemplaza el seguimiento guardado en este navegador. ¿Continuar?'))return;ST={org:j.org,per:j.per};save();toast('Respaldo importado');route();}catch(_){toast('Archivo no válido');}};r.readAsText(f);e.target.value='';});

/* ---------- arranque ---------- */
window.addEventListener('hashchange',route);
bindSearch(); recalcNet(); NS._init=1; route();
})();
