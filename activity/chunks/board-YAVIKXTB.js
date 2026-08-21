import{a as xe}from"./chunk-SIUIQO43.js";import"./chunk-NLRERPBA.js";var ae=Object.freeze([{id:"backlog",label:"Backlog",color:"#8a8e9b"},{id:"todo",label:"Por hacer",color:"#5865f2"},{id:"doing",label:"En curso",color:"#f0b232"},{id:"done",label:"Hecho",color:"#23a55a"}]);var ue=Object.freeze([{id:"low",label:"Baja",color:"#8a8e9b",order:1},{id:"medium",label:"Media",color:"#5865f2",order:2},{id:"high",label:"Alta",color:"#f0b232",order:3},{id:"urgent",label:"Urgente",color:"#f23f43",order:4}]),Ve=new Set(ae.map(a=>a.id)),Ze=new Set(ue.map(a=>a.id)),ea=Object.freeze({in_progress:"doing","in-progress":"doing"});var O=Object.freeze([{id:"blurple",name:"Azul",color:"#5865f2"},{id:"emerald",name:"Verde",color:"#23a55a"},{id:"amber",name:"\xC1mbar",color:"#f0b232"},{id:"crimson",name:"Rojo",color:"#f23f43"},{id:"purple",name:"P\xFArpura",color:"#9b59b6"},{id:"pink",name:"Rosa",color:"#eb459e"},{id:"cyan",name:"Cian",color:"#00b0f4"},{id:"slate",name:"Gris",color:"#8a8e9b"}]);function W(a){if(!a)return O[0].color;let t=0;for(let e=0;e<a.length;e+=1)t=(t<<5)-t+a.charCodeAt(e),t|=0;return O[Math.abs(t)%O.length].color}function ie(a){if(!a)return[];if(Array.isArray(a)){let r=new Set,n=[];for(let d of a){if(!d)continue;let l=typeof d=="string"?d.trim():String(d.name||"").trim();if(!l)continue;let w=l.toLocaleLowerCase("es");if(r.has(w))continue;r.add(w);let m=typeof d=="object"&&d.color?d.color:W(l);if(n.push({name:l.slice(0,24),color:m}),n.length>=8)break}return n}let t=new Set,e=[];for(let r of String(a).split(",")){let n=r.trim().replace(/\s+/g," ").slice(0,24),d=n.toLocaleLowerCase("es");if(!(!n||t.has(d))&&(t.add(d),e.push({name:n,color:W(n)}),e.length>=8))break}return e}var Be="1539704001535156254",ve="bardo:board:",ke="board:";var ye={urgent:{label:"Urgente",color:"#f23f43",bg:"rgba(242, 63, 67, 0.15)",icon:'<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>'},high:{label:"Alta",color:"#f0b232",bg:"rgba(240, 178, 50, 0.15)",icon:'<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="18 15 12 9 6 15"/></svg>'},medium:{label:"Media",color:"#5865f2",bg:"rgba(88, 101, 242, 0.15)",icon:'<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="5" fill="currentColor"/></svg>'},low:{label:"Baja",color:"#8a8e9b",bg:"rgba(138, 142, 155, 0.15)",icon:'<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>'}},J=null,Q=null,D=null,x=null,z=null,X=[],G=[],te=[],H=null,me=!1,be=null,ge=null,$={search:"",onlyMyTasks:!1,assignee:"all",priority:"all",label:"all"},de=null,j=[];function je(){return(window.location.hostname||"").match(/^([a-zA-Z0-9_-]+)\.discordsays\.com$/i)?.[1]||Be}function fe(a){let t=String(a||"").trim();return t.startsWith(ve)?t.slice(ve.length)||null:t.startsWith(ke)&&t.slice(ke.length)||null}function se(a){let t=a==="light";document.documentElement.setAttribute("data-theme",t?"light":"dark"),document.documentElement.classList.toggle("theme-light",t),document.documentElement.classList.toggle("theme-dark",!t)}function we(a){let e=new URLSearchParams(window.location.search).get("theme");if(e?se(e):a?.theme?se(a.theme):a?.config?.theme?se(a.config.theme):window.matchMedia&&window.matchMedia("(prefers-color-scheme: light)").matches?se("light"):se("dark"),a?.subscribe)try{a.subscribe("THEME_CHANGE",({theme:r})=>{r&&se(r)})}catch{}}async function Ce(a){if(a){try{if(a.commands?.getInstanceConnectedParticipants){let t=await a.commands.getInstanceConnectedParticipants();Array.isArray(t?.participants)&&t.participants.length>0&&(X=t.participants,!z&&X.length>0&&(z=X[0]))}}catch(t){console.warn("No se pudieron obtener los participantes de Discord:",t)}try{if(a.commands?.getChannel&&a.channelId){let t=await a.commands.getChannel({channel_id:a.channelId});if(Array.isArray(t?.recipients))for(let e of t.recipients)e?.id&&!X.some(r=>String(r.id)===String(e.id))&&X.push(e)}}catch{}}}async function Ue(){if(J)return J;let t=new URLSearchParams(window.location.search).has("frame_id")||window.location.hostname.endsWith(".discordsays.com");if(we(null),!t)return null;try{let e=new xe(je());await e.ready(),J=e,we(e);try{e.subscribe&&e.subscribe("ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE",({participants:r})=>{Array.isArray(r)&&(X=r,!z&&X.length>0&&(z=X[0]))})}catch{}return await Ce(e),e}catch(e){return console.warn("No se pudo iniciar DiscordSDK para el tablero:",e),null}}async function De(a,t=5){if(!a)return null;for(let e=0;e<t;e+=1){let r=await fetch(`/api/activity-context/${encodeURIComponent(a)}`,{cache:"no-store",headers:{Accept:"application/json"}}).catch(()=>null);if(r?.ok)return r.json();e<t-1&&await new Promise(n=>setTimeout(n,Math.min(180*2**e,1200)))}return null}async function _e(){let a=new URLSearchParams(window.location.search),t=await Ue();D=t?.instanceId||a.get("instance_id")||null;let e=fe(t?.customId)||fe(a.get("custom_id"))||a.get("board");if(e)return e;let r=await De(D);return fe(r?.documentId)}function s(a){return String(a||"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}function ce(a){return String(a||"?").split(/\s+/).filter(Boolean).slice(0,2).map(t=>t[0]?.toUpperCase()).join("")||"?"}function N(a,t="info"){let e=document.querySelector("#bardo-toast");e&&e.remove(),ge&&clearTimeout(ge);let r=document.createElement("div");r.id="bardo-toast",r.className=`kanban-toast toast-${t}`,r.innerHTML=`
    <span class="toast-icon">${t==="success"?"\u2713":t==="error"?"\u2715":"\u2139"}</span>
    <span class="toast-msg">${s(a)}</span>
  `,document.body.appendChild(r),requestAnimationFrame(()=>r.classList.add("is-visible")),ge=setTimeout(()=>{r.classList.remove("is-visible"),setTimeout(()=>r.remove(),250)},3200)}function Re(){if(document.querySelector("#bardo-kanban-styles"))return;let a=document.createElement("style");a.id="bardo-kanban-styles",a.textContent=`
    html[data-bardo-mode="board"] body > .shell { display: none !important; }
    
    :root,
    [data-theme="dark"],
    .theme-dark {
      --kb-bg: #111214;
      --kb-surface: #1e1f22;
      --kb-surface-raised: #2b2d31;
      --kb-surface-hover: #35373c;
      --kb-border: transparent;
      --kb-border-subtle: transparent;
      --kb-text-primary: #f2f3f5;
      --kb-text-muted: #949ba4;
      --kb-text-dim: #72767d;
      --kb-blurple: #5865f2;
      --kb-blurple-hover: #4752c4;
      --kb-danger: #f23f43;
      --kb-danger-hover: #da373b;
      --kb-radius-card: 10px;
      --kb-radius-modal: 14px;
      --kb-radius-pill: 999px;
      --kb-shadow-card: none;
      --kb-shadow-modal: 0 16px 40px rgba(0, 0, 0, 0.45);
      --kb-scrollbar-thumb: rgba(255, 255, 255, 0.16);
      --kb-scrollbar-thumb-hover: rgba(255, 255, 255, 0.28);
    }

    [data-theme="light"],
    .theme-light {
      --kb-bg: #f2f3f5;
      --kb-surface: #ffffff;
      --kb-surface-raised: #e9eaec;
      --kb-surface-hover: #dcdee1;
      --kb-border: transparent;
      --kb-border-subtle: transparent;
      --kb-text-primary: #060607;
      --kb-text-muted: #4e5058;
      --kb-text-dim: #80848e;
      --kb-blurple: #5865f2;
      --kb-blurple-hover: #4752c4;
      --kb-shadow-card: none;
      --kb-shadow-modal: 0 16px 40px rgba(0, 0, 0, 0.18);
      --kb-scrollbar-thumb: rgba(0, 0, 0, 0.16);
      --kb-scrollbar-thumb-hover: rgba(0, 0, 0, 0.28);
    }

    @media (prefers-color-scheme: light) {
      :root:not([data-theme="dark"]) {
        --kb-bg: #f2f3f5;
        --kb-surface: #ffffff;
        --kb-surface-raised: #e9eaec;
        --kb-surface-hover: #dcdee1;
        --kb-border: transparent;
        --kb-border-subtle: transparent;
        --kb-text-primary: #060607;
        --kb-text-muted: #4e5058;
        --kb-text-dim: #80848e;
        --kb-blurple: #5865f2;
        --kb-blurple-hover: #4752c4;
        --kb-shadow-card: none;
        --kb-shadow-modal: 0 16px 40px rgba(0, 0, 0, 0.18);
        --kb-scrollbar-thumb: rgba(0, 0, 0, 0.16);
        --kb-scrollbar-thumb-hover: rgba(0, 0, 0, 0.28);
      }
    }

    /* Scrollbar moderna, integrada y con fondo transparente */
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track,
    ::-webkit-scrollbar-track-piece,
    ::-webkit-scrollbar-corner {
      background: transparent !important;
      background-color: transparent !important;
    }
    ::-webkit-scrollbar-thumb {
      background: var(--kb-scrollbar-thumb, rgba(255, 255, 255, 0.16));
      border-radius: 999px;
      border: none;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: var(--kb-scrollbar-thumb-hover, rgba(255, 255, 255, 0.28));
    }
    * {
      scrollbar-width: thin;
      scrollbar-color: var(--kb-scrollbar-thumb, rgba(255, 255, 255, 0.16)) transparent !important;
    }

    .kanban-shell {
      min-height: 100vh;
      padding: 16px 0 32px;
      padding-top: max(env(safe-area-inset-top, 0px), 16px);
      padding-bottom: max(env(safe-area-inset-bottom, 0px), 32px);
      color: var(--kb-text-primary);
      background: var(--kb-bg);
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
    }

    /* Topbar con Avatar Flat */
    .kanban-topbar {
      max-width: 1520px;
      width: 100%;
      margin: 0 auto 12px;
      padding-inline: max(env(safe-area-inset-left, 0px), clamp(16px, 3.5vw, 40px));
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding-bottom: 12px;
      box-sizing: border-box;
    }
    .kanban-brand-group {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .kanban-avatar-box {
      width: 34px;
      height: 34px;
      border-radius: 10px;
      background: var(--kb-surface);
      display: grid;
      place-items: center;
      overflow: hidden;
      flex: 0 0 auto;
      transition: transform 0.15s ease;
    }
    .kanban-avatar-box:hover { transform: scale(1.05); }
    .kanban-avatar {
      width: 100%;
      height: 100%;
      object-fit: contain;
      padding: 2px;
      box-sizing: border-box;
      display: block;
    }

    .kanban-brand strong {
      display: block;
      font-size: 14px;
      font-weight: 700;
      line-height: 1.15;
    }
    .kanban-brand span {
      display: block;
      margin-top: 1px;
      color: var(--kb-text-muted);
      font-size: 11px;
    }

    .kanban-top-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    /* Buttons con dimensiones id\xE9nticas */
    .btn-primary {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      background: var(--kb-blurple);
      color: #ffffff;
      border: none;
      border-radius: 7px;
      height: 32px;
      padding: 0 13px;
      font-size: 12.5px;
      font-weight: 600;
      cursor: pointer;
      box-sizing: border-box;
      white-space: nowrap;
      flex-shrink: 0;
      transition: background 0.15s ease, transform 0.08s ease;
    }
    .btn-primary:hover { background: var(--kb-blurple-hover); }
    .btn-primary:active { transform: scale(0.98); }

    .btn-secondary {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      background: var(--kb-surface-raised);
      color: var(--kb-text-primary);
      border: none;
      border-radius: 7px;
      height: 32px;
      padding: 0 12px;
      font-size: 12.5px;
      font-weight: 500;
      cursor: pointer;
      box-sizing: border-box;
      white-space: nowrap;
      flex-shrink: 0;
      transition: background 0.15s ease;
    }
    .btn-secondary:hover { background: var(--kb-surface-hover); }

    .btn-icon {
      width: 32px;
      height: 32px;
      border-radius: 7px;
      display: grid;
      place-items: center;
      background: var(--kb-surface-raised);
      border: none;
      color: var(--kb-text-muted);
      cursor: pointer;
      box-sizing: border-box;
      white-space: nowrap;
      flex-shrink: 0;
      transition: all 0.15s ease;
    }
    .btn-icon:hover { color: var(--kb-text-primary); background: var(--kb-surface-hover); }
    .btn-icon.is-spinning svg { animation: spin 0.8s linear infinite; }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    /* Header */
    .kanban-header {
      max-width: 1520px;
      width: 100%;
      margin: 0 auto 12px;
      padding-inline: max(env(safe-area-inset-left, 0px), clamp(16px, 3.5vw, 40px));
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      box-sizing: border-box;
    }
    .kanban-header-info {
      flex: 1;
      min-width: 0;
    }
    .kanban-eyebrow {
      margin: 0 0 4px;
      color: var(--kb-text-dim);
      font-size: 11.5px;
      font-weight: 700;
      letter-spacing: .02em;
    }
    .kanban-title-wrap {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .kanban-title {
      margin: 0;
      font-size: clamp(22px, 2.6vw, 32px);
      font-weight: 800;
      letter-spacing: -.03em;
      line-height: 1.1;
    }
    .btn-edit-board-icon {
      width: 22px;
      height: 22px;
      border-radius: 6px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: none;
      color: var(--kb-text-dim);
      opacity: 0.35;
      cursor: pointer;
      padding: 0;
      transition: all 0.15s ease;
    }
    .btn-edit-board-icon:hover,
    .btn-edit-board-icon:focus-visible {
      opacity: 1;
      background: var(--kb-surface-raised);
      color: var(--kb-text-primary);
    }
    .kanban-description {
      max-width: 760px;
      margin: 5px 0 0;
      color: var(--kb-text-muted);
      font-size: 13px;
      line-height: 1.45;
    }

    /* Toolbar / Filters Flat */
    .kanban-toolbar {
      max-width: 1520px;
      width: 100%;
      margin: 0 auto 16px;
      padding-inline: max(env(safe-area-inset-left, 0px), clamp(16px, 3.5vw, 40px));
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 10px;
      padding-top: 0;
      padding-bottom: 0;
      background: transparent;
      border: none;
      box-sizing: border-box;
    }

    .search-box {
      position: relative;
      flex: 1;
      min-width: 190px;
    }
    .search-box input {
      width: 100%;
      height: 34px;
      padding: 0 28px 0 32px;
      background: var(--kb-surface);
      border: none;
      border-radius: 7px;
      color: var(--kb-text-primary);
      font-size: 12.5px;
      outline: none;
      box-sizing: border-box;
      transition: background 0.15s ease;
    }
    .search-box input:focus {
      background: var(--kb-surface-raised);
    }
    .search-icon {
      position: absolute;
      left: 10px;
      top: 50%;
      transform: translateY(-50%);
      color: var(--kb-text-dim);
      pointer-events: none;
      display: flex;
    }
    .search-clear {
      position: absolute;
      right: 8px;
      top: 50%;
      transform: translateY(-50%);
      background: none;
      border: none;
      color: var(--kb-text-dim);
      font-size: 12px;
      cursor: pointer;
      padding: 2px 4px;
      border-radius: 4px;
    }
    .search-clear:hover { color: var(--kb-text-primary); }

    .filter-group {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    /* Select Wrapper Flat */
    .custom-select-wrap {
      position: relative;
      display: inline-flex;
      align-items: center;
    }
    .custom-select-wrap select {
      appearance: none;
      -webkit-appearance: none;
      height: 34px;
      padding: 0 32px 0 11px;
      background: var(--kb-surface);
      border: none;
      border-radius: 7px;
      color: var(--kb-text-primary);
      font-size: 12px;
      cursor: pointer;
      outline: none;
      transition: background 0.15s ease;
    }
    .custom-select-wrap select:focus {
      background: var(--kb-surface-raised);
    }
    .custom-select-wrap .select-arrow {
      position: absolute;
      right: 10px;
      top: 50%;
      transform: translateY(-50%);
      pointer-events: none;
      color: var(--kb-text-dim);
      display: flex;
    }

    /* Bot\xF3n "Mis tareas" Flat */
    .toggle-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      height: 34px;
      padding: 0 12px;
      border-radius: 7px;
      background: var(--kb-surface);
      border: none;
      color: var(--kb-text-muted);
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s ease;
      user-select: none;
    }
    .toggle-chip:hover { color: var(--kb-text-primary); background: var(--kb-surface-hover); }
    .toggle-chip.is-active {
      background: var(--kb-blurple);
      color: #ffffff;
      font-weight: 600;
    }
    .toggle-chip.is-active span { color: #ffffff; }

    .clear-filters-btn {
      background: none;
      border: none;
      color: var(--kb-blurple);
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      padding: 4px 6px;
      text-decoration: underline;
    }

    /* Mobile Column Navigation Tabs */
    .mobile-column-tabs {
      display: none;
      gap: 6px;
      padding: 4px 0 10px;
      margin-bottom: 8px;
      padding-inline: max(env(safe-area-inset-left, 0px), clamp(16px, 3.5vw, 40px));
      box-sizing: border-box;
      flex-wrap: wrap;
    }
    .mobile-tab-btn {
      flex: 0 0 auto;
      width: auto;
      padding: 5px 11px;
      border-radius: var(--kb-radius-pill);
      background: var(--kb-surface);
      border: none;
      color: var(--kb-text-muted);
      font-size: 11.5px;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
      text-align: center;
      transition: all 0.12s ease;
    }
    .mobile-tab-btn.is-active {
      color: #ffffff;
      background: var(--tab-color, var(--kb-blurple));
    }

    /* Arquitectura de Scroll Horizontal (Contenedor externo + Track interno) */
    .kanban-scroll-container {
      width: 100%;
      max-width: 100%;
      overflow-x: auto;
      overflow-y: visible;
      box-sizing: border-box;
      padding-inline: max(env(safe-area-inset-left, 0px), clamp(16px, 3.5vw, 40px));
      scroll-padding-inline: max(env(safe-area-inset-left, 0px), clamp(16px, 3.5vw, 40px));
      padding-bottom: 24px;
      scrollbar-width: thin;
      scrollbar-color: var(--kb-scrollbar-thumb, rgba(255, 255, 255, 0.16)) transparent !important;
      flex: 1;
      -webkit-overflow-scrolling: touch;
    }

    .kanban-track {
      display: inline-flex;
      gap: 16px;
      align-items: flex-start;
      min-width: 100%;
      box-sizing: border-box;
      overflow: visible;
    }

    .kanban-column {
      flex: 1 1 280px;
      min-width: 280px;
      max-width: 380px;
      background: var(--kb-surface);
      border: none;
      border-radius: 12px;
      padding: 12px 10px;
      min-height: 260px;
      display: flex;
      flex-direction: column;
      box-sizing: border-box;
      transition: background 0.12s ease;
    }
    .kanban-column.is-over {
      background: color-mix(in srgb, var(--kb-surface) 88%, var(--column-accent, var(--kb-blurple)));
    }

    /* Cabecera de Columna con Divider Sutil (Dark & Light) */
    .kanban-column-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 2px 4px 10px;
      margin-bottom: 10px;
      border-bottom: 1px solid color-mix(in srgb, var(--column-accent, var(--kb-blurple)) 22%, rgba(255, 255, 255, 0.05));
    }
    @media (prefers-color-scheme: light) {
      .kanban-column-header {
        border-bottom: 1px solid color-mix(in srgb, var(--column-accent, var(--kb-blurple)) 18%, rgba(0, 0, 0, 0.08));
      }
    }
    .column-title-wrap {
      display: flex;
      align-items: center;
      gap: 7px;
    }
    .column-indicator {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--column-accent, var(--kb-blurple));
      flex: 0 0 auto;
    }
    .kanban-column-title {
      margin: 0;
      font-size: 13px;
      font-weight: 750;
      letter-spacing: -0.01em;
    }
    .column-actions {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .kanban-count {
      min-width: 22px;
      height: 22px;
      padding: 0 6px;
      display: inline-grid;
      place-items: center;
      border-radius: var(--kb-radius-pill);
      background: var(--column-badge-bg, var(--kb-surface-raised));
      color: var(--column-accent, var(--kb-text-muted));
      font-size: 11px;
      font-weight: 750;
    }
    .btn-add-task-col {
      width: 24px;
      height: 24px;
      border-radius: 6px;
      display: grid;
      place-items: center;
      background: transparent;
      border: none;
      color: var(--kb-text-muted);
      cursor: pointer;
      font-size: 15px;
      line-height: 1;
      transition: all 0.12s ease;
    }
    .btn-add-task-col:hover {
      color: var(--kb-text-primary);
      background: var(--kb-surface-raised);
    }
    .btn-edit-col-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: var(--kb-text-dim);
      opacity: 0.35;
      margin-left: 2px;
      transition: all 0.15s ease;
      cursor: pointer;
    }
    .column-title-wrap:hover .btn-edit-col-icon,
    .column-title-wrap:focus-visible .btn-edit-col-icon {
      opacity: 1;
      color: var(--kb-text-primary);
    }

    .kanban-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      flex: 1;
      min-height: 120px;
    }

    /* Cards Flat */
    .task-card {
      border: none;
      border-radius: var(--kb-radius-card);
      background: var(--kb-surface-raised);
      padding: 12px;
      cursor: grab;
      transition: transform 0.12s ease, background 0.12s ease;
      position: relative;
      user-select: none;
      -webkit-user-select: none;
    }
    .task-card:hover {
      transform: translateY(-1px);
      background: var(--kb-surface-hover);
    }
    .task-card:active { cursor: grabbing; }
    .task-card.is-moving { opacity: 0.35; transform: scale(0.97); }
    .task-card.is-touch-dragging {
      opacity: 0.85;
      transform: scale(1.03);
      z-index: 100;
    }

    .task-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      margin-bottom: 7px;
    }
    .priority-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 7px;
      border-radius: var(--kb-radius-pill);
      font-size: 10.5px;
      font-weight: 700;
      letter-spacing: .01em;
    }

    .task-title {
      margin: 0;
      font-size: 13.5px;
      line-height: 1.35;
      font-weight: 700;
      color: var(--kb-text-primary);
      word-break: break-word;
    }
    .task-description {
      margin: 6px 0 0;
      color: var(--kb-text-muted);
      font-size: 12px;
      line-height: 1.45;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .task-labels {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-top: 9px;
    }
    .task-chip {
      display: inline-flex;
      align-items: center;
      min-height: 20px;
      padding: 0 7px;
      border-radius: var(--kb-radius-pill);
      font-size: 10px;
      font-weight: 650;
      letter-spacing: 0.01em;
    }

    /* Footer limpio */
    .task-footer {
      margin-top: 10px;
      padding-top: 6px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .task-assignee {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
      color: var(--kb-text-muted);
      font-size: 11px;
    }
    .task-assignee-avatar {
      width: 22px;
      height: 22px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      background: var(--kb-surface);
      color: var(--kb-text-primary);
      font-size: 9px;
      font-weight: 800;
      flex: 0 0 auto;
      border: none;
    }
    .task-assignee-name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-weight: 500;
    }

    /* Card sutil de "Sin tareas" Flat */
    .kanban-empty {
      padding: 24px 12px;
      color: var(--kb-text-dim);
      font-size: 12px;
      text-align: center;
      background: var(--kb-surface-raised);
      border: none;
      border-radius: 8px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
    }
    .btn-col-empty-add {
      background: none;
      border: none;
      color: var(--kb-blurple);
      font-size: 11.5px;
      font-weight: 600;
      cursor: pointer;
      text-decoration: underline;
    }

    /* Modal Flat */
    .kanban-modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.72);
      backdrop-filter: blur(4px);
      z-index: 1000;
      display: grid;
      place-items: center;
      padding: 16px;
      box-sizing: border-box;
      animation: fadeIn 0.15s ease;
    }
    .kanban-modal {
      width: 100%;
      max-width: 540px;
      background: var(--kb-surface);
      border: 1px solid var(--kb-border-subtle, rgba(255, 255, 255, 0.08));
      border-radius: var(--kb-radius-modal);
      box-shadow: var(--kb-shadow-modal);
      padding: 0;
      box-sizing: border-box;
      animation: slideUp 0.18s cubic-bezier(0.16, 1, 0.3, 1);
      display: flex;
      flex-direction: column;
      max-height: 88vh;
      overflow-y: auto;
      overflow-x: hidden;
      position: relative;
    }

    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes slideUp { from { transform: translateY(12px) scale(0.98); opacity: 0; } to { transform: translateY(0) scale(1); opacity: 1; } }

    .modal-header {
      position: sticky;
      top: 0;
      z-index: 100;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px 14px;
      background: var(--kb-surface);
      border-bottom: 1px solid var(--kb-border-subtle, rgba(255, 255, 255, 0.08));
      flex-shrink: 0;
    }
    .modal-title {
      margin: 0;
      font-size: 16px;
      font-weight: 750;
      color: var(--kb-text-primary);
    }
    .modal-close-btn {
      background: none;
      border: none;
      color: var(--kb-text-muted);
      font-size: 18px;
      cursor: pointer;
      line-height: 1;
      padding: 4px;
      border-radius: 4px;
    }
    .modal-close-btn:hover { color: var(--kb-text-primary); }

    .modal-form {
      display: flex;
      flex-direction: column;
      gap: 14px;
      padding: 18px 20px 22px;
      box-sizing: border-box;
    }
    .form-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
      position: relative;
    }
    .form-group label,
    .form-label {
      font-size: 11.5px;
      font-weight: 650;
      color: var(--kb-text-muted);
      letter-spacing: .01em;
      margin: 0;
    }
    .form-supporting-text {
      margin: -2px 0 4px;
      font-size: 12px;
      line-height: 1.4;
      color: var(--kb-text-muted);
    }
    .form-helper-text {
      font-size: 11px;
      line-height: 1.4;
      color: var(--kb-text-dim);
    }
    .form-input,
    .form-textarea {
      width: 100%;
      background: var(--kb-surface-raised);
      border: 1px solid var(--kb-border-subtle, rgba(255, 255, 255, 0.08));
      border-radius: 7px;
      color: var(--kb-text-primary);
      font: inherit;
      font-size: 13px;
      padding: 8px 11px;
      box-sizing: border-box;
      outline: none;
      transition: background 0.12s ease, border-color 0.12s ease;
    }
    .form-input {
      height: 36px;
    }
    .form-input:focus,
    .form-textarea:focus {
      background: var(--kb-surface-hover);
      border-color: var(--kb-border-active, rgba(255, 255, 255, 0.18));
    }
    .form-textarea {
      min-height: 72px;
      resize: vertical;
      line-height: 1.45;
    }

    .form-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }

    .form-group .custom-select-wrap {
      display: flex;
      width: 100%;
      height: 36px;
      position: relative;
    }
    .form-group .custom-select-wrap select,
    .form-group .custom-select-wrap .form-select {
      width: 100%;
      height: 36px;
      appearance: none;
      -webkit-appearance: none;
      background-color: var(--kb-surface-raised) !important;
      background: var(--kb-surface-raised) !important;
      border: 1px solid var(--kb-border-subtle, rgba(255, 255, 255, 0.08));
      border-radius: 7px;
      color: var(--kb-text-primary);
      padding: 0 32px 0 11px;
      font: inherit;
      font-size: 13px;
      box-sizing: border-box;
      outline: none;
      cursor: pointer;
      transition: background 0.12s ease, border-color 0.12s ease;
    }
    .form-group .custom-select-wrap select:focus,
    .form-group .custom-select-wrap .form-select:focus {
      background-color: var(--kb-surface-hover) !important;
      background: var(--kb-surface-hover) !important;
      border-color: var(--kb-border-active, rgba(255, 255, 255, 0.18));
    }

    /* Segmented Controls for Priority */
    .segmented-control {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 3px;
      height: 36px;
      background: var(--kb-surface-raised);
      padding: 3px;
      border-radius: 8px;
      border: 1px solid var(--kb-border-subtle, rgba(255, 255, 255, 0.08));
      box-sizing: border-box;
    }
    .seg-btn {
      height: 100%;
      box-sizing: border-box;
      background: transparent;
      border: none;
      border-radius: 6px;
      padding: 0 4px;
      font-size: 11.5px;
      font-weight: 650;
      color: var(--kb-text-muted);
      cursor: pointer;
      transition: all 0.12s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 3px;
    }
    .seg-btn:hover { color: var(--kb-text-primary); }
    .seg-btn.is-selected {
      background: var(--kb-surface);
      color: var(--kb-text-primary);
    }
    .seg-btn[data-priority="urgent"].is-selected { color: #f23f43; }
    .seg-btn[data-priority="high"].is-selected { color: #f0b232; }
    .seg-btn[data-priority="medium"].is-selected { color: #5865f2; }
    .seg-btn[data-priority="low"].is-selected { color: #8a8e9b; }

    /* ==========================================================
       NOTION / LINEAR STYLE INTEGRATED CHIP INPUT (FLAT)
       ========================================================== */
    .notion-chips-container {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 5px;
      background: var(--kb-surface-raised);
      border: 1px solid var(--kb-border-subtle, rgba(255, 255, 255, 0.08));
      border-radius: 7px;
      padding: 4px 8px;
      min-height: 36px;
      box-sizing: border-box;
      cursor: text;
      position: relative;
    }
    .notion-chips-selected {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }
    .notion-chip-pill {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 7px;
      border-radius: var(--kb-radius-pill);
      font-size: 11px;
      font-weight: 650;
      line-height: 1.2;
      animation: fadeIn 0.1s ease;
    }
    .notion-chip-remove {
      background: none;
      border: none;
      color: inherit;
      opacity: 0.65;
      cursor: pointer;
      padding: 0;
      font-size: 11px;
      line-height: 1;
      display: flex;
    }
    .notion-chip-remove:hover { opacity: 1; }
    .notion-chips-container:focus-within {
      background: var(--kb-surface-hover);
      border-color: var(--kb-border-active, rgba(255, 255, 255, 0.18));
    }
    .notion-chip-inline-input,
    .notion-chips-input,
    #task-chip-input {
      flex: 1;
      min-width: 140px;
      height: 26px;
      background: transparent !important;
      background-color: transparent !important;
      border: none !important;
      outline: none !important;
      box-shadow: none !important;
      color: var(--kb-text-primary);
      font: inherit;
      font-size: 13px;
      padding: 0 4px;
      margin: 0;
    }
    .notion-chips-wrapper {
      position: relative;
      width: 100%;
    }
    .notion-chips-dropdown,
    .notion-chip-dropdown {
      position: absolute;
      top: calc(100% + 4px);
      left: 0;
      right: 0;
      background: var(--kb-surface-raised);
      border: 1px solid var(--kb-border-active, rgba(255, 255, 255, 0.16));
      border-radius: 8px;
      box-shadow: 0 14px 36px rgba(0, 0, 0, 0.55);
      z-index: 1200;
      max-height: 180px;
      overflow-y: auto;
      padding: 4px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .notion-menu-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 6px 10px;
      border-radius: 6px;
      background: transparent;
      border: none;
      color: var(--kb-text-primary);
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      width: 100%;
      text-align: left;
      transition: background 0.1s ease;
    }
    .notion-menu-item:hover,
    .notion-menu-item.is-highlighted {
      background: var(--kb-surface-raised);
    }
    .notion-menu-create {
      color: var(--kb-blurple);
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    /* ==========================================================
       DISCORD MEMBER AUTOCOMPLETE SELECTOR (FLAT)
       ========================================================== */
    .discord-member-container {
      position: relative;
    }
    .discord-member-input-wrap {
      position: relative;
      display: flex;
      align-items: center;
    }
    .member-icon {
      position: absolute;
      left: 10px;
      color: var(--kb-text-dim);
      font-size: 13px;
      pointer-events: none;
    }
    .discord-member-input {
      padding-left: 32px;
      padding-right: 28px;
    }
    .member-clear-btn {
      position: absolute;
      right: 8px;
      background: none;
      border: none;
      color: var(--kb-text-dim);
      cursor: pointer;
      font-size: 12px;
      padding: 2px 4px;
      border-radius: 4px;
    }
    .member-clear-btn:hover { color: var(--kb-text-primary); }
    .discord-member-dropdown {
      position: absolute;
      top: calc(100% + 4px);
      left: 0;
      right: 0;
      background: var(--kb-surface-raised);
      border: 1px solid var(--kb-border-active, rgba(255, 255, 255, 0.16));
      border-radius: 8px;
      box-shadow: 0 14px 36px rgba(0, 0, 0, 0.55);
      z-index: 1200;
      max-height: 220px;
      overflow-y: auto;
      padding: 4px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .member-menu-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 10px;
      border-radius: 6px;
      background: transparent;
      border: none;
      color: var(--kb-text-primary);
      font-size: 12.5px;
      cursor: pointer;
      width: 100%;
      text-align: left;
      transition: background 0.1s ease;
    }
    .member-menu-item:hover {
      background: var(--kb-surface-raised);
    }
    .member-avatar-mini {
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: var(--kb-surface-raised);
      display: grid;
      place-items: center;
      font-size: 9.5px;
      font-weight: 800;
      border: none;
      flex: 0 0 auto;
    }
    .member-info-col {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .member-name-text {
      font-weight: 600;
      line-height: 1.2;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .member-handle-text {
      font-size: 10.5px;
      color: var(--kb-text-muted);
    }
    .board-member-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 3px 8px 3px 5px;
      background: var(--kb-surface-raised);
      border-radius: var(--kb-radius-pill);
      font-size: 11.5px;
      color: var(--kb-text-primary);
      font-weight: 550;
      animation: fadeIn 0.1s ease;
    }
    .board-member-pill .member-avatar-mini {
      width: 18px;
      height: 18px;
      font-size: 8.5px;
    }
    .board-member-pill-remove {
      background: none;
      border: none;
      color: var(--kb-text-dim);
      cursor: pointer;
      font-size: 11px;
      padding: 0;
      display: flex;
      line-height: 1;
    }
    .board-member-pill-remove:hover {
      color: var(--kb-danger);
    }
    .board-member-suggestion-btn {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 3px 8px 3px 5px;
      background: var(--kb-surface);
      border: 1px dashed var(--kb-text-dim);
      border-radius: var(--kb-radius-pill);
      font-size: 11px;
      color: var(--kb-text-muted);
      cursor: pointer;
      transition: all 0.12s ease;
    }
    .board-member-suggestion-btn:hover {
      background: var(--kb-surface-hover);
      color: var(--kb-text-primary);
      border-style: solid;
    }

    /* Column Manager dentro de Configuraci\xF3n de Tablero */
    .modal-columns-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-top: 6px;
    }
    .modal-column-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 10px;
      background: var(--kb-surface);
      border: 1px solid var(--kb-border-subtle, rgba(255, 255, 255, 0.06));
      border-radius: 8px;
      box-sizing: border-box;
      transition: background 0.12s ease, border-color 0.12s ease, transform 0.12s ease;
      user-select: none;
    }
    .modal-column-row.is-dragging {
      opacity: 0.35;
      border: 1px dashed var(--kb-blurple);
    }
    .modal-column-row.is-drag-over {
      border-color: var(--kb-blurple);
      background: var(--kb-surface-hover);
      transform: scale(1.01);
    }
    .modal-column-drag-handle {
      width: 20px;
      height: 24px;
      display: grid;
      place-items: center;
      background: transparent;
      border: none;
      color: var(--kb-text-dim);
      cursor: grab;
      padding: 0;
      flex: 0 0 auto;
      transition: color 0.12s ease;
      touch-action: none;
    }
    .modal-column-drag-handle:hover {
      color: var(--kb-text-primary);
    }
    .modal-column-drag-handle:active {
      cursor: grabbing;
    }
    .modal-column-dot {
      width: 14px;
      height: 14px;
      border-radius: 50%;
      flex: 0 0 auto;
    }
    .modal-column-input {
      flex: 1;
      height: 28px;
      padding: 0 8px;
      background: transparent;
      border: 1px solid transparent;
      border-radius: 6px;
      color: var(--kb-text-primary);
      font-size: 12.5px;
      font-weight: 600;
      outline: none;
      user-select: auto;
    }
    .modal-column-input:focus {
      background: var(--kb-surface-raised);
      border-color: var(--kb-blurple);
    }
    .modal-column-btn {
      width: 24px;
      height: 24px;
      display: grid;
      place-items: center;
      background: transparent;
      border: none;
      color: var(--kb-text-dim);
      border-radius: 5px;
      cursor: pointer;
      font-size: 11px;
      padding: 0;
      transition: all 0.1s ease;
      flex: 0 0 auto;
    }
    .modal-column-btn:hover {
      color: var(--kb-text-primary);
      background: var(--kb-surface-raised);
    }
    .modal-column-btn:disabled {
      opacity: 0.25;
      cursor: not-allowed;
    }
    .modal-column-btn.btn-remove-col:hover {
      color: var(--kb-danger);
    }
    .btn-add-modal-col {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      background: var(--kb-surface);
      border: 1px dashed var(--kb-text-dim);
      border-radius: 7px;
      color: var(--kb-text-muted);
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.12s ease;
    }
    .btn-add-modal-col:hover {
      color: var(--kb-blurple);
      border-color: var(--kb-blurple);
      background: var(--kb-surface-raised);
    }

    .modal-actions {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin-top: 4px;
      padding-top: 8px;
    }
    .modal-actions-right {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .btn-danger {
      background: transparent;
      color: var(--kb-danger);
      border: none;
      border-radius: 7px;
      padding: 7px 12px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.12s ease;
    }
    .btn-danger:hover { background: var(--kb-danger); color: #fff; }
    .btn-danger.is-confirming {
      background: var(--kb-danger);
      color: #fff;
      animation: pulse 0.8s infinite alternate;
    }

    @keyframes pulse { from { opacity: 0.9; } to { opacity: 1; } }

    /* Toast */
    .kanban-toast {
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: var(--kb-surface-raised);
      border: none;
      border-radius: 9px;
      padding: 10px 16px;
      color: var(--kb-text-primary);
      font-size: 13px;
      font-weight: 550;
      box-shadow: 0 8px 24px rgba(0,0,0,0.35);
      z-index: 2000;
      display: flex;
      align-items: center;
      gap: 8px;
      opacity: 0;
      transform: translateY(12px);
      transition: opacity 0.2s ease, transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      pointer-events: none;
    }
    .kanban-toast.is-visible { opacity: 1; transform: translateY(0); }
    .toast-success .toast-icon { color: #23a55a; font-weight: 800; }
    .toast-error .toast-icon { color: #f23f43; font-weight: 800; }
    .toast-info .toast-icon { color: #5865f2; font-weight: 800; }

    /* States */
    .kanban-state {
      max-width: 600px;
      margin: 20vh auto 0;
      padding: 24px;
      text-align: center;
      color: var(--kb-text-muted);
    }
    .kanban-state strong {
      display: block;
      margin-bottom: 8px;
      color: var(--kb-text-primary);
      font-size: 17px;
    }

    @media (max-width: 860px) {
      .kanban-shell {
        padding-top: calc(env(safe-area-inset-top, 0px) + 56px);
        padding-bottom: max(env(safe-area-inset-bottom, 0px), 48px);
        padding-inline: 0;
      }
      .kanban-header {
        flex-direction: column;
        gap: 8px;
        padding-inline: max(env(safe-area-inset-left, 0px), 16px);
      }
      .kanban-topbar {
        padding-inline: max(env(safe-area-inset-left, 0px), 16px);
      }
      .kanban-toolbar {
        gap: 8px;
        padding-inline: max(env(safe-area-inset-left, 0px), 16px);
      }
      .mobile-column-tabs {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        padding-inline: max(env(safe-area-inset-left, 0px), 16px);
      }
      .mobile-tab-btn {
        flex: 0 0 auto;
        width: auto;
      }
      .kanban-scroll-container {
        padding-inline: max(env(safe-area-inset-left, 0px), 16px);
        scroll-padding-inline: max(env(safe-area-inset-left, 0px), 16px);
        scroll-snap-type: x mandatory;
      }
      .kanban-track {
        gap: 12px;
      }
      .kanban-column {
        flex: 0 0 calc(85vw - 20px);
        min-width: 260px;
        max-width: 340px;
        scroll-snap-align: start;
      }
      .form-row { grid-template-columns: 1fr; }
    }
  `,document.head.appendChild(a)}function Pe(){Re(),document.documentElement.dataset.bardoMode="board",document.querySelector("#bardo-kanban")?.remove();let a=document.createElement("main");a.id="bardo-kanban",a.className="kanban-shell";let t=document.querySelector(".brand-avatar")?.src||"";return a.innerHTML=`
    <header class="kanban-topbar">
      <div class="kanban-brand-group">
        ${t?`
          <div class="kanban-avatar-box">
            <img class="kanban-avatar" src="${s(t)}" alt="Bardo" />
          </div>
        `:""}
        <div class="kanban-brand">
          <strong>Bardo Kanban</strong>
          <span id="sync-indicator">Sincronizado</span>
        </div>
      </div>
      <div class="kanban-top-actions">
        <button id="btn-sync" class="btn-icon" title="Refrescar tablero" type="button" aria-label="Refrescar">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
          </svg>
        </button>
        <button id="btn-new-task-global" class="btn-primary" type="button">
          <span>+</span> Tarea
        </button>
      </div>
    </header>
    <section id="kanban-content" class="kanban-state">
      <strong>Abriendo tablero</strong>
      <p>Cargando tareas del equipo\u2026</p>
    </section>
  `,document.body.appendChild(a),a.querySelector("#btn-sync")?.addEventListener("click",async()=>{await V(!0)}),a.querySelector("#btn-new-task-global")?.addEventListener("click",()=>{let e=(x?.columns||ae)[0]?.id||"backlog";pe({mode:"create",status:e})}),a.querySelector("#kanban-content")}function Ee(a=[]){let t=new Map;for(let e of a){let r=ie(e.labels||[]);for(let n of r){if(!n.name)continue;let d=n.name.toLowerCase();t.has(d)||t.set(d,{name:n.name,color:n.color||W(n.name)})}}return Array.from(t.values())}function Ae(a){let t=new Map;if(Array.isArray(a?.members))for(let e of a.members){if(!e)continue;let r=String(e.id||e.name||e.username);t.set(r,{id:r,name:e.name||e.username||"Usuario",username:e.username||"",avatarUrl:e.avatarUrl||null,roles:Array.isArray(e.roles)?e.roles:[]})}for(let e of G){if(!e||!e.id)continue;let r=String(e.id);t.has(r)||t.set(r,{id:r,name:e.name||e.username||"Usuario",username:e.username||"",avatarUrl:e.avatarUrl||null,roles:Array.isArray(e.roles)?e.roles:[]})}for(let e of X){if(!e||!e.id)continue;let r=String(e.id);t.get(r)||t.set(r,{id:r,name:e.global_name||e.username||"Usuario",username:e.username||"",avatarUrl:e.avatar?`https://cdn.discordapp.com/avatars/${e.id}/${e.avatar}.png?size=64`:null,roles:[]})}if(Array.isArray(a?.tasks)){for(let e of a.tasks)if(e.assigneeName){let r=e.assigneeId?String(e.assigneeId):e.assigneeName;t.has(r)||t.set(r,{id:r,name:e.assigneeName,username:"",avatarUrl:null,roles:[]})}}return Array.from(t.values())}function Ie(a=[]){let t=new Map;for(let e of G)!e||!e.id||t.set(String(e.id),{id:String(e.id),name:e.name||e.username||"Usuario",username:e.username||"",avatarUrl:e.avatarUrl||null});if(Array.isArray(x?.members))for(let e of x.members){if(!e)continue;let r=String(e.id||e.name||e.username),n=e.name||e.username||"Usuario",d=t.get(r);t.set(r,{id:r,name:n,username:e.username||d?.username||"",avatarUrl:e.avatarUrl||d?.avatarUrl||null})}for(let e of X){if(!e.id)continue;let r=e.nickname||e.global_name||e.username||"Usuario",n=t.get(String(e.id));t.set(String(e.id),{id:String(e.id),name:r,username:e.username||n?.username||"",avatarUrl:n?.avatarUrl||(e.avatar?`https://cdn.discordapp.com/avatars/${e.id}/${e.avatar}.png?size=64`:null)})}if(z?.id){let e=z.global_name||z.username||"Yo",r=t.get(String(z.id));t.set(String(z.id),{id:String(z.id),name:e,username:z.username||r?.username||"",avatarUrl:r?.avatarUrl||(z.avatar?`https://cdn.discordapp.com/avatars/${z.id}/${z.avatar}.png?size=64`:null)})}for(let e of a)if(e.assigneeId&&e.assigneeName){let r=String(e.assigneeId);t.has(r)||t.set(r,{id:r,name:e.assigneeName,username:"",avatarUrl:null})}return Array.from(t.values())}function Oe(a){let t=new Map;if(a){if(Array.isArray(a.members))for(let e of a.members){if(!e)continue;let r=String(e.id||e.name||e.username),n=e.name||e.username||"Usuario";t.set(r,{id:r,name:n,username:e.username||""})}if(Array.isArray(a.tasks)){for(let e of a.tasks)if(e.assigneeName){let r=e.assigneeId?String(e.assigneeId):e.assigneeName;t.has(r)||t.set(r,{id:r,name:e.assigneeName,username:""})}}}return Array.from(t.values())}function Te(){let a=new Set,t=new Set;z?.id&&a.add(String(z.id));let e=localStorage.getItem("bardo_my_user_id");e&&a.add(String(e)),z?.username&&t.add(z.username.toLowerCase().replace(/^@/,"")),z?.global_name&&t.add(z.global_name.toLowerCase());let r=localStorage.getItem("bardo_my_user_name");return r&&t.add(r.toLowerCase().replace(/^@/,"")),{ids:Array.from(a),names:Array.from(t)}}function He(a=[]){return a.filter(t=>{if($.search){let e=$.search.toLowerCase(),r=(t.title||"").toLowerCase().includes(e),n=(t.description||"").toLowerCase().includes(e),d=(t.assigneeName||"").toLowerCase().includes(e),w=ie(t.labels||[]).some(m=>(m.name||"").toLowerCase().includes(e));if(!r&&!n&&!d&&!w)return!1}if($.assignee!=="all")if($.assignee==="unassigned"){if(t.assigneeId||t.assigneeName)return!1}else{let e=$.assignee.toLowerCase(),r=String(t.assigneeId||"").toLowerCase(),n=String(t.assigneeName||"").toLowerCase().replace(/^@/,"");if(r!==e&&n!==e&&!n.includes(e)&&!e.includes(n))return!1}if($.onlyMyTasks){let{ids:e,names:r}=Te(),n=t.assigneeId?String(t.assigneeId):"",d=(t.assigneeName||"").toLowerCase().replace(/^@/,""),l=!1;if(n&&e.includes(n))l=!0;else if(d&&r.length>0){for(let w of r)if(d===w||d.includes(w)||w.includes(d)){l=!0;break}}if(!l)return!1}return!($.priority!=="all"&&t.priority!==$.priority||$.label!=="all"&&!ie(t.labels||[]).some(n=>(n.name||"").toLowerCase()===$.label.toLowerCase()))})}function Fe(a){let t=ye[a.priority]||ye.medium,r=ie(a.labels||[]).map(d=>{let l=d.color||W(d.name);return`
      <span class="task-chip" style="background: ${l}20; border: 1px solid ${l}45; color: ${l};">
        ${s(d.name)}
      </span>
    `}).join(""),n=a.assigneeName?`<div class="task-assignee"><span class="task-assignee-avatar">${s(ce(a.assigneeName))}</span><span class="task-assignee-name">${s(a.assigneeName)}</span></div>`:'<div class="task-assignee"><span class="task-assignee-avatar">\u2014</span><span class="task-assignee-name">Sin asignar</span></div>';return`
    <article class="task-card" draggable="true" data-task-id="${s(a.id)}" tabindex="0" role="button" aria-label="Ver o editar ${s(a.title)}">
      <div class="task-header">
        <span class="priority-badge" style="color: ${t.color}; background: ${t.bg};">
          ${t.icon} ${t.label}
        </span>
      </div>
      <h3 class="task-title">${s(a.title)}</h3>
      ${a.description?`<p class="task-description">${s(a.description)}</p>`:""}
      ${r?`<div class="task-labels">${r}</div>`:""}
      <footer class="task-footer">
        ${n}
      </footer>
    </article>
  `}function R(a,t){x=t,document.title=`${t.name} \xB7 Bardo Kanban`;let e=Array.isArray(t.columns)&&t.columns.length>0?t.columns:ae,r=t.tasks||[],n=He(r),d=Ee(r),l=Oe(t),w=e[0]?.id||"backlog",m=Object.fromEntries(e.map(u=>[u.id,[]])),v=Object.fromEntries(e.map(u=>[u.id,0]));for(let u of r){let k=m[u.status]?u.status:w;v[k]=(v[k]||0)+1}for(let u of n){let k=m[u.status]?u.status:w;m[k].push(u)}let L=!!($.search||$.onlyMyTasks||$.assignee!=="all"||$.priority!=="all"||$.label!=="all");a.className="",a.innerHTML=`
    <header class="kanban-header">
      <div class="kanban-header-info">
        <p class="kanban-eyebrow">Tablero de equipo</p>
        <div class="kanban-title-wrap">
          <h1 class="kanban-title">${s(t.name)}</h1>
          <button id="btn-edit-board" class="btn-edit-board-icon" title="Editar configuraci\xF3n y miembros del tablero" type="button" aria-label="Editar tablero">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
              <path d="m15 5 4 4"/>
            </svg>
          </button>
        </div>
        ${t.description?`<p class="kanban-description">${s(t.description)}</p>`:""}
      </div>
    </header>

    <!-- Barra de Herramientas (Limpia, sin card) -->
    <section class="kanban-toolbar" aria-label="Filtros y b\xFAsqueda">
      <div class="search-box">
        <span class="search-icon">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
          </svg>
        </span>
        <input id="filter-search" type="search" placeholder="Buscar por t\xEDtulo, responsable o chip\u2026" value="${s($.search)}" />
        ${$.search?'<button id="btn-clear-search" class="search-clear" type="button">\u2715</button>':""}
      </div>

      <div class="filter-group">
        <button id="toggle-my-tasks" class="toggle-chip ${$.onlyMyTasks?"is-active":""}" type="button">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
          </svg>
          <span>Mis tareas</span>
        </button>

        <div class="custom-select-wrap">
          <select id="filter-assignee" aria-label="Filtrar por miembro">
            <option value="all" ${$.assignee==="all"?"selected":""}>Todos los miembros</option>
            <option value="unassigned" ${$.assignee==="unassigned"?"selected":""}>Sin asignar</option>
            ${l.map(u=>`<option value="${s(u.id)}" ${$.assignee===u.id?"selected":""}>${s(u.name)}</option>`).join("")}
          </select>
          <span class="select-arrow" aria-hidden="true">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
          </span>
        </div>

        <div class="custom-select-wrap">
          <select id="filter-priority" aria-label="Filtrar por prioridad">
            <option value="all" ${$.priority==="all"?"selected":""}>Todas las prioridades</option>
            <option value="urgent" ${$.priority==="urgent"?"selected":""}>Urgente</option>
            <option value="high" ${$.priority==="high"?"selected":""}>Alta</option>
            <option value="medium" ${$.priority==="medium"?"selected":""}>Media</option>
            <option value="low" ${$.priority==="low"?"selected":""}>Baja</option>
          </select>
          <span class="select-arrow" aria-hidden="true">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
          </span>
        </div>

        ${d.length?`
          <div class="custom-select-wrap">
            <select id="filter-label" aria-label="Filtrar por chip">
              <option value="all" ${$.label==="all"?"selected":""}>Todos los chips (${d.length}/${8})</option>
              ${d.map(u=>`<option value="${s(u.name)}" ${$.label===u.name?"selected":""}>${s(u.name)}</option>`).join("")}
            </select>
            <span class="select-arrow" aria-hidden="true">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
            </span>
          </div>
        `:""}

        ${L?'<button id="btn-clear-all-filters" class="clear-filters-btn" type="button">Limpiar filtros</button>':""}
      </div>
    </section>

    <!-- Navegador de pesta\xF1as m\xF3viles de columnas -->
    <nav class="mobile-column-tabs" aria-label="Pesta\xF1as de columnas">
      ${e.map(u=>{let k=u.color||"#5865f2",A=v[u.id]||0;return`
          <button class="mobile-tab-btn" data-jump-to-status="${u.id}" style="--tab-color: ${k};" type="button">
            ${s(u.label)} (${A})
          </button>
        `}).join("")}
    </nav>

    <!-- Columnas Kanban (Scroll Container + Track) -->
    <section class="kanban-scroll-container" aria-label="Columnas Kanban">
      <div class="kanban-track">
        ${e.map(u=>{let k=u.color||"#5865f2",A=m[u.id]?.length||0,T=v[u.id]||0,B=L&&A!==T?`${A}/${T}`:A;return`
            <section class="kanban-column" id="col-${u.id}" data-status="${u.id}" style="--column-accent: ${k}; --column-badge-bg: ${k}22;">
              <header class="kanban-column-header">
                <div class="column-title-wrap" data-edit-column="${u.id}" role="button" tabindex="0" title="Editar columna ${s(u.label)}" style="cursor: pointer;">
                  <span class="column-indicator"></span>
                  <h2 class="kanban-column-title">${s(u.label)}</h2>
                  <span class="btn-edit-col-icon" title="Editar columna">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
                      <path d="m15 5 4 4"/>
                    </svg>
                  </span>
                </div>
                <div class="column-actions">
                  <span class="kanban-count">${B}</span>
                  <button class="btn-add-task-col" data-add-to-status="${u.id}" title="Agregar tarea en ${s(u.label)}" type="button" aria-label="Agregar tarea">+</button>
                </div>
              </header>
              <div class="kanban-list" data-status-list="${u.id}">
                ${m[u.id]?.length?m[u.id].map(Fe).join(""):`<div class="kanban-empty">
                      <span>Sin tareas</span>
                      <button class="btn-col-empty-add" data-add-to-status="${u.id}" type="button">+ Agregar tarea</button>
                     </div>`}
              </div>
            </section>
          `}).join("")}
      </div>
    </section>
  `,Ye(a)}function Ke(a){let t=document.createElement("div");t.id="bardo-identify-modal-backdrop",t.className="kanban-modal-backdrop",t.innerHTML=`
    <div class="kanban-modal" role="dialog" aria-modal="true" style="max-width: 440px;">
      <header class="modal-header">
        <h2 class="modal-title">\xBFQui\xE9n eres t\xFA?</h2>
        <button id="btn-identify-close" class="modal-close-btn" type="button" aria-label="Cerrar">\u2715</button>
      </header>
      <div class="modal-form">
        <p class="form-supporting-text" style="margin-top: 0;">Selecciona tu perfil en este tablero para que <strong>Mis tareas</strong> filtre siempre tus asignaciones correctamente.</p>
        <div style="display: flex; flex-direction: column; gap: 4px; max-height: 240px; overflow-y: auto;">
          ${a.map(r=>`
            <button type="button" class="member-menu-item btn-choose-me" data-member-id="${s(r.id)}" data-member-name="${s(r.name)}" data-member-username="${s(r.username||"")}">
              ${r.avatarUrl?`<img src="${s(r.avatarUrl)}" alt="${s(r.name)}" style="width: 26px; height: 26px; border-radius: 50%; object-fit: cover; flex-shrink: 0;" />`:`<span class="member-avatar-mini">${s(ce(r.name))}</span>`}
              <div class="member-info-col">
                <span class="member-name-text" style="font-size: 13px;">${s(r.name)}</span>
                ${r.username?`<span class="member-handle-text">@${s(r.username)}</span>`:""}
              </div>
            </button>
          `).join("")}
        </div>
      </div>
    </div>
  `,document.body.appendChild(t);let e=()=>t.remove();t.querySelector("#btn-identify-close")?.addEventListener("click",e),t.addEventListener("click",r=>{r.target===t&&e()}),t.querySelectorAll(".btn-choose-me").forEach(r=>{r.addEventListener("click",()=>{let n=r.dataset.memberId,d=r.dataset.memberName,l=r.dataset.memberUsername;n&&localStorage.setItem("bardo_my_user_id",n),d&&localStorage.setItem("bardo_my_user_name",d),z={id:n,name:d,username:l,global_name:d},$.onlyMyTasks=!0,e();let w=document.querySelector("#kanban-content")||document.querySelector("#kanban-view");w&&x&&R(w,x),N(`Identificado como ${d}`,"success")})})}function Ye(a){let t=Array.isArray(x?.columns)&&x.columns.length>0?x.columns:ae;a.querySelector("#btn-edit-board")?.addEventListener("click",()=>{Ge(x)}),a.querySelector("#filter-search")?.addEventListener("input",r=>{$.search=r.target.value,R(a,x);let n=a.querySelector("#filter-search");n&&(n.focus(),n.setSelectionRange(n.value.length,n.value.length))}),a.querySelector("#btn-clear-search")?.addEventListener("click",()=>{$.search="",R(a,x)}),a.querySelector("#toggle-my-tasks")?.addEventListener("click",()=>{let{ids:r,names:n}=Te();if(!$.onlyMyTasks&&r.length===0&&n.length===0){let d=Ae(x);if(d.length>0){Ke(d);return}}$.onlyMyTasks=!$.onlyMyTasks,R(a,x)}),a.querySelector("#filter-assignee")?.addEventListener("change",r=>{$.assignee=r.target.value,R(a,x)}),a.querySelector("#filter-priority")?.addEventListener("change",r=>{$.priority=r.target.value,R(a,x)}),a.querySelector("#filter-label")?.addEventListener("change",r=>{$.label=r.target.value,R(a,x)}),a.querySelector("#btn-clear-all-filters")?.addEventListener("click",()=>{$={search:"",onlyMyTasks:!1,assignee:"all",priority:"all",label:"all"},R(a,x)}),a.querySelectorAll("[data-jump-to-status]").forEach(r=>{r.addEventListener("click",()=>{let n=r.dataset.jumpToStatus;a.querySelector(`#col-${n}`)?.scrollIntoView({behavior:"smooth",inline:"center",block:"nearest"}),a.querySelectorAll(".mobile-tab-btn").forEach(l=>l.classList.remove("is-active")),r.classList.add("is-active")})}),a.querySelectorAll("[data-add-to-status]").forEach(r=>{r.addEventListener("click",n=>{n.stopPropagation(),pe({mode:"create",status:r.dataset.addToStatus})})}),a.querySelectorAll("[data-edit-column]").forEach(r=>{let n=r.dataset.editColumn,d=t.find(l=>l.id===n);d&&(r.addEventListener("click",l=>{l.stopPropagation(),Se(d)}),r.addEventListener("keydown",l=>{(l.key==="Enter"||l.key===" ")&&(l.preventDefault(),Se(d))}))}),a.querySelectorAll(".task-card").forEach(r=>{let n=null,d=!1;r.addEventListener("click",()=>{if(d)return;let l=r.dataset.taskId,w=(x?.tasks||[]).find(m=>m.id===l);w&&pe({mode:"edit",task:w})}),r.addEventListener("keydown",l=>{if(l.key==="Enter"||l.key===" "){l.preventDefault();let w=r.dataset.taskId,m=(x?.tasks||[]).find(v=>v.id===w);m&&pe({mode:"edit",task:m})}}),r.addEventListener("dragstart",()=>{H=r.dataset.taskId,r.classList.add("is-moving")}),r.addEventListener("dragend",()=>{H=null,r.classList.remove("is-moving"),a.querySelectorAll(".kanban-column").forEach(l=>l.classList.remove("is-over"))}),r.addEventListener("touchstart",()=>{d=!1,n=setTimeout(()=>{H=r.dataset.taskId,r.classList.add("is-touch-dragging"),navigator.vibrate&&navigator.vibrate(30)},220)},{passive:!0}),r.addEventListener("touchmove",l=>{if(!H){clearTimeout(n);return}d=!0;let w=l.touches[0],v=document.elementFromPoint(w.clientX,w.clientY)?.closest(".kanban-column");a.querySelectorAll(".kanban-column").forEach(L=>L.classList.remove("is-over")),v&&v.classList.add("is-over")},{passive:!0}),r.addEventListener("touchend",async l=>{if(clearTimeout(n),H){let w=l.changedTouches[0],v=document.elementFromPoint(w.clientX,w.clientY)?.closest(".kanban-column");if(r.classList.remove("is-touch-dragging"),a.querySelectorAll(".kanban-column").forEach(L=>L.classList.remove("is-over")),v&&v.dataset.status){let L=v.dataset.status;await Le(H,L)}H=null}})}),a.querySelectorAll(".kanban-column").forEach(r=>{r.addEventListener("dragover",n=>{n.preventDefault(),r.classList.add("is-over")}),r.addEventListener("dragleave",()=>{r.classList.remove("is-over")}),r.addEventListener("drop",async n=>{if(n.preventDefault(),r.classList.remove("is-over"),!H)return;let d=r.dataset.status;await Le(H,d)})})}function pe(a){de=a,document.querySelector("#bardo-modal-backdrop")?.remove();let t=a.mode==="edit",e=a.task||{},r=Array.isArray(x?.columns)&&x.columns.length>0?x.columns:ae,n=a.status||e.status||r[0]?.id||"backlog",d=e.priority||"medium";j=ie(e.labels||[]);let l=Ee(x?.tasks||[]),w=Ie(x?.tasks||[]),m=document.createElement("div");m.id="bardo-modal-backdrop",m.className="kanban-modal-backdrop",m.innerHTML=`
    <div class="kanban-modal" role="dialog" aria-modal="true" aria-labelledby="modal-heading">
      <header class="modal-header">
        <h2 id="modal-heading" class="modal-title">${t?"Editar tarea":"Nueva tarea"}</h2>
        <button id="btn-modal-close" class="modal-close-btn" type="button" aria-label="Cerrar">\u2715</button>
      </header>

      <form id="modal-task-form" class="modal-form">
        <div class="form-group">
          <label for="task-title-input">T\xEDtulo *</label>
          <input id="task-title-input" class="form-input" type="text" placeholder="Ej: Dise\xF1ar flujo de onboarding" value="${s(e.title||"")}" required maxlength="120" autofocus />
        </div>

        <div class="form-group">
          <label for="task-desc-input">Descripci\xF3n</label>
          <textarea id="task-desc-input" class="form-textarea" placeholder="Agrega detalles, contexto o enlaces\u2026">${s(e.description||"")}</textarea>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label>Columna / estado</label>
            <div class="custom-select-wrap">
              <select id="task-status-input" class="form-select">
                ${r.map(b=>`<option value="${b.id}" ${b.id===n?"selected":""}>${s(b.label)}</option>`).join("")}
              </select>
              <span class="select-arrow" aria-hidden="true">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
              </span>
            </div>
          </div>

          <div class="form-group">
            <label>Prioridad</label>
            <div class="segmented-control" id="priority-selector">
              ${ue.map(b=>`
                <button type="button" class="seg-btn ${b.id===d?"is-selected":""}" data-priority="${b.id}">
                  ${b.label}
                </button>
              `).join("")}
            </div>
            <input type="hidden" id="task-priority-input" value="${d}" />
          </div>
        </div>

        <!-- Responsable con Autocomplete Inteligente de Discord -->
        <div class="form-group">
          <label>Responsable</label>
          <p class="form-supporting-text">Asigna a un miembro del servidor de Discord.</p>
          <div class="discord-member-container" id="discord-member-box">
            <div class="discord-member-input-wrap">
              <span class="member-icon" aria-hidden="true">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                </svg>
              </span>
              <input
                id="task-assignee-name-input"
                class="form-input discord-member-input"
                type="text"
                placeholder="Buscar miembro de Discord o escribir nombre\u2026"
                value="${s(e.assigneeName||"")}"
                autocomplete="off"
              />
              <input type="hidden" id="task-assignee-id-input" value="${s(e.assigneeId||"")}" />
              ${e.assigneeName?'<button type="button" id="btn-clear-assignee" class="member-clear-btn" title="Quitar asignaci\xF3n">\u2715</button>':""}
            </div>
            <div id="discord-member-dropdown" class="discord-member-dropdown" style="display: none;"></div>
          </div>
        </div>

        <!-- Chips / etiquetas estilo Notion -->
        <div class="form-group">
          <label>Chips / etiquetas</label>
          <p class="form-supporting-text">Etiquetas visuales para categorizar y filtrar la tarea.</p>
          <div class="notion-chips-wrapper" id="task-chips-wrapper">
            <div class="notion-chips-container" id="task-chips-box">
              <div class="notion-chips-selected" id="task-chips-selected"></div>
              <input
                id="task-chip-input"
                class="notion-chip-inline-input"
                type="text"
                placeholder="Escribe o crea un chip\u2026"
                autocomplete="off"
              />
            </div>
            <div id="task-chip-dropdown" class="notion-chips-dropdown notion-chip-dropdown" style="display: none;"></div>
          </div>
        </div>

        <footer class="modal-actions">
          <div>
            ${t?'<button id="btn-delete-task" class="btn-danger" type="button">Eliminar tarea</button>':""}
          </div>
          <div class="modal-actions-right">
            <button id="btn-modal-cancel" class="btn-secondary" type="button">Cancelar</button>
            <button id="btn-modal-submit" class="btn-primary" type="submit">
              ${t?"Guardar cambios":"Crear tarea"}
            </button>
          </div>
        </footer>
      </form>
    </div>
  `,document.body.appendChild(m);let v=m.querySelector("#task-chips-wrapper"),L=m.querySelector("#task-chips-box"),u=m.querySelector("#task-chips-selected"),k=m.querySelector("#task-chip-input"),A=m.querySelector("#task-chip-dropdown");function T(){u&&(u.innerHTML=j.map((b,h)=>{let I=b.color||W(b.name);return`
        <span class="notion-chip-pill" style="background: ${I}22; border: 1px solid ${I}55; color: ${I};">
          <span>${s(b.name)}</span>
          <button type="button" class="notion-chip-remove" data-remove-chip-idx="${h}" aria-label="Quitar">\u2715</button>
        </span>
      `}).join(""),u.querySelectorAll("[data-remove-chip-idx]").forEach(b=>{b.addEventListener("click",h=>{h.stopPropagation();let I=Number(b.dataset.removeChipIdx);j.splice(I,1),T(),k&&(k.placeholder=j.length?"Otro chip\u2026":"Escribe o crea un chip\u2026")})}))}function B(b=""){if(!A)return;let h=b.trim(),I=new Set(j.map(y=>y.name.toLowerCase())),q=l.filter(y=>!I.has(y.name.toLowerCase())&&(!h||y.name.toLowerCase().includes(h.toLowerCase()))),M="",S=l.some(y=>y.name.toLowerCase()===h.toLowerCase())||j.some(y=>y.name.toLowerCase()===h.toLowerCase());if(h&&!S)if(l.length>=8)M+=`
          <div style="padding: 6px 10px; color: var(--kb-text-muted); font-size: 11.5px;">
            L\xEDmite de ${8} chips por tablero alcanzado.
          </div>
        `;else{let y=W(h);M+=`
          <button type="button" class="notion-menu-item notion-menu-create" data-create-chip="${s(h)}" data-chip-color="${y}">
            <span>+ Crear etiqueta <strong>"${s(h)}"</strong></span>
            <span style="width: 10px; height: 10px; border-radius: 50%; background: ${y};"></span>
          </button>
        `}for(let y of q){let o=y.color||W(y.name);M+=`
        <button type="button" class="notion-menu-item" data-pick-chip="${s(y.name)}" data-chip-color="${s(o)}">
          <span class="notion-menu-item-tag" style="display: flex; align-items: center; gap: 6px;">
            <span style="width: 8px; height: 8px; border-radius: 50%; background: ${o};"></span>
            <span>${s(y.name)}</span>
          </span>
        </button>
      `}if(!M){A.style.display="none";return}A.innerHTML=M,A.style.display="flex",A.querySelectorAll("[data-create-chip]").forEach(y=>{y.addEventListener("mousedown",o=>{o.preventDefault(),o.stopPropagation();let c=y.dataset.createChip,i=y.dataset.chipColor;j.push({name:c,color:i}),T(),k&&(k.value="",k.placeholder="Otro chip\u2026",k.focus()),A.style.display="none"})}),A.querySelectorAll("[data-pick-chip]").forEach(y=>{y.addEventListener("mousedown",o=>{o.preventDefault(),o.stopPropagation();let c=y.dataset.pickChip,i=y.dataset.chipColor;j.push({name:c,color:i}),T(),k&&(k.value="",k.placeholder="Otro chip\u2026",k.focus()),A.style.display="none"})})}L?.addEventListener("click",()=>{k?.focus()}),k?.addEventListener("focus",()=>{B(k.value)}),k?.addEventListener("input",b=>{B(b.target.value)}),k?.addEventListener("keydown",b=>{if(b.key==="Enter"||b.key===","){b.preventDefault();let h=k.value.trim().replace(/^,|,$/g,"").slice(0,24);if(!h)return;if(!j.some(q=>q.name.toLowerCase()===h.toLowerCase())){let q=l.find(S=>S.name.toLowerCase()===h.toLowerCase());if(!q&&l.length>=8){N(`M\xE1ximo ${8} chips por tablero`,"info");return}let M=q?.color||W(h);j.push({name:h,color:M}),T()}k.value="",k.placeholder="Otro chip\u2026",A&&(A.style.display="none")}else b.key==="Backspace"&&!k.value&&j.length&&(j.pop(),T(),k.placeholder=j.length?"Otro chip\u2026":"Escribe o crea un chip\u2026",B(""))}),T();let oe=m.querySelector("#discord-member-box"),E=m.querySelector("#task-assignee-name-input"),U=m.querySelector("#task-assignee-id-input"),_=m.querySelector("#discord-member-dropdown"),ne=m.querySelector("#btn-clear-assignee");function Z(b=""){if(!_)return;let h=b.trim().replace(/^@/,"").toLowerCase(),I=Ae(x),q=I;h&&(q=I.filter(S=>{let y=(S.name||"").toLowerCase(),o=(S.username||"").toLowerCase(),c=String(S.id||"");return y.includes(h)||o.includes(h)||c.includes(h)}));let M="";if(q.length>0)for(let S of q){let y=getMemberRoleBadge(S);M+=`
          <button type="button" class="member-menu-item" data-member-id="${s(S.id)}" data-member-name="${s(S.name)}" data-member-username="${s(S.username||"")}" data-member-avatar="${s(S.avatarUrl||"")}">
            ${S.avatarUrl?`<img src="${s(S.avatarUrl)}" alt="${s(S.name)}" style="width: 22px; height: 22px; border-radius: 50%; object-fit: cover; flex-shrink: 0;" />`:`<span class="member-avatar-mini">${s(ce(S.name))}</span>`}
            <div class="member-info-col">
              <span class="member-name-text">${s(S.name)}</span>
              ${S.username?`<span class="member-handle-text">@${s(S.username)}</span>`:""}
            </div>
            ${y?`<span class="member-role-badge" style="background: ${y.color}22; color: ${y.color}; border: 1px solid ${y.color}44; font-size: 10px; padding: 1px 6px; border-radius: 999px; margin-left: auto;">${s(y.name)}</span>`:""}
          </button>
        `}else h?M=`<div style="padding: 10px 12px; font-size: 12px; color: var(--kb-text-dim); text-align: center;">No se encontraron miembros que coincidan con "${s(h)}"</div>`:M='<div style="padding: 10px 12px; font-size: 12px; color: var(--kb-text-dim); text-align: center;">Escribe un nombre o selecciona un miembro</div>';if(!M){_.style.display="none";return}_.innerHTML=M,_.style.display="flex",setTimeout(()=>{_.scrollIntoView({block:"nearest",behavior:"smooth"})},40),_.querySelectorAll(".member-menu-item").forEach(S=>{S.addEventListener("mousedown",y=>{y.preventDefault(),y.stopPropagation();let o=S.dataset.memberId,c=S.dataset.memberName,i=S.dataset.memberUsername,g=S.dataset.memberAvatar;if(E&&(E.value=c),U&&(U.value=o),_.style.display="none",c&&x){let f=Array.isArray(x.members)?[...x.members]:[];f.some(p=>p.name.toLowerCase()===c.toLowerCase()||o&&String(p.id)===String(o))||(f.push({id:o,name:c,username:i||"",avatarUrl:g||null}),x.members=f,he({members:f}).catch(()=>{}))}})})}E?.addEventListener("focus",()=>{Z(E.value)}),E?.addEventListener("input",b=>{U&&!/^\d{17,20}$/.test(b.target.value.trim())&&(U.value=""),Z(b.target.value)}),ne?.addEventListener("click",b=>{b.stopPropagation(),E&&(E.value=""),U&&(U.value=""),ne.remove()}),m.addEventListener("click",b=>{!v?.contains(b.target)&&A&&(A.style.display="none"),!oe?.contains(b.target)&&_&&(_.style.display="none"),b.target===m&&ee()});let F=m.querySelector("#task-priority-input");m.querySelectorAll("#priority-selector .seg-btn").forEach(b=>{b.addEventListener("click",()=>{m.querySelectorAll("#priority-selector .seg-btn").forEach(h=>h.classList.remove("is-selected")),b.classList.add("is-selected"),F.value=b.dataset.priority})});function ee(){de=null,m.remove()}if(m.querySelector("#btn-modal-close")?.addEventListener("click",ee),m.querySelector("#btn-modal-cancel")?.addEventListener("click",ee),window.addEventListener("keydown",function b(h){h.key==="Escape"&&de&&(ee(),window.removeEventListener("keydown",b))}),t){let b=m.querySelector("#btn-delete-task"),h=!1;b?.addEventListener("click",async()=>{if(!h){h=!0,b.textContent="\xBFConfirmar eliminaci\xF3n?",b.classList.add("is-confirming"),setTimeout(()=>{h=!1,b.textContent="Eliminar tarea",b.classList.remove("is-confirming")},3500);return}try{await We(e.id),ee(),N("Tarea eliminada","success"),await V(!1)}catch(I){console.error("Error eliminando tarea:",I),N("No se pudo eliminar la tarea","error")}})}m.querySelector("#modal-task-form")?.addEventListener("submit",async b=>{b.preventDefault();let h=m.querySelector("#task-title-input")?.value.trim();if(!h)return;let I=m.querySelector("#task-desc-input")?.value.trim()||"",q=m.querySelector("#task-status-input")?.value||r[0]?.id||"backlog",M=m.querySelector("#task-priority-input")?.value||"medium",S=E?.value.trim()||null,y=U?.value.trim()||null;if(S){if(/^\d{17,20}$/.test(S))y=S;else if(!y||!/^\d{17,20}$/.test(y)){let C=[...x?.members||[],...G].find(p=>p.name&&p.name.toLowerCase()===S.toLowerCase()||p.username&&p.username.toLowerCase()===S.toLowerCase().replace(/^@/,"")||p.id&&p.id===S);C&&C.id&&/^\d{17,20}$/.test(String(C.id))&&(y=String(C.id))}}let o=y||null,c=S||null,i=j,g=m.querySelector("#btn-modal-submit");g&&(g.disabled=!0);try{if(t?(await ze(e.id,{title:h,description:I,status:q,priority:M,assigneeId:o,assigneeName:c,labels:i}),N("Cambios guardados","success")):(await Xe({title:h,description:I,status:q,priority:M,assigneeId:o,assigneeName:c,labels:i}),N("Tarea creada","success")),c){let f=Array.isArray(x?.members)?[...x.members]:[];f.some(p=>p.name.toLowerCase()===c.toLowerCase()||o&&p.id===o)||(f.push({id:o||`m-${Date.now()}`,name:c,username:c}),x.members=f,he({members:f}).catch(()=>{}))}ee(),await V(!1)}catch(f){console.error("Error guardando tarea:",f),N(f.message||"No se pudo guardar la tarea","error"),g&&(g.disabled=!1)}})}function Se(a=null){let t=!!a,e=x?.columns||ae,r=a?.label||"",n=a?.color||O[e.length%O.length].color,d=document.createElement("div");d.id="bardo-column-modal-backdrop",d.className="kanban-modal-backdrop",d.innerHTML=`
    <div class="kanban-modal" role="dialog" aria-modal="true">
      <header class="modal-header">
        <h2 class="modal-title">${t?"Editar columna":`Nueva columna (m\xE1x. ${5})`}</h2>
        <button id="btn-col-modal-close" class="modal-close-btn" type="button" aria-label="Cerrar">\u2715</button>
      </header>
      <form id="col-modal-form" class="modal-form">
        <div class="form-group">
          <label for="col-name-input">Nombre de columna *</label>
          <input id="col-name-input" class="form-input" type="text" placeholder="Ej: En revisi\xF3n" value="${s(r)}" required maxlength="30" autofocus />
        </div>
        <div class="form-group">
          <label>Color distintivo</label>
          <p class="form-supporting-text">Selecciona un color distintivo para esta columna.</p>
          <div class="color-palette-picker" style="display: flex; gap: 8px; flex-wrap: wrap; padding: 4px 0;">
            ${O.map(v=>`
              <button type="button" class="color-dot-btn ${v.color===n?"is-selected":""}" data-color="${v.color}" style="width: 28px; height: 28px; border-radius: 50%; background: ${v.color}; border: none; cursor: pointer; transition: transform 0.1s ease; outline: ${v.color===n?"2px solid #fff":"none"}; outline-offset: 2px;"></button>
            `).join("")}
          </div>
          <input type="hidden" id="col-color-input" value="${n}" />
        </div>
        <footer class="modal-actions">
          <div>
            ${t&&e.length>1?'<button id="btn-delete-col" class="btn-danger" type="button">Eliminar columna</button>':""}
          </div>
          <div class="modal-actions-right">
            <button id="btn-col-modal-cancel" class="btn-secondary" type="button">Cancelar</button>
            <button id="btn-col-modal-submit" class="btn-primary" type="submit">${t?"Guardar":"Crear columna"}</button>
          </div>
        </footer>
      </form>
    </div>
  `,document.body.appendChild(d);let l=d.querySelector("#col-color-input");d.querySelectorAll(".color-dot-btn").forEach(v=>{v.addEventListener("click",()=>{d.querySelectorAll(".color-dot-btn").forEach(L=>{L.classList.remove("is-selected"),L.style.outline="none"}),v.classList.add("is-selected"),v.style.outline="2px solid #fff",v.style.outlineOffset="2px",l.value=v.dataset.color})});function w(){d.remove()}if(d.querySelector("#btn-col-modal-close")?.addEventListener("click",w),d.querySelector("#btn-col-modal-cancel")?.addEventListener("click",w),d.addEventListener("click",v=>{v.target===d&&w()}),t&&e.length>1){let v=d.querySelector("#btn-delete-col"),L=!1;v?.addEventListener("click",async()=>{if(!L){L=!0,v.textContent="\xBFConfirmar eliminaci\xF3n?",v.classList.add("is-confirming"),setTimeout(()=>{L=!1,v.textContent="Eliminar columna",v.classList.remove("is-confirming")},3500);return}let u=e.filter(k=>k.id!==a.id);try{await $e(u),x.columns=u,w(),N("Columna eliminada","success"),await V(!1)}catch(k){console.error("Error eliminando columna:",k),N(k.message||"No se pudo eliminar la columna","error")}})}d.querySelector("#col-modal-form")?.addEventListener("submit",async v=>{v.preventDefault();let L=d.querySelector("#col-name-input")?.value.trim();if(!L)return;let u=l?.value||"#5865f2",k;if(t)k=e.map(T=>T.id===a.id?{...T,label:L,color:u}:T);else{if(e.length>=5){N(`M\xE1ximo ${5} columnas por tablero`,"error");return}let T=L.toLowerCase().replace(/[^a-z0-9_-]/g,"")||`col-${Date.now()}`,B=T,oe=1;for(;e.some(E=>E.id===B);)B=`${T}-${oe}`,oe+=1;k=[...e,{id:B,label:L,color:u}]}let A=d.querySelector("#btn-col-modal-submit");A&&(A.disabled=!0);try{await $e(k),x.columns=k,w(),N(t?"Columna guardada":"Columna creada","success"),await V(!1)}catch(T){console.error("Error guardando columna:",T),N(T.message||"No se pudo guardar la columna","error"),A&&(A.disabled=!1)}})}async function Ge(a){if(!a)return;let e=[...Array.isArray(a.members)?[...a.members]:[]],n=[...Array.isArray(a.columns)&&a.columns.length>0?JSON.parse(JSON.stringify(a.columns)):JSON.parse(JSON.stringify(ae))];J&&await Ce(J);let d=Ie(a.tasks||[]),l=document.createElement("div");l.id="bardo-board-settings-modal-backdrop",l.className="kanban-modal-backdrop",l.innerHTML=`
    <div class="kanban-modal" role="dialog" aria-modal="true" style="max-width: 560px;">
      <header class="modal-header">
        <h2 class="modal-title">Configuraci\xF3n del tablero</h2>
        <button id="btn-board-modal-close" class="modal-close-btn" type="button" aria-label="Cerrar">\u2715</button>
      </header>
      <form id="board-settings-form" class="modal-form">
        <div class="form-group">
          <label for="board-name-input">Nombre del tablero *</label>
          <input id="board-name-input" class="form-input" type="text" placeholder="Ej: Proyecto Alfa" value="${s(a.name)}" required maxlength="80" autofocus />
        </div>

        <div class="form-group">
          <label for="board-desc-input">Descripci\xF3n</label>
          <textarea id="board-desc-input" class="form-textarea" placeholder="Prop\xF3sito, equipo o alcance de este tablero\u2026" maxlength="500">${s(a.description||"")}</textarea>
        </div>

        <!-- Gesti\xF3n de Columnas (m\xE1x 5) -->
        <div class="form-group">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <label style="margin: 0;">Columnas del tablero</label>
            <span id="board-col-count-text" class="form-helper-text"></span>
          </div>
          <p class="form-supporting-text">Gestiona los nombres, colores y orden de las columnas de trabajo.</p>
          <div id="board-modal-columns-list" class="modal-columns-list"></div>
          
          <div id="board-add-col-wrap" style="margin-top: 8px;">
            <button type="button" id="btn-show-add-col-box" class="btn-add-modal-col">
              <span>+</span> A\xF1adir columna
            </button>
            <div id="board-add-col-box" style="display: none; margin-top: 8px; padding: 10px; background: var(--kb-surface); border-radius: 8px; border: 1px solid var(--kb-border-subtle, rgba(255,255,255,0.08));">
              <div style="display: flex; gap: 8px; align-items: center;">
                <input id="new-col-name-input" class="form-input" type="text" placeholder="Nombre de columna\u2026" maxlength="30" style="height: 32px; font-size: 12.5px;" />
                <button type="button" id="btn-confirm-add-col" class="btn-primary" style="height: 32px; font-size: 12px; padding: 0 12px;">A\xF1adir</button>
                <button type="button" id="btn-cancel-add-col" class="btn-secondary" style="height: 32px; font-size: 12px; padding: 0 10px;">Cancelar</button>
              </div>
              <div id="new-col-palette" style="display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px;"></div>
            </div>
          </div>
        </div>

        <!-- Miembros del equipo habilitados para asignaci\xF3n -->
        <div class="form-group">
          <label>Miembros del equipo</label>
          <p class="form-supporting-text">Gestiona los miembros que podr\xE1n asignarse a las tareas de este tablero.</p>

          <!-- Input para agregar miembro manual o buscar -->
          <div class="discord-member-container" id="board-member-add-box">
            <div class="discord-member-input-wrap">
              <span class="member-icon" aria-hidden="true">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                </svg>
              </span>
              <input
                id="board-member-add-input"
                class="form-input discord-member-input"
                type="text"
                placeholder="Nombre, @usuario o ID de Discord\u2026"
                autocomplete="off"
                style="padding-right: 80px;"
              />
              <button type="button" id="btn-add-member-manual" class="btn-secondary" style="position: absolute; right: 4px; height: 26px; padding: 0 10px; font-size: 11.5px;">+ A\xF1adir</button>
            </div>
            <div id="board-member-dropdown" class="discord-member-dropdown" style="display: none;"></div>
          </div>

          <!-- Sugerencias r\xE1pidas de Discord -->
          <div id="board-member-suggestions" style="margin-top: 8px; display: flex; flex-wrap: wrap; gap: 6px; align-items: center;"></div>

          <!-- A\xF1adir por Roles de Discord -->
          <div id="board-role-picker-wrap" style="margin-top: 8px; display: none;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <span style="font-size: 11px; color: var(--kb-text-muted); font-weight: 600;">A\xF1adir por rol de Discord:</span>
            </div>
            <div id="board-role-chips" style="display: flex; gap: 6px; flex-wrap: wrap;"></div>
          </div>

          <!-- Lista de miembros agregados -->
          <div id="board-members-list" style="margin-top: 10px; display: flex; flex-wrap: wrap; gap: 6px; min-height: 32px;"></div>
        </div>

        <footer class="modal-actions">
          <div></div>
          <div class="modal-actions-right">
            <button id="btn-board-modal-cancel" class="btn-secondary" type="button">Cancelar</button>
            <button id="btn-board-modal-submit" class="btn-primary" type="submit">Guardar cambios</button>
          </div>
        </footer>
      </form>
    </div>
  `,document.body.appendChild(l);let w=l.querySelector("#board-modal-columns-list"),m=l.querySelector("#board-col-count-text"),v=l.querySelector("#btn-show-add-col-box"),L=l.querySelector("#board-add-col-box"),u=l.querySelector("#new-col-name-input"),k=l.querySelector("#btn-confirm-add-col"),A=l.querySelector("#btn-cancel-add-col"),T=l.querySelector("#new-col-palette"),B=O[0].color;function oe(){T&&(T.innerHTML=O.map(o=>`
      <button type="button" class="color-dot-btn ${o.color===B?"is-selected":""}" data-pick-new-col-color="${o.color}" style="width: 22px; height: 22px; border-radius: 50%; background: ${o.color}; border: none; cursor: pointer; outline: ${o.color===B?"2px solid #fff":"none"}; outline-offset: 2px;"></button>
    `).join(""),T.querySelectorAll("[data-pick-new-col-color]").forEach(o=>{o.addEventListener("click",()=>{B=o.dataset.pickNewColColor,oe()})}))}let E=null;function U(){w&&(m&&(m.textContent=`${n.length}/${5}`),v&&(v.style.display=n.length<5?"inline-flex":"none"),w.innerHTML=n.map((o,c)=>`
      <div class="modal-column-row" data-col-idx="${c}" draggable="true">
        <div class="modal-column-drag-handle" title="Arrastrar para reordenar" aria-label="Reordenar">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="8" cy="5" r="2"/>
            <circle cx="16" cy="5" r="2"/>
            <circle cx="8" cy="12" r="2"/>
            <circle cx="16" cy="12" r="2"/>
            <circle cx="8" cy="19" r="2"/>
            <circle cx="16" cy="19" r="2"/>
          </svg>
        </div>
        <span class="modal-column-dot" style="background: ${o.color||"#5865f2"};"></span>
        <input type="text" class="modal-column-input" value="${s(o.label)}" maxlength="30" data-col-input-idx="${c}" placeholder="Nombre de columna" />
        <button type="button" class="modal-column-btn btn-remove-col" data-remove-col-idx="${c}" ${n.length<=1?"disabled":""} title="Eliminar columna">\u2715</button>
      </div>
    `).join(""),w.querySelectorAll("[data-col-input-idx]").forEach(o=>{o.addEventListener("input",c=>{let i=Number(c.target.dataset.colInputIdx);n[i]&&(n[i].label=c.target.value)})}),w.querySelectorAll(".modal-column-row").forEach(o=>{o.addEventListener("dragstart",i=>{E=Number(o.dataset.colIdx),o.classList.add("is-dragging"),i.dataTransfer.effectAllowed="move",i.dataTransfer.setData("text/plain",String(E))}),o.addEventListener("dragend",()=>{E=null,o.classList.remove("is-dragging"),w.querySelectorAll(".modal-column-row").forEach(i=>i.classList.remove("is-drag-over"))}),o.addEventListener("dragover",i=>{i.preventDefault(),i.dataTransfer.dropEffect="move";let g=Number(o.dataset.colIdx);E!==null&&E!==g&&o.classList.add("is-drag-over")}),o.addEventListener("dragleave",()=>{o.classList.remove("is-drag-over")}),o.addEventListener("drop",i=>{i.preventDefault(),o.classList.remove("is-drag-over");let g=Number(o.dataset.colIdx);if(E!==null&&E!==g){let[f]=n.splice(E,1);n.splice(g,0,f),U()}});let c=o.querySelector(".modal-column-drag-handle");c&&(c.addEventListener("touchstart",()=>{E=Number(o.dataset.colIdx),o.classList.add("is-dragging")},{passive:!0}),c.addEventListener("touchmove",i=>{if(E===null)return;let g=i.touches[0],C=document.elementFromPoint(g.clientX,g.clientY)?.closest(".modal-column-row");w.querySelectorAll(".modal-column-row").forEach(p=>{p===C&&Number(p.dataset.colIdx)!==E?p.classList.add("is-drag-over"):p.classList.remove("is-drag-over")})},{passive:!0}),c.addEventListener("touchend",i=>{if(E!==null){let g=i.changedTouches[0],C=document.elementFromPoint(g.clientX,g.clientY)?.closest(".modal-column-row");if(C){let p=Number(C.dataset.colIdx);if(!isNaN(p)&&p!==E){let[P]=n.splice(E,1);n.splice(p,0,P)}}E=null,U()}}))}),w.querySelectorAll("[data-remove-col-idx]").forEach(o=>{o.addEventListener("click",()=>{let c=Number(o.dataset.removeColIdx);n.length>1&&(n.splice(c,1),U())})}))}v?.addEventListener("click",()=>{L&&(L.style.display="block"),v&&(v.style.display="none"),u&&(u.value="",u.focus()),B=O[n.length%O.length].color,oe()}),A?.addEventListener("click",()=>{L&&(L.style.display="none"),v&&(v.style.display=n.length<5?"inline-flex":"none")});function _(){let o=u?.value.trim();if(!o)return;if(n.length>=5){N(`M\xE1ximo ${5} columnas por tablero`,"error");return}let c=o.toLowerCase().replace(/[^a-z0-9_-]/g,"")||`col-${Date.now()}`,i=c,g=1;for(;n.some(f=>f.id===i);)i=`${c}-${g}`,g+=1;n.push({id:i,label:o,color:B}),L&&(L.style.display="none"),U()}k?.addEventListener("click",_),u?.addEventListener("keydown",o=>{o.key==="Enter"&&(o.preventDefault(),_())});let ne=l.querySelector("#board-members-list"),Z=l.querySelector("#board-member-suggestions"),F=l.querySelector("#board-member-add-input"),ee=l.querySelector("#btn-add-member-manual"),K=l.querySelector("#board-member-dropdown");function b(o){if(!o||!Array.isArray(o.roles)||!Array.isArray(te))return null;for(let c of te)if(o.roles.includes(c.id))return c;return null}function h(){if(ne){if(e.length===0){ne.innerHTML='<span class="form-helper-text">No hay miembros configurados. Se sugerir\xE1n los miembros del servidor.</span>';return}ne.innerHTML=e.map((o,c)=>{let i=G.find(f=>String(f.id)===String(o.id))||o,g=b(i);return`
      <div class="board-member-pill">
        ${o.avatarUrl?`<img src="${s(o.avatarUrl)}" alt="${s(o.name)}" style="width: 18px; height: 18px; border-radius: 50%; object-fit: cover; flex-shrink: 0;" />`:`<span class="member-avatar-mini">${s(ce(o.name))}</span>`}
        <span>${s(o.name)}</span>
        ${g?`<span style="font-size: 9.5px; font-weight: 600; color: ${g.color||"var(--kb-text-muted)"}; background: ${g.color?g.color+"22":"rgba(255,255,255,0.06)"}; padding: 1px 4px; border-radius: 3px;">@${s(g.name)}</span>`:""}
        <button type="button" class="board-member-pill-remove" data-remove-member-idx="${c}" title="Quitar miembro" aria-label="Quitar">\u2715</button>
      </div>
    `}).join(""),ne.querySelectorAll("[data-remove-member-idx]").forEach(o=>{o.addEventListener("click",c=>{c.stopPropagation();let i=Number(o.dataset.removeMemberIdx);e.splice(i,1),h(),I(),q()})})}}function I(){if(!Z)return;let o=new Set(e.map(i=>String(i.id||i.name).toLowerCase())),c=G.filter(i=>!o.has(String(i.id).toLowerCase())&&!o.has(i.name.toLowerCase()));if(c.length===0){Z.innerHTML="";return}Z.innerHTML=`
      <div style="display: flex; justify-content: space-between; align-items: center; width: 100%; margin-top: 4px;">
        <span style="font-size: 11px; color: var(--kb-text-muted);">Miembros del servidor (${c.length} disponibles):</span>
        ${c.length>1?'<button type="button" id="btn-add-all-server-members" class="btn-secondary" style="height: 22px; padding: 0 8px; font-size: 11px; border-radius: 6px; cursor: pointer;">+ A\xF1adir todos</button>':""}
      </div>
      <div style="display: flex; gap: 6px; flex-wrap: wrap; width: 100%; max-height: 120px; overflow-y: auto; padding: 2px 0;">
        ${c.map(i=>{let g=b(i);return`
          <button type="button" class="board-member-suggestion-btn" data-suggest-id="${s(i.id)}" data-suggest-name="${s(i.name)}" data-suggest-username="${s(i.username||"")}" data-suggest-avatar="${s(i.avatarUrl||"")}">
            ${i.avatarUrl?`<img src="${s(i.avatarUrl)}" alt="${s(i.name)}" style="width: 16px; height: 16px; border-radius: 50%; object-fit: cover;" />`:"<span>+</span>"}
            <span>${s(i.name)}</span>
            ${g?`<span style="font-size: 9.5px; font-weight: 600; color: ${g.color||"var(--kb-text-muted)"}; background: ${g.color?g.color+"22":"rgba(255,255,255,0.06)"}; padding: 1px 4px; border-radius: 3px;">@${s(g.name)}</span>`:""}
          </button>
        `}).join("")}
      </div>
    `,Z.querySelector("#btn-add-all-server-members")?.addEventListener("click",()=>{for(let i of c)e.push({id:i.id,name:i.name,username:i.username||"",avatarUrl:i.avatarUrl||null});h(),I(),q()}),Z.querySelectorAll("[data-suggest-id]").forEach(i=>{i.addEventListener("click",()=>{let g=i.dataset.suggestId,f=i.dataset.suggestName,C=i.dataset.suggestUsername,p=i.dataset.suggestAvatar||null;e.push({id:g,name:f,username:C,avatarUrl:p}),h(),I(),q()})})}function q(){let o=l.querySelector("#board-role-picker-wrap"),c=l.querySelector("#board-role-chips");if(!o||!c)return;if(!Array.isArray(te)||te.length===0){o.style.display="none";return}let i=new Set(e.map(f=>String(f.id||f.name).toLowerCase())),g=te.map(f=>{let C=G.filter(P=>Array.isArray(P.roles)&&P.roles.includes(f.id)),p=C.filter(P=>!i.has(String(P.id).toLowerCase())).length;return{role:f,total:C.length,unaddedCount:p,members:C}}).filter(f=>f.total>0);if(g.length===0){o.style.display="none";return}o.style.display="block",c.innerHTML=g.map(({role:f,total:C,unaddedCount:p})=>`
      <button type="button" class="board-role-btn" data-role-id="${s(f.id)}" ${p===0?"disabled":""} style="display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: var(--kb-radius-pill); font-size: 11.5px; font-weight: 600; background: var(--kb-surface); border: 1px solid ${f.color||"var(--kb-border-subtle)"}; color: ${f.color||"var(--kb-text-primary)"}; cursor: ${p===0?"default":"pointer"}; opacity: ${p===0?"0.45":"1"}; transition: all 0.12s ease;">
        <span>@${s(f.name)}</span>
        <span style="font-size: 10px; opacity: 0.85; padding: 1px 5px; border-radius: 8px; background: rgba(255,255,255,0.08);">${p>0?`+${p}`:"\u2713"}</span>
      </button>
    `).join(""),c.querySelectorAll("[data-role-id]").forEach(f=>{f.addEventListener("click",()=>{let C=f.dataset.roleId,p=g.find(Y=>Y.role.id===C);if(!p||p.unaddedCount===0)return;let P=0;for(let Y of p.members)i.has(String(Y.id).toLowerCase())||(e.push({id:Y.id,name:Y.name,username:Y.username||"",avatarUrl:Y.avatarUrl||null}),i.add(String(Y.id).toLowerCase()),P+=1);h(),I(),q(),N(`A\xF1adidos ${P} miembros con el rol @${p.role.name}`,"success")})})}function M(o){let c=String(o||"").trim();if(!c)return;let i=c.replace(/^@/,""),g=/^\d{17,20}$/.test(i);e.find(C=>C.name.toLowerCase()===i.toLowerCase()||C.id&&C.id===i)||(e.push({id:g?i:`m-${Date.now()}`,name:i,username:g?"":i}),h(),I(),q()),F&&(F.value=""),K&&(K.style.display="none")}ee?.addEventListener("click",()=>{M(F?.value)}),F?.addEventListener("keydown",o=>{o.key==="Enter"&&(o.preventDefault(),M(F.value))}),F?.addEventListener("input",o=>{let c=o.target.value.trim();if(!c||!K){K&&(K.style.display="none");return}let i=c.toLowerCase().replace(/^@/,""),g=new Set(e.map(p=>String(p.id||p.name).toLowerCase())),f=G.filter(p=>!g.has(String(p.id).toLowerCase())&&!g.has(p.name.toLowerCase())&&(p.name.toLowerCase().includes(i)||p.username&&p.username.toLowerCase().includes(i))),C="";f.length>0?C+=f.map(p=>`
        <button type="button" class="member-menu-item" data-pick-id="${s(p.id)}" data-pick-name="${s(p.name)}" data-pick-username="${s(p.username||"")}" data-pick-avatar="${s(p.avatarUrl||"")}">
          ${p.avatarUrl?`<img src="${s(p.avatarUrl)}" alt="${s(p.name)}" style="width: 22px; height: 22px; border-radius: 50%; object-fit: cover; flex-shrink: 0;" />`:`<span class="member-avatar-mini">${s(ce(p.name))}</span>`}
          <div class="member-info-col">
            <span class="member-name-text">${s(p.name)}</span>
            ${p.username?`<span class="member-handle-text">@${s(p.username)}</span>`:""}
          </div>
        </button>
      `).join(""):c&&(C='<div style="padding: 10px 12px; font-size: 12px; color: var(--kb-text-dim); text-align: center;">No se encontraron miembros del servidor que coincidan</div>'),K.innerHTML=C,K.style.display="flex",K.querySelectorAll("[data-pick-id]").forEach(p=>{p.addEventListener("click",()=>{let P=p.dataset.pickId,Y=p.dataset.pickName,Me=p.dataset.pickUsername,Ne=p.dataset.pickAvatar||null;e.push({id:P,name:Y,username:Me,avatarUrl:Ne}),h(),I(),q(),F&&(F.value=""),K.style.display="none"})})});function S(){l.remove()}if(l.querySelector("#btn-board-modal-close")?.addEventListener("click",S),l.querySelector("#btn-board-modal-cancel")?.addEventListener("click",S),l.addEventListener("click",o=>{o.target===l&&S()}),U(),h(),I(),q(),(G.length===0||te.length===0)&&Q){let o=J?.guildId?`?guild_id=${encodeURIComponent(J.guildId)}`:"";Promise.all([fetch(`/api/boards/${encodeURIComponent(Q)}/guild-members${o}`,{headers:{Accept:"application/json"}}).then(c=>c.json()).catch(()=>null),fetch(`/api/boards/${encodeURIComponent(Q)}/guild-roles${o}`,{headers:{Accept:"application/json"}}).then(c=>c.json()).catch(()=>null)]).then(([c,i])=>{Array.isArray(c?.members)&&c.members.length>0&&(G=c.members),Array.isArray(i?.roles)&&i.roles.length>0&&(te=i.roles),h(),I(),q()}).catch(()=>{})}l.querySelector("#board-settings-form")?.addEventListener("submit",async o=>{o.preventDefault();let c=l.querySelector("#board-name-input")?.value.trim();if(!c)return;let i=l.querySelector("#board-desc-input")?.value.trim()||"",g=l.querySelector("#btn-board-modal-submit");g&&(g.disabled=!0);try{let f=await he({name:c,description:i,columns:n,members:e});x&&(x={...x,name:c,description:i,members:e,columns:n}),S(),N("Tablero actualizado","success"),R(document.querySelector("#kanban-content"),x)}catch(f){console.error("Error guardando configuraci\xF3n del tablero:",f),N(f.message||"No se pudo guardar la configuraci\xF3n","error"),g&&(g.disabled=!1)}})}async function qe(){let a=new URLSearchParams;J?.guildId&&a.set("guild_id",J.guildId);let t=a.toString()?`?${a.toString()}`:"",e=await fetch(`/api/boards/${encodeURIComponent(Q)}${t}`,{headers:{Accept:"application/json"},cache:"no-store"});if(!e.ok)throw new Error(`HTTP ${e.status}`);let r=await e.json();return Array.isArray(r?.guildMembers)&&r.guildMembers.length>0&&(G=r.guildMembers),Array.isArray(r?.guildRoles)&&r.guildRoles.length>0&&(te=r.guildRoles),r}async function he(a){if(!D)throw new Error("Se requiere contexto de Activity");let t=await fetch(`/api/boards/${encodeURIComponent(Q)}`,{method:"PATCH",headers:{"Content-Type":"application/json","x-bardo-instance-id":D},body:JSON.stringify(a)});if(!t.ok){let e=await t.json().catch(()=>({}));throw new Error(e?.error||`Error al actualizar tablero (HTTP ${t.status})`)}return t.json()}async function $e(a){if(!D)throw new Error("Se requiere contexto de Activity");let t=await fetch(`/api/boards/${encodeURIComponent(Q)}/columns`,{method:"PATCH",headers:{"Content-Type":"application/json","x-bardo-instance-id":D},body:JSON.stringify({columns:a})});if(!t.ok)throw new Error(`Error al guardar columnas (HTTP ${t.status})`);return t.json()}async function Xe(a){if(!D)throw new Error("Se requiere contexto de Activity");let t=await fetch(`/api/boards/${encodeURIComponent(Q)}/tasks`,{method:"POST",headers:{"Content-Type":"application/json","x-bardo-instance-id":D},body:JSON.stringify(a)});if(!t.ok)throw new Error(`Error al crear tarea (HTTP ${t.status})`);return t.json()}async function ze(a,t){if(!D)throw new Error("Se requiere contexto de Activity");let e=await fetch(`/api/tasks/${encodeURIComponent(a)}`,{method:"PATCH",headers:{"Content-Type":"application/json","x-bardo-instance-id":D},body:JSON.stringify(t)});if(!e.ok)throw new Error(`Error al actualizar tarea (HTTP ${e.status})`);return e.json()}async function We(a){if(!D)throw new Error("Se requiere contexto de Activity");let t=await fetch(`/api/tasks/${encodeURIComponent(a)}`,{method:"DELETE",headers:{"x-bardo-instance-id":D}});if(!t.ok)throw new Error(`Error al borrar tarea (HTTP ${t.status})`);return t.json()}async function Le(a,t){if(!D){N("Sesi\xF3n de Activity no identificada","error");return}if(x?.tasks){let e=x.tasks.find(r=>r.id===a);e&&(e.status=t,R(document.querySelector("#kanban-content"),x))}try{await ze(a,{status:t}),await V(!1)}catch(e){console.error("Error al mover tarea:",e),N("No se pudo mover la tarea","error"),await V(!1)}}async function V(a=!1){if(me||!Q)return;me=!0;let t=document.querySelector("#btn-sync"),e=document.querySelector("#sync-indicator");a&&t&&t.classList.add("is-spinning"),e&&(e.textContent="Sincronizando\u2026");try{let r=await qe();x=r,!de&&!H&&R(document.querySelector("#kanban-content"),r),e&&(e.textContent="Actualizado")}catch(r){console.error("Error sincronizando tablero:",r),a&&N("Error al conectar con Bardo","error"),e&&(e.textContent="Sin conexi\xF3n")}finally{me=!1,t&&t.classList.remove("is-spinning")}}function Je(){be&&clearInterval(be),be=setInterval(()=>{document.visibilityState==="visible"&&!de&&!H&&V(!1)},7500),document.addEventListener("visibilitychange",()=>{document.visibilityState==="visible"&&V(!1)})}async function Qe(){let a=await _e();if(!a)return;Q=a;let t=Pe();try{let e=await qe();R(t,e),Je()}catch(e){console.error("No se pudo abrir el tablero:",e),t.className="kanban-state",t.innerHTML=`
      <strong>No pudimos abrir este tablero</strong>
      <p>Cierra esta vista y vuelve a abrirlo desde el mensaje de Bardo en Discord.</p>
    `}}Qe();
