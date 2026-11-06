(async function(){
  'use strict';
  var T=ArkTransport,admin=T.admin,root=document.getElementById('app'),data=null,view='roster',summaryRarity='',searchOpen=false,filters={query:'',rarity:'',job:'',sort:'level'},dialog=null,selected=null,draft=null,saving=false,dirty=false,remainingUntil=Number(T.storage.get(T.demo?'ark_demo_ct':'ark_ct')||0);
  var rosterSearch,renderedOperators=null,stampFormat,cooldownTimer;
  var icons={support:'<circle cx="12" cy="9" r="3.5"/><path d="M5 11V8a7 7 0 0 1 14 0v5a3 3 0 0 1-3 3h-3M4 22v-2a5 5 0 0 1 5-5m6 1a5 5 0 0 1 5 4v2"/><rect x="3" y="8" width="3" height="5" rx="1"/><rect x="18" y="8" width="3" height="5" rx="1"/>',list:'<path d="M9 6h12M9 12h12M9 18h12M3 6h.01M3 12h.01M3 18h.01"/>',chart:'<path d="M4 20V10m8 10V4m8 16v-7"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',refresh:'<path d="M20 7v5h-5M4 17v-5h5"/><path d="M19 11a7 7 0 0 0-12-6L4 8m1 5a7 7 0 0 0 12 6l3-3"/>',arrow:'<path d="m9 5 7 7-7 7"/>',close:'<path d="m6 6 12 12M18 6 6 18"/>',check:'<path d="m5 12 4 4L19 6"/>',send:'<path d="m21 3-7 18-4-7-7-4 18-7ZM10 14 21 3"/>',lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4"/>',edit:'<path d="m14 4 6 6M4 20l4-1L21 6l-4-4L4 15v5Z"/>',menu:'<path d="M4 6h16M4 12h16M4 18h16"/>'};
  function icon(n){return '<svg viewBox="0 0 24 24" aria-hidden="true">'+(n==='support'?'<use href="#ark-support-icon"/>':icons[n]||icons.list)+'</svg>';}
  function e(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function n(v){return v==null?'—':e(v);}
  function percent(a,b){return b?(a/b*100).toFixed(1)+'%':'—';}
  function stamp(date){
    if(!date)return '—';
    var d=new Date(date);
    if(Number.isNaN(+d))return e(date);
    if(!stampFormat)stampFormat=new Intl.DateTimeFormat('ja-JP',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Tokyo'});
    return stampFormat.format(d);
  }
  function toast(message){var el=document.getElementById('toast');el.textContent=message;el.hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.hidden=true,4000);}
  var menuMedia=window.matchMedia('(min-width:761px)'),menuAnimation=null,menuVersion=0,menuWanted=false;
  var headerObserver,menuDialog=null,ownedDialog=null,importDialog=null,importPlan=null,importBusy=false;
  function observeHeader(){
    if(headerObserver)headerObserver.disconnect();
    var header=document.querySelector('.site-header');
    function measure(){
      document.documentElement.style.setProperty('--mobile-header-height',header.getBoundingClientRect().height+'px');
      var region=document.querySelector('.roster-scroll');
      if(region)region.tabIndex=window.matchMedia('(max-width:760px)').matches?-1:0;
    }
    measure();headerObserver=new ResizeObserver(measure);headerObserver.observe(header);
  }
  function shell(initialRows){
    menuVersion++;if(menuAnimation)menuAnimation.cancel();menuAnimation=null;menuWanted=false;
    root.querySelectorAll('dialog[open]').forEach(el=>el.close());restoreModalScroll();
    var menuItems=[['roster',admin?'育成を記録':'オペレーター','list'],['summary','統計','chart'],['history','リクエスト履歴','clock']];
    var supportIcon=admin?'':'<svg aria-hidden="true" style="position:absolute;width:0;height:0"><defs><g id="ark-support-icon">'+icons.support+'</g></defs></svg>';
    root.innerHTML=supportIcon+'<div class="shell'+(admin?' admin-shell':'')+'"><header class="site-header"><div class="brand"><button class="icon-button menu-toggle" id="open-menu" aria-label="メニューを開く" aria-controls="navigation-dialog" aria-haspopup="dialog" aria-expanded="false">'+icon('menu')+'</button><div><div class="brand-name">OPERATOR</div><div class="brand-sub">ROSTER</div></div></div><div class="top-actions">'+(admin&&T.importPreview?'<button class="text-button wiki-import-button" id="wiki-import" title="Wikiから新規オペレーターを取得" aria-label="Wikiから新規オペレーターを取得">取得</button>':'')+(T.logout?'<button class="icon-button" id="logout" aria-label="ログアウト" title="ログアウト">'+icon('lock')+'</button>':'')+'<button class="icon-button" id="toggle-search" aria-label="検索" aria-controls="search-panel" aria-expanded="false">'+icon('search')+'</button><button class="icon-button" id="refresh" aria-label="最新の記録に更新">'+icon('refresh')+'</button></div></header><main class="main" id="main"><div id="screen"></div></main></div><dialog class="dialog nav-dialog" id="navigation-dialog" aria-labelledby="navigation-title"><div class="nav-dialog-heading"><h2 id="navigation-title">メニュー</h2><button class="icon-button" id="close-menu" aria-label="メニューを閉じる">'+icon('close')+'</button></div><nav class="navigation" aria-label="メインメニュー">'+menuItems.map(([key,label,ic])=>'<button class="nav-item" data-view="'+key+'" '+(key===view?'aria-current="page"':'')+'>'+icon(ic)+label+'</button>').join('')+'</nav><p class="nav-dialog-foot">非公式の個人記録サイト</p></dialog><dialog class="dialog" id="detail-dialog" aria-labelledby="dialog-title"></dialog><dialog class="dialog owned-confirm" id="owned-confirm" role="alertdialog" aria-labelledby="owned-title" aria-describedby="owned-description"><div class="dialog-body"><h2 id="owned-title">未所持に変更しますか？</h2><p class="owned-name" id="owned-name"></p><p id="owned-description">一度入手したオペレーターは通常手放せません。記録の訂正の場合のみ変更してください。<br>変更は「保存」で反映されます。</p><div class="dialog-actions"><button class="secondary" id="owned-cancel" autofocus>キャンセル</button><button class="primary" id="owned-accept">未所持に変更</button></div></div></dialog><dialog class="dialog import-dialog" id="import-dialog" aria-labelledby="import-title"></dialog><div class="toast" id="toast" role="status" hidden></div>';
    menuDialog=document.getElementById('navigation-dialog');
    document.getElementById('open-menu').onclick=()=>menuWanted?closeMenu():openMenu();
    document.getElementById('close-menu').onclick=closeMenu;
    menuDialog.addEventListener('cancel',ev=>{ev.preventDefault();closeMenu();});
    menuDialog.addEventListener('click',ev=>{if(ev.target===menuDialog){var r=menuDialog.getBoundingClientRect();if(ev.clientX<r.left||ev.clientX>r.right||ev.clientY<r.top||ev.clientY>r.bottom)closeMenu();}});
    menuDialog.addEventListener('close',()=>{if(menuDialog.open)return;setMenuState(false);restoreModalScroll();});
    var logout=document.getElementById('logout');if(logout)logout.onclick=async()=>{if(dirty||saving){toast('編集中の変更を保存またはキャンセルしてからログアウトしてください。');return;}logout.disabled=true;try{await T.logout();}catch(error){toast(error.message);logout.disabled=false;}};
    var importButton=document.getElementById('wiki-import');if(importButton)importButton.onclick=openImport;
    observeHeader();dialog=document.getElementById('detail-dialog');
    ownedDialog=document.getElementById('owned-confirm');
    document.getElementById('owned-cancel').onclick=()=>finishOwnedChange(false);
    document.getElementById('owned-accept').onclick=()=>finishOwnedChange(true);
    ownedDialog.addEventListener('cancel',ev=>{ev.preventDefault();finishOwnedChange(false);});
    ownedDialog.addEventListener('close',restoreModalScroll);
    importDialog=document.getElementById('import-dialog');importDialog.addEventListener('cancel',ev=>{ev.preventDefault();closeImport();});importDialog.addEventListener('click',ev=>{if(ev.target===importDialog)closeImport();});
    dialog.addEventListener('close',restoreModalScroll);importDialog.addEventListener('close',restoreModalScroll);
    dialog.addEventListener('cancel',ev=>{ev.preventDefault();closeDialog();});dialog.addEventListener('click',ev=>{if(ev.target===dialog)closeDialog();});
    document.querySelectorAll('[data-view]').forEach(b=>b.onclick=async()=>{if(!menuMedia.matches)await closeMenu();view=b.dataset.view;document.querySelectorAll('[data-view]').forEach(el=>{if(el===b)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});renderScreen();window.scrollTo({top:0});});
    document.getElementById('refresh').onclick=()=>load(true);document.getElementById('toggle-search').onclick=()=>setSearchOpen(!searchOpen);renderScreen(initialRows);
  }
  function setMenuState(open){
    menuWanted=open;
    var button=document.getElementById('open-menu');
    button.setAttribute('aria-expanded',String(open));button.setAttribute('aria-label',open?'メニューを閉じる':'メニューを開く');
    document.querySelector('.shell').classList.toggle('menu-docked',open&&menuMedia.matches);
  }
  function menuMotion(from,to,duration){
    if(window.matchMedia('(prefers-reduced-motion:reduce)').matches)return null;
    return menuDialog.animate([{transform:from},{transform:to}],{duration:duration,easing:'cubic-bezier(.2,.7,.2,1)'});
  }
  function openMenu(options){
    menuVersion++;if(menuAnimation)menuAnimation.cancel();
    if(!menuDialog.open){if(menuMedia.matches)menuDialog.show();else showDialog(menuDialog);}
    setMenuState(true);
    menuAnimation=options&&options.animate===false?null:menuMotion('translateX(-100%)','translateX(0)',240);
  }
  async function closeMenu(options){
    if(!menuDialog||!menuDialog.open)return;
    var version=++menuVersion;if(menuAnimation)menuAnimation.cancel();setMenuState(false);
    menuAnimation=options&&options.animate===false?null:menuMotion('translateX(0)','translateX(-100%)',180);
    if(menuAnimation){try{await menuAnimation.finished;}catch(_){return;}}
    if(version!==menuVersion)return;menuAnimation=null;hideDialog(menuDialog);
  }
  menuMedia.addEventListener('change',()=>closeMenu({animate:false}));
  function setSearchOpen(open){
    searchOpen=open;
    var toggle=document.getElementById('toggle-search'),input=document.getElementById('search');
    document.getElementById('search-panel').hidden=!open;
    toggle.setAttribute('aria-expanded',String(open));
    toggle.setAttribute('aria-label',open?'検索を閉じる':'検索');
    if(!open)input.value=filters.query='';
    renderRows();
    (open?input:toggle).focus();
  }
  function renderScreen(initialRows){
    var titles={roster:admin?'育成を記録':'オペレーター一覧',summary:'統計',history:'リクエスト履歴'};
    var html=(T.demo?'<div class="preview-banner"><span>プレビュー · 保存やDiscord通知は実行されません</span><a href="?demo=1'+(admin?'':'&screen=admin')+'">'+(admin?'公開画面を見る':'入力画面を見る')+' ↗</a></div>':'')+(view==='roster'?'<h1 class="sr-only">'+titles[view]+'</h1>':'<div class="page-heading"><div><h1>'+titles[view]+'</h1></div></div>');
    if(view==='roster'){
      html+='<div class="roster-controls"><div id="cooldown" class="cooldown" role="status"></div><div class="toolbar" id="search-panel"'+(searchOpen?'':' hidden')+'><label class="search">'+icon('search')+'<input type="search" id="search" aria-label="オペレーター名で検索" placeholder="オペレーター名で検索" value="'+e(filters.query)+'" autocomplete="off"></label></div><div class="class-tabs" role="group" aria-label="職業・レアリティで絞り込み">'+['',...Ark.jobs].map(job=>'<button class="class-tab '+(filters.job===job?'active':'')+'" data-job="'+job+'" aria-pressed="'+(filters.job===job)+'">'+(job||'すべて')+'</button>').join('')+'<label class="rarity-filter"><span aria-hidden="true"><span id="rarity-value">★'+e(filters.rarity)+'</span> ▾</span><select class="rarity-select" id="rarity" aria-label="レアリティ"><option value="">すべてのレアリティ</option>'+[6,5,4,3,2,1].map(r=>'<option value="'+r+'" '+(String(r)===filters.rarity?'selected':'')+'>★'+r+'</option>').join('')+'</select></label></div><div class="list-meta"><span id="result-count"></span>'+'<label>並び順 <select class="sort-select" id="sort" aria-label="並び順">'+[['level','レベル順'],['recent','実装日が新しい順'],['rarity','レアリティ順'],['name','名前順']].map(([v,l])=>'<option value="'+v+'" '+(v===filters.sort?'selected':'')+'>'+l+'</option>').join('')+'</select></label></div></div><div class="roster-scroll" tabindex="0" role="region" aria-label="オペレーター一覧のスクロール領域"><div class="table-labels"><span>オペレーター</span><span>レベル</span><span>潜在</span><span>スキル特化</span><span class="module-label">モジュール</span><span></span></div><div class="roster" id="roster"></div><div class="list-footer"><span>最終取得 '+stamp(data.updatedAt)+'</span><span>'+(admin?'変更は保存ボタンで反映':'サポートアイコンからリクエスト')+'</span></div></div>';
    }else if(view==='summary'){
      html+=summaryOverview()+'<h2 class="summary-section-title">職業別の育成状況</h2>'+ '<div class="summary-switch" role="group" aria-label="集計のレアリティ">'+[['','総合'],['6','★6'],['5','★5'],['4','★4']].map(([v,l])=>'<button data-summary="'+v+'" class="'+(summaryRarity===v?'active':'')+'" aria-pressed="'+(summaryRarity===v)+'">'+l+'</button>').join('')+'</div><div id="summary-content"></div>';
    }else{
      html+='<div class="history-list">'+(data.history.length?data.history.map(h=>'<article class="history-row"><div class="history-symbol">'+icon('send')+'</div><div><strong>'+e(h.name)+'</strong><p>サポートリクエスト</p></div><time>'+stamp(h.time)+'</time></article>').join(''):'<div class="empty">'+icon('clock')+'<strong>まだリクエストはありません</strong>送信されたリクエストがここに表示されます。</div>')+'</div><p class="section-note">直近50件を表示します。依頼の送信記録であり、サポート枠への設定完了を示すものではありません。</p>';
    }
    document.getElementById('screen').innerHTML=html;renderedOperators=null;var searchToggle=document.getElementById('toggle-search');searchToggle.hidden=view!=='roster';searchToggle.setAttribute('aria-expanded',String(searchOpen));searchToggle.setAttribute('aria-label',searchOpen?'検索を閉じる':'検索');
    if(view==='roster'){
      document.getElementById('search').oninput=ev=>{filters.query=ev.target.value;renderRows();};document.getElementById('search').onkeydown=ev=>{if(ev.key==='Escape'){ev.preventDefault();setSearchOpen(false);}};
      ['rarity','sort'].forEach(k=>document.getElementById(k).onchange=ev=>{filters[k]=ev.target.value;document.getElementById('rarity-value').textContent='★'+filters.rarity;renderRows();});
      document.querySelectorAll('[data-job]').forEach(b=>b.onclick=()=>{filters.job=b.dataset.job;document.querySelectorAll('[data-job]').forEach(el=>{el.classList.toggle('active',el===b);el.setAttribute('aria-pressed',String(el===b));});renderRows();});
      document.getElementById('roster').onclick=handleRosterClick;renderRows(initialRows);tick();
    }else if(view==='summary'){
      var summaryButtons=document.querySelectorAll('[data-summary]');
      summaryButtons.forEach(b=>b.onclick=()=>{
        summaryRarity=b.dataset.summary;
        summaryButtons.forEach(el=>{el.classList.toggle('active',el===b);el.setAttribute('aria-pressed',String(el===b));});
        renderSummary();
      });
      renderSummary();
    }
  }
  function skills(o,cls){return '<div class="skill-pills '+(cls||'')+'">'+o.skills.map((s,i)=>'<span class="skill-pill '+(s==='M3'?'complete':s==='-'?'absent':s===''?'unfilled':'')+'"><b>S'+(i+1)+(cls==='request-skills'?':':'')+'</b> '+(s==='-'?'—':s===''?'未入力':e(s))+'</span>').join('')+'</div>';}
  function modules(o,cls){var list=o.modules.map((v,i)=>v&&v!=='-'&&v!=='0'?'<span class="module-pill"><i>'+Ark.modules[i]+'</i>'+e(v)+'</span>':'').join('');return '<div class="module-pills '+(cls||'')+'">'+(cls==='row-modules'?'<span class="module-heading">Mod</span>':'')+(list||'<span class="muted">—</span>')+'</div>';}
  function operatorRow(o){
    var opening=admin?'<button class="oprow" data-edit-name="'+e(o.name)+'" aria-label="'+e(o.name)+' 育成を編集">':'<article class="oprow public-oprow" aria-label="'+e(o.name)+'">';
    var identity='<span class="op-identity"><span><span class="op-name">'+e(o.name)+'</span><span class="op-meta"><span class="stars" aria-label="星'+o.rarity+'">'+'★'.repeat(o.rarity)+'</span>'+(!o.owned?'<span class="unowned">未所持</span>':'')+'</span></span></span>';
    var training='<span class="op-level"><small>'+(o.elite==null?'昇進未入力':o.elite===0?'未昇進':'昇進'+o.elite)+'</small>Lv.'+n(o.level)+'</span><span class="op-potential"><small>潜在</small><strong>'+n(o.potential)+'</strong></span><span class="op-training">'+skills(o,'row-skills')+modules(o,'row-modules')+'</span>';
    var action=admin?'<span class="row-action"><span class="action-label">編集</span>'+icon('edit')+'</span>':'<button type="button" class="row-action support-action" data-request-name="'+e(o.name)+'" aria-label="'+e(o.name)+'をリクエスト" title="リクエスト">'+icon('support')+'</button>';
    return opening+identity+training+action+(admin?'</button>':'</article>');
  }
  function rowMarkup(list){
    return list.length?list.map(operatorRow).join(''):'<div class="empty">'+icon('search')+'<strong>該当するオペレーターがいません</strong>名前や絞り込み条件を変えてみてください。<br><button class="text-button" id="reset-filters">絞り込みをリセット</button></div>';
  }
  function handleRosterClick(event){
    var button=event.target.closest('[data-edit-name],[data-request-name],#reset-filters');
    if(!button)return;
    if(button.id==='reset-filters'){filters={query:'',rarity:'',job:'',sort:'level'};renderScreen();return;}
    var name=button.dataset.editName||button.dataset.requestName;
    var operator=data.operators.find(o=>o.name===name);
    if(operator)openOperator(operator);
  }
  function renderRows(initialRows){
    var list=initialRows?initialRows.operators:rosterSearch(filters);
    if(!renderedOperators||list.length!==renderedOperators.length||list.some((operator,i)=>operator!==renderedOperators[i])){
      document.getElementById('result-count').innerHTML='<strong>'+list.length+'</strong> / '+data.operators.length+' OPERATORS';
      document.getElementById('roster').innerHTML=initialRows?initialRows.html:rowMarkup(list);
      renderedOperators=list;
    }
    var region=document.querySelector('.roster-scroll'),mobile=window.matchMedia('(max-width:760px)').matches;
    region.tabIndex=mobile?-1:0;
    if(mobile)window.scrollTo({top:0,behavior:'instant'});
    else region.scrollTop=0;
  }
  function summaryOverview(){
    var groups=[['全オペ',data.operators],['★4〜6',data.operators.filter(o=>o.rarity>=4)],...[6,5,4].map(r=>['★'+r,data.operators.filter(o=>o.rarity===r)])].map(([label,list])=>{
      var owned=list.filter(o=>o.owned),eligible=owned.filter(o=>o.rarity>=4);
      return {label:label,available:list.length,count:owned.length,max:owned.filter(Ark.maxed).length,mastered:eligible.filter(Ark.mastered).length,masteryCount:eligible.length,potential:owned.filter(o=>o.potential>=6).length,potentialCount:owned.filter(Ark.hasPotential).length};
    });
    var metrics=[['所持オペレーター','count','available','list'],['レベルMAX','max','count','chart'],['全スキル特化3','mastered','masteryCount','check'],['完凸','potential','potentialCount','chart']];
    return '<div class="overview summary-overview">'+metrics.map(([label,key,denominator,ic])=>'<section class="metric"><h2 class="metric-label">'+label+icon(ic)+'</h2><dl class="metric-comparison">'+groups.map(g=>'<div><dt>'+g.label+'</dt><dd><strong>'+g[key]+'</strong><span>'+(key==='count'?' / '+g[denominator]+'人':'人')+'</span><small>'+percent(g[key],g[denominator])+'</small></dd></div>').join('')+'</dl></section>').join('')+'</div><p class="section-note summary-scope">完凸率の集計からはコラボオペレーターなどの潜在がないオペレーターは除外しています</p>';
  }
  function renderSummary(){var s=Ark.summarize(data.operators,summaryRarity),t=s.total;document.getElementById('summary-content').innerHTML='<div class="summary-table-wrap"><table class="summary-table"><thead><tr><th scope="col">職業</th><th scope="col">所持人数</th><th scope="col">Lv MAX / 割合</th><th scope="col">特化3 / 対象スキル</th><th scope="col">全特化人数</th><th scope="col">完凸 / 割合</th></tr></thead><tbody>'+[...s.rows,t].map(c=>'<tr><td>'+c.job+'</td><td>'+c.count+'</td><td>'+c.max+'<small>'+percent(c.max,c.count)+'</small></td><td>'+c.m3+' / '+c.skills+'<small>'+percent(c.m3,c.skills)+'</small></td><td>'+c.mastered+'</td><td>'+c.potential+'<small>'+percent(c.potential,c.potentialCount)+'</small></td></tr>').join('')+'</tbody></table></div>';}
  var modalScroll=null;
  function showDialog(el){
    if(!modalScroll){
      var region=document.querySelector('.roster-scroll'),html=document.documentElement;
      modalScroll={x:window.scrollX,y:window.scrollY,listTop:region?region.scrollTop:0};
      html.style.setProperty('--modal-scroll-top',-modalScroll.y+'px');
      html.style.setProperty('--modal-page-width',html.clientWidth+'px');
      html.classList.add('modal-scroll-locked');
    }
    try{el.showModal();}catch(error){restoreModalScroll();throw error;}
  }
  function restoreModalScroll(){
    if(!modalScroll||document.querySelector('dialog:modal'))return;
    var saved=modalScroll,html=document.documentElement;modalScroll=null;
    html.classList.remove('modal-scroll-locked');
    html.style.removeProperty('--modal-scroll-top');html.style.removeProperty('--modal-page-width');
    var region=document.querySelector('.roster-scroll');if(region)region.scrollTop=saved.listTop;
    window.scrollTo({left:saved.x,top:saved.y,behavior:'instant'});
  }
  function hideDialog(el){el.close();restoreModalScroll();}
  function openOperator(o){selected=o;dirty=false;saving=false;dialog.classList.toggle('editor-dialog',admin);if(admin){draft={...o.training};renderEditor();}else renderRequest();showDialog(dialog);}
  function dialogHeader(eyebrow){var title='<h2 id="dialog-title">'+e(selected.name)+'</h2>';return '<div class="dialog-top">'+(admin?title:'<p class="eyebrow">'+eyebrow+'</p>')+'<button class="icon-button" data-close aria-label="閉じる">'+icon('close')+'</button></div>'+(admin?'':title)+'<p class="dialog-sub">★'+selected.rarity+' · '+e(selected.job)+(admin?'':' · '+(selected.owned?'所持済み':'未所持'))+'</p>';}
  function renderRequest(){dialog.innerHTML='<div class="dialog-body request-body">'+dialogHeader('SUPPORT REQUEST')+'<div class="detail-stats"><div><small>昇進</small><strong>'+n(selected.elite)+'</strong></div><div><small>レベル</small><strong>'+n(selected.level)+'</strong></div><div><small>潜在</small><strong>'+n(selected.potential)+'</strong></div></div><div class="detail-section"><p>スキル</p>'+skills(selected,'request-skills')+'</div><div class="detail-section"><p>モジュール</p>'+modules(selected)+'</div><p class="dialog-notice">このオペレーターをリクエストしますか？<br>送信ボタンを押すとDiscordに通知します。連続したリクエストは3分間のCTがあります。</p><div class="dialog-actions"><button class="primary" id="send-request">'+icon('send')+'リクエスト送信</button><button class="secondary" data-close>キャンセル</button></div><p class="dialog-message" id="dialog-message" role="status"></p></div>';bindClose();document.getElementById('send-request').onclick=sendRequest;tick();}
  async function sendRequest(){if(saving||remainingUntil>Date.now())return;saving=true;var b=document.getElementById('send-request'),m=document.getElementById('dialog-message');b.disabled=true;b.innerHTML='<span class="spinner"></span>送信結果を確認中…';m.textContent='この画面を開いたままお待ちください。';try{var result=await T.request(selected.name);if(result.retryAt)setCooldown(result.retryAt);if(result.status==='sent'){m.textContent=T.demo?'プレビュー：実際の通知は送信していません。':'Discordにリクエストを送信しました。';b.textContent='送信しました';if(!T.demo)data.history.unshift({name:selected.name,time:new Date().toISOString()});}else{m.classList.add('error');m.textContent=result.message||'送信できませんでした。時間をおいてお試しください。';if(result.status==='uncertain')setCooldown(Math.max(remainingUntil,Date.now()+180000));b.textContent='リクエスト送信';}}catch(err){m.classList.add('error');m.textContent=err.message;setCooldown(Date.now()+180000);b.textContent='送信結果を確認できません';}finally{saving=false;tick();}}
  function bindClose(){dialog.querySelectorAll('[data-close]').forEach(b=>b.onclick=closeDialog);}
  function closeDialog(){if(saving)return;if(dirty&&!window.confirm('保存していない変更を破棄しますか？'))return;hideDialog(dialog);dirty=false;selected=null;}
  function field(k,label,type){return '<div class="field"><label for="edit-'+k+'">'+label+'</label><input id="edit-'+k+'" data-field="'+k+'" type="'+(type||'number')+'" inputmode="numeric" min="'+(k==='elite'?0:1)+'" max="'+(k==='level'?Ark.caps[selected.rarity][1]:selected.rarity===6?9999:6)+'" value="'+e(draft[k]==='-'?'':draft[k])+'" placeholder="未入力"></div>';}
  function select(k,label,options){return '<div class="field"><label for="edit-'+k+'">'+label+'</label><select id="edit-'+k+'" data-field="'+k+'">'+options.map(([v,l])=>'<option value="'+v+'" '+(String(draft[k])===v?'selected':'')+'>'+l+'</option>').join('')+'</select></div>';}
  function finishOwnedChange(accept){
    if(accept&&selected){draft.owned=false;document.getElementById('edit-owned').checked=false;dirty=true;}
    hideDialog(ownedDialog);
  }
  function renderEditor(){
    var skillOptions=[['','未入力'],['-','対象外'],['7','7（未特化）'],...(selected.rarity>=4?[['M1','特化1'],['M2','特化2'],['M3','特化3']]:[])];
    dialog.innerHTML='<div class="dialog-body">'+dialogHeader('')+'<label class="owned-switch" for="edit-owned"><input id="edit-owned" type="checkbox" '+(draft.owned?'checked':'')+'>所持している</label><div class="edit-section-heading"><h3>基本育成</h3><button class="text-button" id="level-max">最終昇進・Lv MAX</button></div><div class="editor-grid">'+select('elite','昇進',[['','未入力'],['0','未昇進'],...(selected.rarity>=3?[['1','昇進1']]:[]),...(selected.rarity>=4?[['2','昇進2']]:[])])+field('level','レベル')+field('potential','潜在')+'</div><div class="edit-section"><div class="edit-section-heading"><h3>スキル特化</h3>'+(selected.rarity>=4?'<button class="text-button" id="all-m3">対象スキルをすべてM3</button>':'')+'</div><div class="fields">'+['s1','s2','s3'].map((k,i)=>select(k,'スキル'+(i+1),skillOptions)).join('')+'</div></div><div class="edit-section"><div class="edit-section-heading"><h3>モジュール</h3></div><div class="fields modules">'+['x','y','delta','alpha'].map((k,i)=>select(k,Ark.modules[i],[['','未入力'],['-','対象外'],['0','未開放'],['1','Lv1'],['2','Lv2'],['3','Lv3']])).join('')+'</div></div><p class="dialog-message" id="dialog-message" role="status"></p></div><div class="editor-save"><button class="secondary" data-close>キャンセル</button><button class="primary" id="save-training">'+icon('check')+'変更を保存</button></div>';
    bindClose();document.getElementById('edit-owned').onchange=ev=>{
      if(!ev.target.checked){ev.target.checked=true;document.getElementById('owned-name').textContent=selected.name;showDialog(ownedDialog);return;}
      draft.owned=ev.target.checked;dirty=true;
    };
    dialog.querySelectorAll('[data-field]').forEach(input=>input.oninput=()=>{draft[input.dataset.field]=input.value;dirty=true;});
    document.getElementById('level-max').onclick=()=>{[draft.elite,draft.level]=Ark.caps[selected.rarity];dirty=true;renderEditor();};
    var all=document.getElementById('all-m3');if(all)all.onclick=()=>{['s1','s2','s3'].forEach(k=>{if(draft[k]!=='-')draft[k]='M3';});dirty=true;renderEditor();};
    document.getElementById('save-training').onclick=saveTraining;
  }
  async function saveTraining(){if(saving)return;var m=document.getElementById('dialog-message');try{var values=Ark.validate(draft,selected.rarity);saving=true;dialog.querySelectorAll('button,input,select').forEach(b=>b.disabled=true);document.getElementById('save-training').innerHTML='<span class="spinner"></span>保存中…';var op=await T.save(selected,values);data.operators[data.operators.findIndex(o=>o.name===op.name)]=op;rosterSearch=Ark.prepareSearch(data.operators);data.updatedAt=new Date().toISOString();dirty=false;selected=null;renderScreen();hideDialog(dialog);toast(T.demo?'プレビュー内に保存しました（シートは変更していません）':'育成記録を保存しました');}catch(err){m.classList.add('error');m.textContent=err.message;dialog.querySelectorAll('button,input,select').forEach(b=>b.disabled=false);document.getElementById('save-training').textContent='変更を保存';}finally{saving=false;}}
  function closeImport(){if(!importBusy&&!saving){hideDialog(importDialog);importPlan=null;}}
  function importContents(message,error){
    var p=importPlan,hasChanges=p&&(p.additions.length||p.updates.length||p.summaryReferenceUpdate);
    function rows(list){return '<ul class="import-list">'+list.map(o=>'<li><strong>'+e(o.name)+'</strong><span>★'+e(o.rarity)+' · '+e(o.job)+'</span><small>実装日 '+e(o.date)+'</small></li>').join('')+'</ul>';}
    var details=p?'<p class="dialog-notice">新規 '+p.additions.length+'人'+(p.updates.length?'・基本情報の訂正 '+p.updates.length+'人':'')+'</p>'+rows(p.additions)+(p.updates.length?'<h3>基本情報の訂正</h3><ul class="import-list">'+p.updates.map(u=>'<li><strong>'+e(u.name)+'</strong>'+u.fields.map(field=>{var key={'実装日':'date','職業':'job','レア':'rarity'}[field];return '<span>'+e(field)+'：'+e(u.before[key])+' → '+e(u.after[key])+'</span>';}).join('')+'</li>').join('')+'</ul>':'')+(p.newYears.length?'<p class="dialog-notice">'+p.newYears.map(e).join('・')+'シートを作成します。</p>':'')+(p.summaryReferenceUpdate?'<p class="dialog-notice">統計の参照先も更新します。</p>':'')+(hasChanges?'<p class="dialog-notice">新規オペレーターは未所持で追加します。既存の育成状況は保持します。</p>':'<p class="dialog-notice">追加・訂正するオペレーターはありません。</p>'):'';
    importDialog.innerHTML='<div class="dialog-body"><div class="dialog-top"><h2 id="import-title">Wikiから新規取得</h2><button class="icon-button" data-import-close aria-label="閉じる" '+(importBusy?'disabled':'')+'>'+icon('close')+'</button></div>'+details+'<p class="dialog-message '+(error?'error':'')+'" id="import-message" role="status">'+(importBusy?'<span class="spinner"></span> ':'')+e(message||'')+'</p><div class="dialog-actions">'+(hasChanges?'<button class="primary" id="import-confirm" '+(importBusy?'disabled':'')+'>'+((p.additions.length)?'OK・追加する':'OK・反映する')+'</button>':'')+(!importBusy&&!p?'<button class="secondary" id="import-retry">もう一度取得</button>':'')+'<button class="secondary" data-import-close '+(importBusy?'disabled':'')+'>'+(hasChanges?'キャンセル':'閉じる')+'</button></div></div>';
    importDialog.querySelectorAll('[data-import-close]').forEach(b=>b.onclick=closeImport);
    var confirm=document.getElementById('import-confirm');if(confirm)confirm.onclick=commitImport;
    var retry=document.getElementById('import-retry');if(retry)retry.onclick=scanImport;
  }
  function openImport(){
    if(dirty||saving||importBusy){toast('編集中の変更を保存またはキャンセルしてから取得してください。');return;}
    importPlan=null;importContents('');showDialog(importDialog);scanImport();
  }
  async function scanImport(){
    if(importBusy)return;importPlan=null;importBusy=true;importContents('日本実装済みのオペレーターを確認しています…');
    try{importPlan=await T.importPreview();importBusy=false;importContents('');}
    catch(error){importBusy=false;importContents(error.code==='INVALID'?'取得機能を利用するには、入力用GASを最新版に更新してください。':error.message,true);}
  }
  async function commitImport(){
    if(importBusy||!importPlan)return;
    importBusy=true;saving=true;importContents('確認した内容を反映しています…');
    try{
      var result=await T.importCommit(importPlan.planId);
      saving=false;importBusy=false;hideDialog(importDialog);importPlan=null;
      await load(false);toast('新規 '+result.added+'人を追加しました'+(result.updated?'（基本情報の訂正 '+result.updated+'人）':''));
    }catch(error){saving=false;importBusy=false;importPlan=null;importContents(error.message,true);}
  }
  function setCooldown(time){remainingUntil=Math.max(remainingUntil,Number(time)||0);T.storage.set(T.demo?'ark_demo_ct':'ark_ct',remainingUntil);tick();}
  function tick(){
    clearTimeout(cooldownTimer);
    if(admin)return;
    var remaining=remainingUntil-Date.now(),seconds=Math.max(0,Math.ceil(remaining/1000)),active=seconds>0;
    var banner=document.getElementById('cooldown');
    if(banner){
      banner.classList.toggle('active',active);
      var label=active?'次のサポート依頼まで '+Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0'):'';
      if(banner.textContent!==label)banner.textContent=label;
    }
    var button=document.getElementById('send-request');
    if(button&&!saving){
      button.disabled=active;
      if(button.textContent!=='送信しました'){
        if(active){
          var waitLabel='あと '+seconds+' 秒で依頼できます';
          if(button.textContent!==waitLabel)button.textContent=waitLabel;
        }else if(!button.querySelector('svg'))button.innerHTML=icon('send')+'リクエスト送信';
      }
    }
    if(active)cooldownTimer=setTimeout(tick,Math.min(1000,remaining));
  }
  function prepareInitialRows(){
    if(!root.querySelector('.initial'))return;
    // 接続完了を示す前に、一覧のカードHTMLまで準備する。
    var operators=rosterSearch(filters);
    return {operators:operators,html:rowMarkup(operators)};
  }
  async function finishInitialLoading(loader){
    if(!loader)return;
    // 一覧のDOMまで準備してから、黒い画面上で線をつないで完了を示す。
    loader.classList.add('is-complete');
    if(document.hidden||window.matchMedia('(prefers-reduced-motion:reduce)').matches)return;
    // 固定時間の演出待ちは入れず、つながった線を1フレーム描画して次へ移る。
    await new Promise(resolve=>{
      var frame,deadline,done=false;
      function finish(){if(done)return;done=true;cancelAnimationFrame(frame);clearTimeout(deadline);document.removeEventListener('visibilitychange',visibility);resolve();}
      function visibility(){if(document.hidden)finish();}
      document.addEventListener('visibilitychange',visibility);
      // RAFが抑制された環境の安全弁。通常は描画が先に完了し、このタイマーを取り消す。
      deadline=setTimeout(finish,50);
      frame=requestAnimationFrame(()=>{if(!done)frame=requestAnimationFrame(finish);});
      if(document.hidden)finish();
    });
  }
  async function load(refresh){
    var b=document.getElementById('refresh'),loader=null,previousData=data,previousSearch=rosterSearch;if(b)b.disabled=true;
    try{
      var loaded=await T.get();if(!loaded||!Array.isArray(loaded.operators)||!Array.isArray(loaded.history))throw Error('取得データの形式が一致しません。');
      data=loaded;rosterSearch=Ark.prepareSearch(data.operators);var initialRows=prepareInitialRows();
      loader=root.querySelector('.initial');
      // 黒い画面を保ったまま、その下に一覧のDOMも構築する。mainのIDは新しい一覧に譲る。
      if(loader){loader.removeAttribute('id');document.body.append(loader);}
      shell(initialRows);
      // 必要な一覧レイアウトも黒い画面のうちに確定し、接続後の描画負荷を減らす。
      if(loader)root.getBoundingClientRect();
      await finishInitialLoading(loader);
      if(refresh)toast('最新の記録に更新しました');
    }catch(err){
      data=previousData;rosterSearch=previousSearch;
      if(data){toast(err.message);if(b)b.disabled=false;}
      else root.innerHTML='<main class="main"><div class="page-heading"><div><p class="eyebrow">ARK RECORD</p><h1>アークナイツ育成記録</h1></div></div><div class="error-box"><h2>記録を読み込めませんでした</h2><p>'+e(err.message)+'</p><button class="secondary" id="retry-load">再読み込み</button></div></main>';
      var retry=document.getElementById('retry-load');if(retry)retry.onclick=()=>load(false);
    }finally{if(loader)loader.remove();}
  }
  window.addEventListener('beforeunload',ev=>{if(dirty||saving){ev.preventDefault();ev.returnValue='';}});
  await load(false);if(data&&!admin){var previous=await T.recover();if(previous){if(previous.retryAt)setCooldown(previous.retryAt);toast(previous.status==='sent'?'前回のリクエストは送信済みです。':previous.message||'前回の送信結果をご確認ください。');}}
})();
