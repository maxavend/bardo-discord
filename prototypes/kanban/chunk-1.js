'use strict';
const STORAGE='bardo-kanban-qa-v5';
const VERSION=5;
const ME='ma';
const MAX_COLUMNS=5;
const DEFAULT_COLUMNS=['Backlog','Por hacer','En curso','Hecho'];
const MAX_TAGS=8;
const MAX_SUBTASKS=50;
const MAX_COMMENTS=150;
const PAGE_SIZE=120;
const people=[
{id:'ma',name:'Maxi',initials:'MA'},{id:'an',name:'Ana',initials:'AN'},{id:'lu',name:'Luis',initials:'LU'},{id:'so',name:'Sofi',initials:'SO'},
{id:'ca',name:'Carla',initials:'CA'},{id:'ni',name:'Nico',initials:'NI'},{id:'va',name:'Vale',initials:'VA'},{id:'jo',name:'José',initials:'JO'}
];
const priorities=['low','normal','high','urgent'];
const priorityRank={urgent:0,high:1,normal:2,low:3};
const tagPool=['UX','UI','Bug','QA','Mobile','A11y','Docs','Backend'];
const titleStarts=['Revisar','Diseñar','Validar','Implementar','Corregir','Documentar','Probar','Refinar','Preparar','Optimizar'];
const titleEnds=['navegación móvil','creación rápida','jerarquía visual','drag & drop','estado vacío','detalle de tarea','selector de responsables','chips de tags','subtareas','comentarios','accesibilidad','persistencia','rendimiento con volumen','responsive en iPhone'];
const descriptions=[
'Validar el flujo completo con datos mock y registrar cualquier fricción antes de integrar el módulo definitivo.',
'Revisar con foco en carga cognitiva: la acción principal debe ser evidente y todo lo demás quedar en segundo plano.',
'Caso de prueba para validar densidad, legibilidad y comportamiento en pantallas pequeñas.',
'Confirmar comportamiento en Safari iOS y escritorio, incluyendo touch, scroll, teclado y persistencia.',
'Tarea generada para stress QA. Puede editarse, moverse, duplicarse, comentarse y eliminarse sin afectar datos reales.'
];
const boardSpecs=[
{id:'product',title:'Producto',count:180,tags:['UX','UI','Bug','QA','Mobile','A11y','Docs','Backend']},
{id:'conversation',title:'Bardo conversacional',count:120,tags:['UX','Backend','QA','Docs','Mobile']},
{id:'polish',title:'Bugs & polish',count:95,tags:['Bug','QA','UI','A11y','Mobile']},
{id:'release',title:'Release 0.4',count:75,tags:['QA','Docs','Backend','Mobile']}
];
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const clone=o=>JSON.parse(JSON.stringify(o));
const uid=p=>`${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
const nowIso=()=>new Date().toISOString();
const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
function rng(seed){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function person(id){return people.find(p=>p.id===id)}
function makeBoard(spec,bi,r){
  const columns=DEFAULT_COLUMNS.map((title,i)=>({id:`${spec.id}-c${i+1}`,title}));
  const per=new Map(columns.map(c=>[c.id,0]));
  const tasks=[];
  for(let i=0;i<spec.count;i++){
    const col=columns[Math.floor(r()*columns.length)],order=per.get(col.id);per.set(col.id,order+1);
    const assignee=r()<.14?'':people[Math.floor(r()*people.length)].id;
    const priority=priorities[Math.floor(r()*priorities.length)];
    const tagCount=r()<.35?0:1+Math.floor(r()*Math.min(3,spec.tags.length));
    const tags=[];while(tags.length<tagCount){const t=spec.tags[Math.floor(r()*spec.tags.length)];if(!tags.includes(t))tags.push(t)}
    const subtasks=[];if(r()<.33){const n=2+Math.floor(r()*4);for(let s=0;s<n;s++)subtasks.push({id:`seed-st-${bi}-${i}-${s}`,text:['Revisar caso','Validar mobile','Registrar evidencia','Confirmar copy','Probar error'][s%5],done:r()<.45})}
    const comments=[];if(r()<.26){const n=1+Math.floor(r()*3);for(let c=0;c<n;c++)comments.push({id:`seed-cm-${bi}-${i}-${c}`,author:people[Math.floor(r()*people.length)].id,text:['Se ve bien; falta revisar en iPhone.','Encontré un edge case al mover la tarea.','Validado con datos mock.','Pendiente confirmar el comportamiento del undo.'][c%4],created:new Date(Date.now()-(c+1)*86400000).toISOString()})}
    tasks.push({id:`${spec.id}-t${i+1}`,title:`${titleStarts[Math.floor(r()*titleStarts.length)]} ${titleEnds[Math.floor(r()*titleEnds.length)]}`,description:descriptions[Math.floor(r()*descriptions.length)],status:col.id,assignee,priority,tags,subtasks,comments,order,updated:nowIso()});
  }
  return{id:spec.id,title:spec.title,columns,tags:[...spec.tags].slice(0,MAX_TAGS),tasks};
}
function makeSeed(){const r=rng(260823);const boards=boardSpecs.map((s,i)=>makeBoard(s,i,r));return{version:VERSION,activeBoardId:'product',activeColumnId:'product-c1',filters:[],boards}}
function sanitizeState(raw){
  if(!raw||raw.version!==VERSION||!Array.isArray(raw.boards)||!raw.boards.length)throw new Error('invalid');
  for(const b of raw.boards){
    if(!b.id||!b.title||!Array.isArray(b.columns)||b.columns.length<1||b.columns.length>MAX_COLUMNS||!Array.isArray(b.tasks))throw new Error('invalid board');
    b.tags=Array.isArray(b.tags)?[...new Set(b.tags.map(String).map(x=>x.trim()).filter(Boolean))].slice(0,MAX_TAGS):[];
    const ids=new Set(b.columns.map(c=>c.id));
    b.tasks=b.tasks.filter(t=>t&&t.id&&ids.has(t.status)).map(t=>({
      id:String(t.id),title:String(t.title||'Sin título').slice(0,180),description:String(t.description||'').slice(0,3000),status:t.status,
      assignee:people.some(p=>p.id===t.assignee)?t.assignee:'',priority:priorities.includes(t.priority)?t.priority:'normal',
      tags:Array.isArray(t.tags)?[...new Set(t.tags.filter(x=>b.tags.includes(x)))]:[],subtasks:Array.isArray(t.subtasks)?t.subtasks.slice(0,MAX_SUBTASKS):[],
      comments:Array.isArray(t.comments)?t.comments.slice(0,MAX_COMMENTS):[],order:Number.isFinite(+t.order)?+t.order:0,updated:t.updated||nowIso()
    }));
  }
  if(!raw.boards.some(b=>b.id===raw.activeBoardId))raw.activeBoardId=raw.boards[0].id;
  const b=raw.boards.find(x=>x.id===raw.activeBoardId);if(!b.columns.some(c=>c.id===raw.activeColumnId))raw.activeColumnId=b.columns[0].id;
  raw.filters=Array.isArray(raw.filters)?raw.filters.filter(f=>['mine','urgent','unassigned','comments'].includes(f)):[];
  return raw;
}
