let state;try{state=sanitizeState(JSON.parse(localStorage.getItem(STORAGE)||'null'))}catch(_){state=makeSeed()}
let undo=null,toastTimer=null,activeTaskId=null,saveTimer=null,dragTaskId=null,settingsDraft=null,renderLimits=new Map();
function persist(){try{localStorage.setItem(STORAGE,JSON.stringify(state));return true}catch(e){showToast('Storage lleno: cambios solo en memoria');console.warn(e);return false}}
function currentBoard(){return state.boards.find(b=>b.id===state.activeBoardId)||state.boards[0]}
function taskById(id){return currentBoard().tasks.find(t=>t.id===id)}
function normalizeOrders(board=currentBoard()){for(const c of board.columns)board.tasks.filter(t=>t.status===c.id).sort((a,b)=>a.order-b.order).forEach((t,i)=>t.order=i)}
function snapshot(label){undo={label,state:clone(state)}}
function commit(label,fn,msg=label){snapshot(label);fn();normalizeOrders();persist();render();showToast(msg,true)}
function undoLast(){if(!undo)return;state=sanitizeState(clone(undo.state));undo=null;persist();render();showToast('Cambio deshecho')}
function showToast(text,canUndo=false){$('#toast-text').textContent=text;$('#toast-undo').hidden=!canUndo;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,4200)}
function matches(t){
  const q=$('#search').value.trim().toLowerCase();
  if(q){const p=person(t.assignee);const hay=[t.title,t.description,p?.name||'',...t.tags,...t.comments.map(c=>c.text),...t.subtasks.map(s=>s.text)].join(' ').toLowerCase();if(!hay.includes(q))return false}
  for(const f of state.filters){if(f==='mine'&&t.assignee!==ME)return false;if(f==='urgent'&&t.priority!=='urgent')return false;if(f==='unassigned'&&t.assignee)return false;if(f==='comments'&&!t.comments.length)return false}
  return true;
}
function visibleTasks(board,colId){return board.tasks.filter(t=>t.status===colId&&matches(t)).sort((a,b)=>a.order-b.order)}
function render(){const b=currentBoard();if(!b.columns.some(c=>c.id===state.activeColumnId))state.activeColumnId=b.columns[0].id;$('#board-title').textContent=b.title;renderFilters();renderTabs();renderBoard();renderBoardPicker();renderQa();document.documentElement.style.setProperty('--cols',b.columns.length)}
function renderFilters(){$$('.filter-chip[data-filter]').forEach(btn=>{const f=btn.dataset.filter;btn.classList.toggle('active',f==='all'?state.filters.length===0:state.filters.includes(f))})}
function renderTabs(){const b=currentBoard();$('#mobile-tabs').innerHTML=b.columns.map(c=>`<button type="button" class="tab ${c.id===state.activeColumnId?'active':''}" data-col-tab="${esc(c.id)}">${esc(c.title)} <small>${visibleTasks(b,c.id).length}</small></button>`).join('')}
function renderBoard(){const b=currentBoard();$('#board').innerHTML=b.columns.map(c=>renderColumn(b,c)).join('')}
