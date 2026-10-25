/* Análisis de redes sin dependencias. Grafo no dirigido; peso de arista = nº de tipos de vínculo distintos entre el par. */
(function(){
'use strict';
const NET={};

/* Construye el grafo a partir de nodos, aristas y capas activas */
NET.build=function(nodes,edges,layers){
  const ids=nodes.map(n=>n.id), idx=new Map(ids.map((id,i)=>[id,i]));
  const adj=ids.map(()=>new Map()); const types=new Map();
  edges.forEach(e=>{
    if(!layers.has(e.tipo)) return;
    if(!idx.has(e.source)||!idx.has(e.target)||e.source===e.target) return;
    const a=idx.get(e.source), b=idx.get(e.target), k=a<b?a+'-'+b:b+'-'+a;
    if(!types.has(k)) types.set(k,{a,b,tipos:new Set(),detalle:[]});
    const t=types.get(k); t.tipos.add(e.tipo); (e.detalle||[]).forEach(d=>t.detalle.push({tipo:e.tipo,txt:d}));
  });
  const links=[];
  types.forEach(t=>{const w=t.tipos.size; adj[t.a].set(t.b,w); adj[t.b].set(t.a,w); links.push({a:t.a,b:t.b,w,tipos:[...t.tipos],detalle:t.detalle,source:ids[t.a],target:ids[t.b]});});
  return {n:ids.length,ids,idx,adj,links,nodes};
};

function bfs(G,s){
  const dist=new Array(G.n).fill(-1), sigma=new Array(G.n).fill(0), pred=G.ids.map(()=>[]), order=[];
  dist[s]=0; sigma[s]=1; const q=[s];
  while(q.length){const v=q.shift(); order.push(v);
    G.adj[v].forEach((w,u)=>{ if(dist[u]<0){dist[u]=dist[v]+1;q.push(u);} if(dist[u]===dist[v]+1){sigma[u]+=sigma[v];pred[u].push(v);} });}
  return {dist,sigma,pred,order};
}
NET.components=function(G,skip){
  const comp=new Array(G.n).fill(-1); let c=0; const sizes=[];
  for(let i=0;i<G.n;i++){ if(comp[i]>=0||i===skip) continue; let s=0; const st=[i]; comp[i]=c;
    while(st.length){const v=st.pop(); s++; G.adj[v].forEach((w,u)=>{ if(u!==skip&&comp[u]<0){comp[u]=c;st.push(u);} });}
    sizes.push(s); c++; }
  return {comp,sizes,count:c};
};

/* Métricas de centralidad (normalizadas como NetworkX) */
NET.metrics=function(G){
  const n=G.n, M={deg:[],wdeg:[],bet:new Array(n).fill(0),clo:[],eig:[],clu:[]};
  for(let i=0;i<n;i++){ M.deg[i]=G.adj[i].size; let w=0; G.adj[i].forEach(x=>w+=x); M.wdeg[i]=w; }
  // betweenness (Brandes) + closeness (Wasserman-Faust)
  for(let s=0;s<n;s++){
    const {dist,sigma,pred,order}=bfs(G,s); const delta=new Array(n).fill(0);
    for(let k=order.length-1;k>=0;k--){const w=order[k]; pred[w].forEach(v=>{delta[v]+=sigma[v]/sigma[w]*(1+delta[w]);}); if(w!==s) M.bet[w]+=delta[w];}
    let tot=0,reach=0; for(let i=0;i<n;i++) if(dist[i]>0){tot+=dist[i];reach++;}
    M.clo[s]= (tot>0&&n>1)? (reach/tot)*(reach/(n-1)) : 0;
  }
  const bn=(n>2)?1/((n-1)*(n-2)):0; for(let i=0;i<n;i++) M.bet[i]=M.bet[i]*bn; // no dirigido: cada par contado 2 veces -> normalización de networkx
  // eigenvector (iteración de potencia sobre A+I)
  let x=new Array(n).fill(1/Math.sqrt(Math.max(n,1)));
  for(let it=0;it<500;it++){
    const y=x.slice(); for(let i=0;i<n;i++) G.adj[i].forEach((w,j)=>{y[i]+=x[j];});
    const nrm=Math.sqrt(y.reduce((a,b)=>a+b*b,0))||1; const nx_=y.map(v=>v/nrm);
    const diff=nx_.reduce((a,v,i)=>a+Math.abs(v-x[i]),0); x=nx_; if(diff<1e-10) break;
  }
  M.eig=x;
  // coeficiente de agrupamiento local
  for(let i=0;i<n;i++){ const nb=[...G.adj[i].keys()]; const k=nb.length; if(k<2){M.clu[i]=0;continue;}
    let t=0; for(let a=0;a<k;a++) for(let b=a+1;b<k;b++) if(G.adj[nb[a]].has(nb[b])) t++; M.clu[i]=2*t/(k*(k-1)); }
  return M;
};

/* Comunidades: modularidad voraz (Clauset-Newman-Moore) con pesos */
NET.communities=function(G){
  const n=G.n; let m2=0; G.adj.forEach(a=>a.forEach(w=>m2+=w)); // 2m
  if(m2===0) return {label:new Array(n).fill(0).map((_,i)=>i),Q:0,groups:G.ids.map((_,i)=>[i])};
  let label=Array.from({length:n},(_,i)=>i);
  const deg=G.adj.map(a=>{let s=0;a.forEach(w=>s+=w);return s;});
  let comm=new Map(); for(let i=0;i<n;i++) comm.set(i,{members:[i],a:deg[i]/m2});
  // e[c][d] = fracción de aristas entre c y d
  const e=new Map(); for(let i=0;i<n;i++) e.set(i,new Map());
  for(let i=0;i<n;i++) G.adj[i].forEach((w,j)=>{ e.get(i).set(j,(e.get(i).get(j)||0)+w/m2); });
  let Q=0; for(let i=0;i<n;i++){ const sl=0; Q+=sl-comm.get(i).a**2; }
  let bestQ=Q, bestLabel=label.slice();
  while(true){
    let best=null,bd=-Infinity;
    e.forEach((nb,c)=>nb.forEach((v,d)=>{ if(c<d){ const dq=2*(v-comm.get(c).a*comm.get(d).a); if(dq>bd+1e-12){bd=dq;best=[c,d];} } }));
    if(!best) break; const [c,d]=best;
    // fusionar d en c
    const cc=comm.get(c), dd=comm.get(d); cc.members=cc.members.concat(dd.members); cc.a+=dd.a;
    e.get(d).forEach((v,k)=>{ if(k===c) return; e.get(c).set(k,(e.get(c).get(k)||0)+v); e.get(k).set(c,(e.get(k).get(c)||0)+v); e.get(k).delete(d); });
    e.get(c).delete(d); e.delete(d); comm.delete(d);
    Q+=bd; if(Q>bestQ+1e-12){bestQ=Q; bestLabel=Array(n); comm.forEach((cv,cid)=>cv.members.forEach(x=>bestLabel[x]=cid));}
    if(comm.size===1) break;
  }
  const groupsMap=new Map(); bestLabel.forEach((c,i)=>{ if(!groupsMap.has(c)) groupsMap.set(c,[]); groupsMap.get(c).push(i); });
  const groups=[...groupsMap.values()].sort((a,b)=>b.length-a.length);
  const lab=new Array(n); groups.forEach((g,gi)=>g.forEach(i=>lab[i]=gi));
  return {label:lab,Q:bestQ,groups};
};

/* Puntos de articulación: nodos cuya salida fragmenta la red */
NET.cutpoints=function(G){
  const base=NET.components(G); const out=[];
  for(let v=0;v<G.n;v++){ if(G.adj[v].size<2) continue;
    const r=NET.components(G,v); // cuenta incluye el nodo omitido? no: skip no cuenta
    const myComp=base.comp[v]; const compSize=base.sizes[myComp];
    // componentes restantes dentro de la misma componente original
    const parts=new Map(); for(let i=0;i<G.n;i++){ if(i===v||base.comp[i]!==myComp) continue; parts.set(r.comp[i],(parts.get(r.comp[i])||0)+1); }
    if(parts.size>1){ const sz=[...parts.values()].sort((a,b)=>b-a); out.push({v,fragmentos:parts.size,aislados:compSize-1-sz[0],tam:sz}); }
  }
  return out.sort((a,b)=>b.aislados-a.aislados);
};

NET.shortest=function(G,s,t){
  const {dist,pred}=bfs(G,s); if(dist[t]<0) return null;
  const path=[t]; let cur=t; while(cur!==s){cur=pred[cur][0];path.push(cur);} return path.reverse();
};

/* Distribución inicial y layout de fuerzas (Fruchterman-Reingold) */
function rng(seed){return function(){seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
NET.layout=function(G,W,H,opt){
  opt=opt||{}; const n=G.n, rand=rng(7), pos=[];
  const iso=[],act=[]; for(let i=0;i<n;i++) (G.adj[i].size?act:iso).push(i);
  const cx=W/2, cy=(H-(iso.length?90:0))/2;
  act.forEach((i,k)=>{const a=rand()*6.283,r=60+rand()*Math.min(W,H)*0.3;pos[i]={x:cx+Math.cos(a)*r,y:cy+Math.sin(a)*r};});
  const area=W*(H-(iso.length?120:0)), kk=Math.sqrt(area/Math.max(act.length,1))*0.9;
  let temp=W/8;
  for(let it=0;it<400;it++){
    const disp=new Map(act.map(i=>[i,{x:0,y:0}]));
    for(let a=0;a<act.length;a++) for(let b=a+1;b<act.length;b++){
      const i=act[a],j=act[b]; let dx=pos[i].x-pos[j].x,dy=pos[i].y-pos[j].y,d=Math.hypot(dx,dy)||0.01; const f=kk*kk/d;
      dx/=d;dy/=d; disp.get(i).x+=dx*f;disp.get(i).y+=dy*f;disp.get(j).x-=dx*f;disp.get(j).y-=dy*f; }
    G.links.forEach(l=>{ const i=l.a,j=l.b; let dx=pos[i].x-pos[j].x,dy=pos[i].y-pos[j].y,d=Math.hypot(dx,dy)||0.01; const f=d*d/kk*(0.6+0.4*l.w);
      dx/=d;dy/=d; disp.get(i).x-=dx*f;disp.get(i).y-=dy*f;disp.get(j).x+=dx*f;disp.get(j).y+=dy*f; });
    act.forEach(i=>{ const d=disp.get(i); d.x+=(cx-pos[i].x)*0.05; d.y+=(cy-pos[i].y)*0.05; const m=Math.hypot(d.x,d.y)||0.01; const s=Math.min(m,temp);
      pos[i].x+=d.x/m*s; pos[i].y+=d.y/m*s; pos[i].x=Math.max(80,Math.min(W-80,pos[i].x)); pos[i].y=Math.max(50,Math.min(H-(iso.length?140:50),pos[i].y)); });
    temp*=0.985;
  }
  iso.forEach((i,k)=>{ const per=Math.max(1,Math.ceil(iso.length/2)); const row=Math.floor(k/per), col=k%per; pos[i]={x:60+(W-120)*(col+0.5)/per,y:H-80+row*42}; });
  return pos;
};

window.NET=NET;
})();
