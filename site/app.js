(() => {
  'use strict';

  const STORAGE_KEY = 'hotel-shift-planner-v2';
  const OLD_STORAGE_KEY = 'hotel-shift-planner';
  const DEFAULT_GROUPS = [
    {id:'Management',name:'Management',kind:'generic'},
    {id:'Passport',name:'Passport',kind:'generic'},
    {id:'Guest Relations',name:'Guest Relations',kind:'generic'},
    {id:'FD Supervisors',name:'FD Supervisors',kind:'generic'},
    {id:'FO Agents',name:'FO Agents',kind:'fo'},
    {id:'Night Team',name:'Night Team',kind:'night'},
    {id:'AYS Agents',name:'AYS Agents',kind:'generic'},
    {id:'Bellmen',name:'Bellmen',kind:'generic'}
  ];
  const DAY_NAMES = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];
  const MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
  const SHIFT_PRESETS = ['OFF','VAC','SICK','07:00-16:00','08:00-17:00','09:00-18:00','10:00-19:00','15:00-00:00','17:00-23:00','N 20:30-07:30','N 21:00-08:00'];

  const DEFAULT_EMPLOYEES = [
    ['Denis Pavlenko','Management','Rooms Operations Manager',40,60,true,false],
    ['Sviatoslav Vakhtin','Management','Front Office Manager',40,60,true,false],
    ['Anastasiya Popova','Management','Assistant Front Office Manager',40,60,true,false],
    ['Anastasiya Turysheva','Passport','Senior Passport Specialist',40,60,true,false],
    ['Tamara Shurygina','Passport','Passport Specialist',20,60,true,false],
    ['Valeriya Kochegarova','Guest Relations','Guest Relations Supervisor',40,60,false,false],
    ['Angelina Logunova','FD Supervisors','FD Supervisor',40,60,false,false],
    ['Daria Fimushkina','FD Supervisors','FD Supervisor',40,60,false,false],
    ['Daria Goncharova','FD Supervisors','FD Supervisor',40,60,false,false],
    ['Dilyara Valinurova','FO Agents','FO Agent',40,60,false,false],
    ['Elif Bezhko','FO Agents','FO Agent',40,60,false,false],
    ['Sofia Kharchenkova','FO Agents','FO Agent',40,60,false,false],
    ['Zlata Redko','FO Agents','FO Agent',40,60,false,false],
    ['Yaroslav Beloglazov','FO Agents','FO Agent',20,60,false,false],
    ['Danil Belzhanski','Night Team','FD Night Supervisor',40,0,false,true],
    ['Ivan Ekimov','Night Team','Night Agent',40,0,false,true],
    ['Vladislav Sadokhin','Night Team','Night Agent',40,0,false,true],
    ['Irina Boldyreva','Night Team','Night Agent',40,0,false,true],
    ['Elena Lagutkina','AYS Agents','AYS Agent',40,60,false,false],
    ['Aleksandra Drozhzhina','AYS Agents','AYS Agent',30,60,false,false],
    ['Viktoriya Ostrovskaya','AYS Agents','AYS Agent',40,60,false,false],
    ['Dilyara Valinurova (AYS)','AYS Agents','AYS Agent',20,60,false,false],
    ['Stanislav Esipov','Bellmen','Bellman',20,60,false,false],
    ['Gennadiy Kadyrov','Bellmen','Bellman',40,60,false,false],
    ['Nikita Belousov','Bellmen','Bellman',20,60,false,false],
  ].map((x,i)=>({id:`e${i+1}`,name:x[0],group:x[1],role:x[2],targetHours:x[3],breakMinutes:x[4],fixed:x[5],nightOnly:x[6],notes:''}));

  const SEPT_21_WISHES = {
    e10:'Нужны выходные в субботу и воскресенье.',
    e11:'По возможности выходные в период 22–26 сентября, приезжают родители.',
    e12:'В пятницу и субботу может начинать с 10:00.',
    e14:'Во вторник начать в 18:00. Выходные: среда и пятница. Можно сильнее загрузить субботу и воскресенье.',
    e18:'Не ставить смену в субботу, пожалуйста.'
  };

  const DEFAULT_SETTINGS = { foTarget:5, foMax:5, morningRequired:2, timeStep:30, view:'week' };

  function uid(){ return 'e'+Math.random().toString(36).slice(2,10); }
  function pad(n){ return String(n).padStart(2,'0'); }
  function dateKey(d){ return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
  function parseDateKey(k){ const [y,m,d]=k.split('-').map(Number); return new Date(y,m-1,d); }
  function addDays(d,n){ const x=new Date(d); x.setDate(x.getDate()+n); return x; }
  function mondayOf(d){ const x=new Date(d); const wd=x.getDay(); const delta=wd===0?-6:1-wd; x.setDate(x.getDate()+delta); x.setHours(12,0,0,0); return x; }
  function monthStart(d){ return new Date(d.getFullYear(),d.getMonth(),1,12); }
  function fmtDate(d){ return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0,3).toLowerCase()}`; }
  function hoursText(n){ return Number.isInteger(n)?String(n):n.toFixed(1).replace('.',','); }
  function round2(n){ return Math.round((n+Number.EPSILON)*100)/100; }

  function createDefaultState(){
    const today = new Date();
    const start = today.getFullYear()===2026 && today.getMonth()===8 ? new Date(2026,8,21,12) : mondayOf(today);
    return { version:3, groups:structuredClone(DEFAULT_GROUPS), employees:structuredClone(DEFAULT_EMPLOYEES), schedule:{}, wishes:{'2026-09-21':structuredClone(SEPT_21_WISHES)}, settings:{...DEFAULT_SETTINGS}, cursor:dateKey(start), view:'week' };
  }

  function loadState(){
    try{
      const raw=localStorage.getItem(STORAGE_KEY);
      if(raw){
        const parsed=JSON.parse(raw);
        const base=createDefaultState();
        const groups=Array.isArray(parsed.groups)&&parsed.groups.length ? parsed.groups : structuredClone(DEFAULT_GROUPS);
        (parsed.employees||[]).forEach(emp=>{
          if(emp.group&&!groups.some(g=>g.id===emp.group)) groups.push({id:emp.group,name:emp.group,kind:emp.group==='FO Agents'?'fo':emp.group==='Night Team'?'night':'generic'});
        });
        return {...base,...parsed,version:3,groups,settings:{...DEFAULT_SETTINGS,...parsed.settings}};
      }
    }catch(e){ console.warn(e); }
    return createDefaultState();
  }
  let state=loadState();
  function groupById(id){ return state.groups.find(g=>g.id===id); }
  function groupName(id){ return groupById(id)?.name || id || 'Без отдела'; }
  function groupKind(id){ return groupById(id)?.kind || 'generic'; }
  function groupEmployeeCount(id){ return state.employees.filter(e=>e.group===id).length; }
  function save(){ localStorage.setItem(STORAGE_KEY,JSON.stringify(state)); }

  function getEntry(empId,key){ return state.schedule[empId]?.[key] || {type:'empty',raw:''}; }
  function setEntry(empId,key,entry){
    state.schedule[empId] ||= {};
    if(entry.type==='empty') delete state.schedule[empId][key]; else state.schedule[empId][key]=entry;
    save();
  }

  function parseTime(t){ const [h,m]=t.split(':').map(Number); return h*60+m; }
  function normalizeTime(h,m){ return `${pad(h)}:${pad(m)}`; }
  function parseShiftInput(raw){
    const input=String(raw??'').trim();
    if(!input) return {type:'empty',raw:''};
    const up=input.toUpperCase();
    const statusMap={OFF:'off',VAC:'vac',SICK:'sick','ОТПУСК':'vac','БОЛЬНИЧНЫЙ':'sick'};
    if(statusMap[up]) return {type:statusMap[up],raw:up};
    const m=input.match(/^(?:(E|INN?|L|N)\s+)?(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})$/i);
    if(!m) return {type:'error',raw:input,error:'Формат: 08:00-17:00, N 20:30-07:30, OFF, VAC или SICK'};
    const code=(m[1]||'').toUpperCase();
    const sh=+m[2],sm=+m[3],eh=+m[4],em=+m[5];
    if(sh>23||eh>23||sm>59||em>59) return {type:'error',raw:input,error:'Некорректное время'};
    return {type:'shift',raw:input,code,start:normalizeTime(sh,sm),end:normalizeTime(eh,em)};
  }

  function rawShiftMinutes(entry){
    if(entry.type!=='shift') return 0;
    const s=parseTime(entry.start), e=parseTime(entry.end);
    return e<=s ? 1440-s+e : e-s;
  }

  function overlaps(a1,a2,b1,b2){ return Math.max(0,Math.min(a2,b2)-Math.max(a1,b1)); }
  function calculateHours(entry,emp){
    if(entry.type!=='shift') return {day:0,night:0,total:0,raw:0};
    const start=parseTime(entry.start); let end=parseTime(entry.end); if(end<=start) end+=1440;
    const raw=end-start;
    let dayMin=0;
    // Shift can span up to next day. Day windows 06-22 for day 0 and day 1.
    dayMin += overlaps(start,end,360,1320);
    dayMin += overlaps(start,end,1800,2760);
    let nightMin=raw-dayMin;
    let paidTotal;
    if(entry.code==='N') paidTotal=720; // user's N rule
    else paidTotal=Math.max(0,raw-(emp?.breakMinutes||0));
    let paidDay=Math.min(dayMin,paidTotal);
    let paidNight=Math.max(0,paidTotal-paidDay);
    // Preserve real night hours first if needed (matches spreadsheet behavior).
    paidNight=Math.min(nightMin,paidTotal);
    paidDay=Math.max(0,paidTotal-paidNight);
    return {day:round2(paidDay/60),night:round2(paidNight/60),total:round2(paidTotal/60),raw:round2(raw/60)};
  }

  function datesForView(){
    const cur=parseDateKey(state.cursor);
    if(state.view==='week'){
      const mon=mondayOf(cur); return Array.from({length:7},(_,i)=>addDays(mon,i));
    }
    const start=monthStart(cur); const n=new Date(start.getFullYear(),start.getMonth()+1,0).getDate();
    return Array.from({length:n},(_,i)=>new Date(start.getFullYear(),start.getMonth(),i+1,12));
  }
  function currentWeekKey(){ return dateKey(mondayOf(parseDateKey(state.cursor))); }
  function wishFor(empId){ return state.wishes?.[currentWeekKey()]?.[empId] || ''; }

  function employeeTotals(emp,dates){
    let day=0,night=0,total=0,days=0;
    dates.forEach(d=>{ const e=getEntry(emp.id,dateKey(d)); if(e.type==='shift'){ const h=calculateHours(e,emp);day+=h.day;night+=h.night;total+=h.total;days++; }});
    return {day:round2(day),night:round2(night),total:round2(total),days};
  }

  function activeAt(entry,minute){
    if(entry.type!=='shift') return false;
    const s=parseTime(entry.start), e=parseTime(entry.end);
    if(e<=s) return minute>=s || minute<e;
    return minute>=s && minute<e;
  }

  function coverageForDate(d){
    const key=dateKey(d); const fo=state.employees.filter(e=>groupKind(e.group)==='fo');
    let peak=0,peakAt=0,minCore=Infinity,avgCore=0,coreN=0,overMax=false;
    for(let m=0;m<1440;m+=state.settings.timeStep){
      const count=fo.filter(emp=>activeAt(getEntry(emp.id,key),m)).length;
      if(count>peak){peak=count;peakAt=m;} if(count>state.settings.foMax) overMax=true;
      if(m>=600&&m<1080){ minCore=Math.min(minCore,count);avgCore+=count;coreN++; }
    }
    if(minCore===Infinity) minCore=0; avgCore=coreN?avgCore/coreN:0;
    const starts7=fo.filter(e=>{const x=getEntry(e.id,key);return x.type==='shift'&&parseTime(x.start)===420}).length;
    const starts8=fo.filter(e=>{const x=getEntry(e.id,key);return x.type==='shift'&&parseTime(x.start)===480}).length;
    const morningOk=starts7>=2 || (starts7>=1&&starts8>=1);
    return {peak,peakAt,minCore,avgCore:round2(avgCore),overMax,morningOk,starts7,starts8};
  }

  function dayIssues(d){
    const issues=[]; const cov=coverageForDate(d); const key=dateKey(d);
    if(cov.overMax) issues.push({level:'bad',text:`${fmtDate(d)}: одновременно больше ${state.settings.foMax} FO Agents.`});
    if(!cov.morningOk) issues.push({level:'warn',text:`${fmtDate(d)}: утром нужно 07:00+08:00 или два сотрудника с 07:00.`});
    if(cov.peak<Math.max(1,state.settings.foTarget-1)) issues.push({level:'warn',text:`${fmtDate(d)}: пик FO только ${cov.peak}, цель около ${state.settings.foTarget}.`});
    state.employees.filter(e=>e.nightOnly||groupKind(e.group)==='night').forEach(emp=>{
      const x=getEntry(emp.id,key); if(x.type!=='shift') return;
      const raw=rawShiftMinutes(x); const h=calculateHours(x,emp);
      if(raw>0 && (parseTime(x.end)>parseTime(x.start) || h.night<6)) issues.push({level:'bad',text:`${emp.name}, ${fmtDate(d)}: ночной сотрудник получил не ночную смену.`});
    });
    return issues;
  }

  function shiftClass(entry,emp){
    if(entry.type==='empty') return 'empty'; if(['off','vac','sick','error'].includes(entry.type)) return entry.type;
    const h=calculateHours(entry,emp); if(h.night>0&&h.day>0)return 'mixed'; if(h.night>0)return 'night'; return 'day';
  }
  function entryDisplay(entry){
    if(entry.type==='empty') return {code:'',time:'·'};
    if(entry.type==='off')return {code:'OFF',time:''}; if(entry.type==='vac')return {code:'VAC',time:''}; if(entry.type==='sick')return {code:'SICK',time:''};
    if(entry.type==='error')return {code:'⚠',time:entry.raw};
    return {code:entry.code||'',time:`${entry.start}-${entry.end}`};
  }

  function esc(s){ return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function initials(name){ return name.split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase(); }
  function minutesLabel(m){ return `${pad(Math.floor(m/60)%24)}:${pad(m%60)}`; }

  const app=document.getElementById('app'); let search=''; let groupFilter='all'; let editorCtx=null; let drawerEmpId=null; let draggedEmpId=null;

  function render(){
    const dates=datesForView(); const cur=parseDateKey(state.cursor); const periodTitle=state.view==='week' ? `${fmtDate(dates[0])} — ${fmtDate(dates[dates.length-1])} ${dates[0].getFullYear()}` : `${MONTHS[cur.getMonth()]} ${cur.getFullYear()}`;
    const allIssues=state.view==='week'?dates.flatMap(dayIssues):[];
    const covs=state.view==='week'?dates.map(coverageForDate):[];
    const goodDays=covs.filter(c=>!c.overMax&&c.morningOk&&c.peak>=state.settings.foTarget-1).length;
    const foCount=state.employees.filter(e=>groupKind(e.group)==='fo').length;

    const filtered=state.employees.filter(e=>(groupFilter==='all'||e.group===groupFilter)&&(!search||(`${e.name} ${e.role}`).toLowerCase().includes(search.toLowerCase())));

    app.innerHTML=`
      <div class="app">
        <div class="topbar"><div class="topbar-inner">
          <div class="brand"><div class="brand-mark">H</div><div><h1>Hotel Shift Planner</h1><small>Локальный планировщик • данные остаются в браузере</small></div></div>
          <div class="top-actions">
            <button class="btn" data-act="export-json">Экспорт</button><button class="btn" data-act="import-json">Импорт</button><button class="btn" data-act="export-csv">CSV</button><button class="btn" data-act="print">Печать</button>
          </div>
        </div></div>
        <main class="container">
          <section class="grid-top">
            <div class="card card-pad period-card">
              <div class="period-title"><div class="nav-group"><button class="icon-btn" data-act="prev">‹</button><button class="icon-btn" data-act="today">●</button><button class="icon-btn" data-act="next">›</button></div><div><h2>${esc(periodTitle)}</h2><p>${state.view==='week'?'Недельное планирование и контроль покрытия':'Месячный график и часы'}</p></div></div>
              <div class="seg"><button class="${state.view==='week'?'active':''}" data-view="week">Неделя</button><button class="${state.view==='month'?'active':''}" data-view="month">Месяц</button></div>
            </div>
            <div class="card card-pad"><div class="kpis">
              <div class="kpi"><span>Сотрудники</span><strong>${state.employees.length}</strong></div><div class="kpi"><span>FO Agents</span><strong>${foCount}</strong></div>
              <div class="kpi ${goodDays===7?'good':goodDays>=4?'warn':'bad'}"><span>Дни в норме FO</span><strong>${state.view==='week'?`${goodDays}/7`:'—'}</strong></div><div class="kpi ${allIssues.some(x=>x.level==='bad')?'bad':allIssues.length?'warn':'good'}"><span>Проверки</span><strong>${state.view==='week'?allIssues.length:'—'}</strong></div>
            </div></div>
          </section>
          <div class="toolbar">
            <div class="search"><input id="searchInput" placeholder="Найти сотрудника…" value="${esc(search)}"></div>
            <select id="groupFilter" class="filter"><option value="all">Все отделы</option>${state.groups.map(g=>`<option value="${esc(g.id)}" ${groupFilter===g.id?'selected':''}>${esc(g.name)}</option>`).join('')}</select>
            <button class="btn primary" data-act="add-employee">+ Сотрудник</button>
            <button class="btn" data-act="groups">Отделы</button>
            ${state.view==='week'?`<button class="btn" data-act="copy-fixed">Копировать прошлую неделю для закреплённых</button>`:''}
            <button class="btn" data-act="fill-off">Пустые → OFF</button>
          </div>
          <section class="card schedule-card"><div class="table-wrap"><table class="schedule"><thead><tr><th class="employee-head">Сотрудник</th>${dates.map(d=>`<th class="day-head ${[0,6].includes(d.getDay())?'weekend-head':''}"><div>${DAY_NAMES[d.getDay()]}</div><div style="font-size:15px">${d.getDate()}</div></th>`).join('')}<th class="total-head">Днев.</th><th class="total-head">Ночн.</th><th class="total-head">Итого</th></tr></thead><tbody>${renderRows(filtered,dates)}</tbody></table></div></section>
          ${state.view==='week'?renderBottom(dates,covs,allIssues):''}
        </main>
        <div id="editor" class="editor hidden"></div>
        <div id="drawerBackdrop" class="drawer-backdrop"><div class="drawer" id="drawer"></div></div>
        <div id="toast" class="toast"></div><input id="fileInput" type="file" accept="application/json" style="display:none">
      </div>`;
    bindEvents();
  }

  function renderRows(emps,dates){
    let html='';
    const groups=state.groups.length?state.groups:[{id:'ungrouped',name:'Без отдела',kind:'generic'}];
    for(const group of groups){
      const list=emps.filter(e=>e.group===group.id); if(!list.length)continue;
      const kindLabel=group.kind==='fo'?'FO · лимит':group.kind==='night'?'ночная группа':'';
      html+=`<tr class="group-row" data-drop-group="${esc(group.id)}"><td colspan="${dates.length+4}"><div class="group-title"><span>${esc(group.name)} <b>${list.length}</b>${kindLabel?` <em>${esc(kindLabel)}</em>`:''}</span><span class="group-drop-note">перетащите сотрудника сюда</span></div></td></tr>`;
      for(const emp of list){
        const totals=employeeTotals(emp,dates); const delta=round2(totals.total-emp.targetHours); const deltaClass=Math.abs(delta)<=1?'target-ok':delta<0?'target-under':'target-over'; const wish=wishFor(emp.id);
        html+=`<tr class="employee-row" data-drop-emp="${emp.id}" data-employee-group="${esc(group.id)}"><td class="employee-cell"><div class="employee-main"><button class="drag-handle" draggable="true" data-drag-emp="${emp.id}" title="Перетащить сотрудника">⋮⋮</button><div class="avatar">${esc(initials(emp.name))}</div><div class="emp-text"><div class="emp-name">${esc(emp.name)}</div><div class="emp-role">${esc(emp.role)}</div></div><div class="emp-badges">${emp.fixed?'<span class="badge fixed">FIX</span>':''}${emp.nightOnly?'<span class="badge night">NIGHT</span>':''}${wish?`<span class="badge wish" data-wish="${emp.id}" title="${esc(wish)}">♥</span>`:''}<button class="btn ghost" style="padding:3px 5px" data-edit-emp="${emp.id}">⋯</button></div></div></td>`;
        for(const d of dates){ const key=dateKey(d),entry=getEntry(emp.id,key),disp=entryDisplay(entry),cls=shiftClass(entry,emp); html+=`<td class="shift-cell ${[0,6].includes(d.getDay())?'weekend-cell':''}"><button class="shift-btn ${cls}" data-cell="${emp.id}|${key}" title="${entry.type==='error'?esc(entry.error):''}"><span class="code">${esc(disp.code)}</span><span class="time">${esc(disp.time)}</span></button></td>`; }
        html+=`<td class="total-cell">${hoursText(totals.day)}<small>день</small></td><td class="total-cell">${hoursText(totals.night)}<small>ночь</small></td><td class="total-cell ${deltaClass}">${hoursText(totals.total)}<small>${delta===0?'норма':`${delta>0?'+':''}${hoursText(delta)} ч`}</small></td></tr>`;
      }
    }
    if(!html) html=`<tr><td class="empty-state" colspan="${dates.length+4}">Ничего не найдено</td></tr>`;
    return html;
  }

  function renderBottom(dates,covs,issues){
    const weeklyRows=state.employees.map(emp=>{const t=employeeTotals(emp,dates);const d=round2(t.total-emp.targetHours);return `<div class="hours-row"><div class="nm">${esc(emp.name)}</div><div class="num">${hoursText(t.day)}</div><div class="num">${hoursText(t.night)}</div><div class="num"><b>${hoursText(t.total)}</b></div><div class="num delta ${Math.abs(d)<=1?'ok':d<0?'under':'over'}">${d>0?'+':''}${hoursText(d)}</div></div>`}).join('');
    return `<section class="bottom-grid">
      <div class="card coverage-card"><div class="card-title"><div><h3>Покрытие FO Agents</h3><p>Цель ≈ ${state.settings.foTarget}, максимум ${state.settings.foMax}; утром 07:00+08:00 или два с 07:00</p></div><button class="btn" data-act="settings">Настройки</button></div>
        <div class="coverage-days">${dates.map((d,i)=>{const c=covs[i];const lvl=c.overMax?'bad':(!c.morningOk||c.peak<state.settings.foTarget-1)?'warn':'good';return `<div class="coverage-day ${lvl}"><div class="dtop"><span>${DAY_NAMES[d.getDay()]} ${d.getDate()}</span><strong>${c.peak}/${state.settings.foMax}</strong></div><div class="meter"><span style="width:${Math.min(100,c.peak/state.settings.foMax*100)}%"></span></div><div class="cmeta">Пик ${minutesLabel(c.peakAt)} · 07:00: ${c.starts7} · 08:00: ${c.starts8}<br>Среднее 10–18: ${c.avgCore}</div></div>`}).join('')}</div>
        <div class="issues">${issues.length?issues.slice(0,12).map(x=>`<div class="issue ${x.level}">${esc(x.text)}</div>`).join(''):'<div class="issue good">Проверки недели пройдены: превышения лимита и явных нарушений нет.</div>'}</div>
      </div>
      <div class="card hours-card"><div class="card-title"><div><h3>Часы за неделю</h3><p>Перерыв вычитается по настройке сотрудника; код N = 12 ч</p></div></div><div class="hours-list"><div class="hours-row head"><div>Сотрудник</div><div class="num">Дн.</div><div class="num">Ноч.</div><div class="num">Всего</div><div class="num">± норма</div></div>${weeklyRows}</div></div>
    </section>`;
  }

  function bindEvents(){
    document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{state.view=b.dataset.view;state.cursor=dateKey(state.view==='week'?mondayOf(parseDateKey(state.cursor)):monthStart(parseDateKey(state.cursor)));save();render();});
    document.querySelectorAll('[data-act]').forEach(b=>b.onclick=()=>handleAction(b.dataset.act));
    document.querySelectorAll('[data-cell]').forEach(b=>b.onclick=e=>openEditor(b,e));
    document.querySelectorAll('[data-edit-emp]').forEach(b=>b.onclick=e=>{e.stopPropagation();openEmployeeDrawer(b.dataset.editEmp);});
    document.querySelectorAll('[data-wish]').forEach(b=>b.onclick=e=>{e.stopPropagation();openEmployeeDrawer(b.dataset.wish);});
    bindEmployeeDragAndDrop();
    const s=document.getElementById('searchInput'); if(s)s.oninput=e=>{search=e.target.value;render();setTimeout(()=>{const n=document.getElementById('searchInput');if(n){n.focus();n.setSelectionRange(n.value.length,n.value.length)}},0)};
    const gf=document.getElementById('groupFilter'); if(gf)gf.onchange=e=>{groupFilter=e.target.value;render();};
    const fi=document.getElementById('fileInput'); if(fi)fi.onchange=importFile;
    document.getElementById('drawerBackdrop').onclick=e=>{if(e.target.id==='drawerBackdrop')closeDrawer();};
    document.addEventListener('keydown',globalKeyOnce,{once:true});
  }
  function globalKeyOnce(e){ if(e.key==='Escape'){closeEditor();closeDrawer();} document.addEventListener('keydown',globalKeyOnce,{once:true}); }

  function handleAction(act){
    const cur=parseDateKey(state.cursor);
    if(act==='prev'){state.cursor=dateKey(state.view==='week'?addDays(mondayOf(cur),-7):new Date(cur.getFullYear(),cur.getMonth()-1,1,12));save();render();}
    else if(act==='next'){state.cursor=dateKey(state.view==='week'?addDays(mondayOf(cur),7):new Date(cur.getFullYear(),cur.getMonth()+1,1,12));save();render();}
    else if(act==='today'){state.cursor=dateKey(new Date());save();render();}
    else if(act==='add-employee')openEmployeeDrawer(null);
    else if(act==='groups')openGroupsDrawer();
    else if(act==='settings')openSettingsDrawer();
    else if(act==='print')window.print();
    else if(act==='export-json')exportJson();
    else if(act==='import-json')document.getElementById('fileInput').click();
    else if(act==='export-csv')exportCsv();
    else if(act==='fill-off')fillOff();
    else if(act==='copy-fixed')copyFixedWeek();
  }

  function openEditor(btn,ev){
    const [empId,key]=btn.dataset.cell.split('|'); const emp=state.employees.find(x=>x.id===empId); const entry=getEntry(empId,key); const ed=document.getElementById('editor'); const r=btn.getBoundingClientRect(); const width=310; let left=Math.min(window.innerWidth-width-12,Math.max(12,r.left)); let top=Math.min(window.innerHeight-270,Math.max(12,r.bottom+6));
    editorCtx={empId,key}; ed.style.left=`${left}px`;ed.style.top=`${top}px`;ed.classList.remove('hidden');
    ed.innerHTML=`<div class="editor-title"><span>${esc(emp.name)} · ${esc(fmtDate(parseDateKey(key)))}</span><button class="btn ghost" id="closeEditor" style="padding:0 5px">×</button></div><input id="shiftInput" value="${esc(entry.raw||entryDisplay(entry).time)}" placeholder="08:00-17:00"><div class="quick">${SHIFT_PRESETS.map(x=>`<button data-preset="${esc(x)}">${esc(x)}</button>`).join('')}</div><div class="editor-error" id="editorError">${entry.type==='error'?esc(entry.error):''}</div><div class="editor-hint">Можно вводить E/IN/L/N перед временем. Enter — сохранить, Esc — закрыть.</div>`;
    document.getElementById('closeEditor').onclick=closeEditor; document.querySelectorAll('[data-preset]').forEach(x=>x.onclick=()=>{const i=document.getElementById('shiftInput');i.value=x.dataset.preset;commitEditor();}); const input=document.getElementById('shiftInput');input.focus();input.select();input.onkeydown=e=>{if(e.key==='Enter')commitEditor();if(e.key==='Escape')closeEditor();};
  }
  function commitEditor(){ if(!editorCtx)return;const input=document.getElementById('shiftInput');const parsed=parseShiftInput(input.value);if(parsed.type==='error'){document.getElementById('editorError').textContent=parsed.error;return;} setEntry(editorCtx.empId,editorCtx.key,parsed);closeEditor();render(); }
  function closeEditor(){const ed=document.getElementById('editor');if(ed)ed.classList.add('hidden');editorCtx=null;}

  function openEmployeeDrawer(empId){
    closeEditor(); drawerEmpId=empId; const emp=empId?state.employees.find(e=>e.id===empId):{id:'',name:'',group:'FO Agents',role:'FO Agent',targetHours:40,breakMinutes:60,fixed:false,nightOnly:false,notes:''}; const wish=empId?wishFor(empId):''; const back=document.getElementById('drawerBackdrop');back.classList.add('open'); const dr=document.getElementById('drawer');
    dr.innerHTML=`<h2>${empId?'Сотрудник':'Новый сотрудник'}</h2><div class="form-grid">
      <div class="field full"><label>Имя</label><input id="empName" value="${esc(emp.name)}"></div><div class="field"><label>Отдел</label><select id="empGroup">${state.groups.map(g=>`<option value="${esc(g.id)}" ${emp.group===g.id?'selected':''}>${esc(g.name)}</option>`).join('')}</select></div><div class="field"><label>Должность</label><input id="empRole" value="${esc(emp.role)}"></div>
      <div class="field"><label>Норма, ч/нед</label><input id="empTarget" type="number" min="0" step="1" value="${emp.targetHours}"></div><div class="field"><label>Перерыв, мин</label><input id="empBreak" type="number" min="0" step="15" value="${emp.breakMinutes}"></div>
      <div class="field full"><label class="check"><input id="empFixed" type="checkbox" ${emp.fixed?'checked':''}> Закреплённый график (для копирования прошлой недели)</label></div><div class="field full"><label class="check"><input id="empNight" type="checkbox" ${emp.nightOnly?'checked':''}> Только ночные смены</label></div>
      <div class="field full"><label>Постоянная заметка</label><textarea id="empNotes">${esc(emp.notes||'')}</textarea></div><div class="field full"><label>Пожелание на неделю ${esc(currentWeekKey())}</label><textarea id="empWish">${esc(wish)}</textarea></div>
    </div><div class="drawer-actions">${empId?'<button class="btn danger" id="deleteEmp">Удалить</button>':''}<button class="btn" id="cancelEmp">Отмена</button><button class="btn primary" id="saveEmp">Сохранить</button></div>`;
    document.getElementById('cancelEmp').onclick=closeDrawer;document.getElementById('saveEmp').onclick=saveEmployeeDrawer;if(empId)document.getElementById('deleteEmp').onclick=deleteEmployee;
  }
  function saveEmployeeDrawer(){
    const obj={id:drawerEmpId||uid(),name:document.getElementById('empName').value.trim(),group:document.getElementById('empGroup').value,role:document.getElementById('empRole').value.trim(),targetHours:+document.getElementById('empTarget').value||0,breakMinutes:+document.getElementById('empBreak').value||0,fixed:document.getElementById('empFixed').checked,nightOnly:document.getElementById('empNight').checked,notes:document.getElementById('empNotes').value.trim()}; if(!obj.name){toast('Укажите имя');return;}
    if(drawerEmpId){ const i=state.employees.findIndex(e=>e.id===drawerEmpId); state.employees[i]=obj; } else state.employees.push(obj);
    state.wishes[currentWeekKey()] ||= {}; const w=document.getElementById('empWish').value.trim(); if(w)state.wishes[currentWeekKey()][obj.id]=w;else delete state.wishes[currentWeekKey()][obj.id]; save();closeDrawer();render();
  }
  function deleteEmployee(){ if(!drawerEmpId||!confirm('Удалить сотрудника и его график?'))return;state.employees=state.employees.filter(e=>e.id!==drawerEmpId);delete state.schedule[drawerEmpId];Object.values(state.wishes).forEach(w=>delete w[drawerEmpId]);save();closeDrawer();render(); }
  function closeDrawer(){const b=document.getElementById('drawerBackdrop');if(b)b.classList.remove('open');drawerEmpId=null;}

  function clearDragState(){
    document.querySelectorAll('.drag-over,.dragging').forEach(el=>el.classList.remove('drag-over','dragging'));
  }
  function bindEmployeeDragAndDrop(){
    document.querySelectorAll('[data-drag-emp]').forEach(handle=>{
      handle.ondragstart=e=>{ draggedEmpId=handle.dataset.dragEmp; e.dataTransfer.effectAllowed='move'; e.dataTransfer.setData('text/plain',draggedEmpId); handle.closest('tr')?.classList.add('dragging'); };
      handle.ondragend=()=>{draggedEmpId=null;clearDragState();};
    });
    document.querySelectorAll('[data-drop-group]').forEach(row=>{
      row.ondragover=e=>{e.preventDefault();e.dataTransfer.dropEffect='move';clearDragState();row.classList.add('drag-over');};
      row.ondragleave=()=>row.classList.remove('drag-over');
      row.ondrop=e=>{e.preventDefault();const id=draggedEmpId||e.dataTransfer.getData('text/plain');moveEmployee(id,row.dataset.dropGroup,null);};
    });
    document.querySelectorAll('[data-drop-emp]').forEach(row=>{
      row.ondragover=e=>{e.preventDefault();e.dataTransfer.dropEffect='move';clearDragState();row.classList.add('drag-over');};
      row.ondragleave=()=>row.classList.remove('drag-over');
      row.ondrop=e=>{e.preventDefault();const id=draggedEmpId||e.dataTransfer.getData('text/plain');moveEmployee(id,row.dataset.employeeGroup,row.dataset.dropEmp);};
    });
  }
  function moveEmployee(empId,groupId,beforeId){
    if(!empId||!groupId||empId===beforeId)return;
    const from=state.employees.findIndex(e=>e.id===empId); if(from<0)return;
    const emp=state.employees.splice(from,1)[0]; emp.group=groupId;
    if(beforeId){ const target=state.employees.findIndex(e=>e.id===beforeId); state.employees.splice(target<0?state.employees.length:target,0,emp); }
    else { let insert=state.employees.length; for(let i=state.employees.length-1;i>=0;i--){if(state.employees[i].group===groupId){insert=i+1;break;}} state.employees.splice(insert,0,emp); }
    draggedEmpId=null; save(); render(); toast(`${emp.name} → ${groupName(groupId)}`);
  }

  function openGroupsDrawer(){
    closeEditor(); drawerEmpId=null; const back=document.getElementById('drawerBackdrop');back.classList.add('open'); const dr=document.getElementById('drawer');
    dr.innerHTML=`<h2>Отделы и группы</h2><p class="drawer-lead">Создавайте отделы и перетаскивайте сотрудников между ними прямо в таблице за ручку ⋮⋮.</p><div class="group-editor">${state.groups.map((g,i)=>`<div class="group-edit-row"><div class="group-move"><button class="btn ghost" data-group-move="${esc(g.id)}|-1" ${i===0?'disabled':''}>↑</button><button class="btn ghost" data-group-move="${esc(g.id)}|1" ${i===state.groups.length-1?'disabled':''}>↓</button></div><div class="field"><label>Название</label><input data-group-name="${esc(g.id)}" value="${esc(g.name)}"></div><div class="field"><label>Тип</label><select data-group-kind="${esc(g.id)}"><option value="generic" ${g.kind==='generic'?'selected':''}>Обычный отдел</option><option value="fo" ${g.kind==='fo'?'selected':''}>FO · участвует в лимите</option><option value="night" ${g.kind==='night'?'selected':''}>Ночная группа</option></select></div><div class="group-count">${groupEmployeeCount(g.id)} чел.</div><button class="btn danger mini" data-group-delete="${esc(g.id)}" ${groupEmployeeCount(g.id)?'disabled title="Сначала перенесите сотрудников"':''}>Удалить</button></div>`).join('')}</div><div class="group-add"><input id="newGroupName" placeholder="Название нового отдела"><button class="btn primary" id="addGroupBtn">+ Добавить отдел</button></div><div class="drawer-actions"><button class="btn" id="cancelGroups">Закрыть</button><button class="btn primary" id="saveGroups">Сохранить названия</button></div>`;
    document.getElementById('cancelGroups').onclick=closeDrawer;
    document.getElementById('saveGroups').onclick=saveGroupsDrawer;
    document.getElementById('addGroupBtn').onclick=addGroupFromDrawer;
    document.querySelectorAll('[data-group-delete]').forEach(b=>b.onclick=()=>deleteGroup(b.dataset.groupDelete));
    document.querySelectorAll('[data-group-move]').forEach(b=>b.onclick=()=>{const [id,delta]=b.dataset.groupMove.split('|');moveGroup(id,+delta);});
  }
  function saveGroupsDrawer(){
    state.groups.forEach(g=>{const n=document.querySelector(`[data-group-name="${CSS.escape(g.id)}"]`);const k=document.querySelector(`[data-group-kind="${CSS.escape(g.id)}"]`);if(n?.value.trim())g.name=n.value.trim();if(k)g.kind=k.value;});
    save();closeDrawer();render();toast('Отделы сохранены');
  }
  function addGroupFromDrawer(){
    const input=document.getElementById('newGroupName'); const name=input.value.trim(); if(!name){toast('Введите название отдела');return;}
    const id='g_'+Math.random().toString(36).slice(2,9); state.groups.push({id,name,kind:'generic'}); save();openGroupsDrawer();
  }
  function deleteGroup(id){
    if(groupEmployeeCount(id)>0){toast('Сначала перенесите сотрудников из отдела');return;} if(!confirm(`Удалить отдел «${groupName(id)}»?`))return;
    state.groups=state.groups.filter(g=>g.id!==id); if(groupFilter===id)groupFilter='all';save();openGroupsDrawer();render();
  }
  function moveGroup(id,delta){
    const i=state.groups.findIndex(g=>g.id===id),j=i+delta;if(i<0||j<0||j>=state.groups.length)return;[state.groups[i],state.groups[j]]=[state.groups[j],state.groups[i]];save();openGroupsDrawer();render();
  }

  function openSettingsDrawer(){
    const back=document.getElementById('drawerBackdrop');back.classList.add('open'); const dr=document.getElementById('drawer');dr.innerHTML=`<h2>Правила покрытия</h2><div class="form-grid"><div class="field"><label>Цель FO одновременно</label><input id="sTarget" type="number" min="1" value="${state.settings.foTarget}"></div><div class="field"><label>Максимум FO</label><input id="sMax" type="number" min="1" value="${state.settings.foMax}"></div><div class="field"><label>Утром сотрудников</label><input id="sMorning" type="number" min="1" value="${state.settings.morningRequired}"></div><div class="field"><label>Шаг проверки, мин</label><select id="sStep"><option ${state.settings.timeStep===15?'selected':''}>15</option><option ${state.settings.timeStep===30?'selected':''}>30</option><option ${state.settings.timeStep===60?'selected':''}>60</option></select></div></div><div class="wish-box">Текущее утреннее правило: либо два FO Agents начинают в 07:00, либо один в 07:00 и один в 08:00. Night Team проверяется отдельно и не входит в лимит FO.</div><div class="drawer-actions"><button class="btn" id="cancelSet">Отмена</button><button class="btn primary" id="saveSet">Сохранить</button></div>`;
    document.getElementById('cancelSet').onclick=closeDrawer;document.getElementById('saveSet').onclick=()=>{state.settings.foTarget=+document.getElementById('sTarget').value||5;state.settings.foMax=+document.getElementById('sMax').value||5;state.settings.morningRequired=+document.getElementById('sMorning').value||2;state.settings.timeStep=+document.getElementById('sStep').value||30;save();closeDrawer();render();};
  }

  function fillOff(){ if(!confirm('Все пустые ячейки текущего периода заменить на OFF?'))return;const dates=datesForView();state.employees.forEach(emp=>dates.forEach(d=>{const k=dateKey(d);if(getEntry(emp.id,k).type==='empty')setEntry(emp.id,k,{type:'off',raw:'OFF'});}));save();render(); }
  function copyFixedWeek(){
    if(state.view!=='week')return; if(!confirm('Скопировать смены закреплённых сотрудников из предыдущей недели?'))return; const mon=mondayOf(parseDateKey(state.cursor));state.employees.filter(e=>e.fixed).forEach(emp=>{for(let i=0;i<7;i++){const src=dateKey(addDays(mon,i-7)),dst=dateKey(addDays(mon,i));const x=getEntry(emp.id,src);if(x.type!=='empty')setEntry(emp.id,dst,structuredClone(x));}});save();render();toast('Закреплённые строки скопированы');
  }

  function exportJson(){download(`hotel-shift-planner-${state.cursor}.json`,JSON.stringify(state,null,2),'application/json');}
  function exportCsv(){const dates=datesForView();const rows=[['Сотрудник','Отдел',...dates.map(d=>dateKey(d)),'Дневные','Ночные','Итого']];state.employees.forEach(emp=>{const t=employeeTotals(emp,dates);rows.push([emp.name,groupName(emp.group),...dates.map(d=>getEntry(emp.id,dateKey(d)).raw||''),t.day,t.night,t.total]);});download(`schedule-${state.cursor}.csv`,rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(';')).join('\n'),'text/csv;charset=utf-8');}
  function download(name,text,type){const b=new Blob([text],{type});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
  function importFile(e){const f=e.target.files?.[0];if(!f)return;const r=new FileReader();r.onload=()=>{try{const v=JSON.parse(r.result);if(!v.employees||!v.schedule)throw 0;state={...createDefaultState(),...v,groups:Array.isArray(v.groups)&&v.groups.length?v.groups:structuredClone(DEFAULT_GROUPS),settings:{...DEFAULT_SETTINGS,...v.settings}};(state.employees||[]).forEach(emp=>{if(emp.group&&!state.groups.some(g=>g.id===emp.group))state.groups.push({id:emp.group,name:emp.group,kind:emp.group==='FO Agents'?'fo':emp.group==='Night Team'?'night':'generic'});});save();render();toast('Данные импортированы');}catch{alert('Не удалось прочитать файл экспорта.');}};r.readAsText(f);e.target.value='';}
  let toastTimer; function toast(text){const t=document.getElementById('toast');if(!t)return;t.textContent=text;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),2200);}

  render();
})();
