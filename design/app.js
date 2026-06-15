/* Midad Academy — router + interactions */
(function(){
  const ORDER = ['landing','login','register','student','teacher','parent','classroom','courses'];
  const screens = {
    landing:'s-landing', login:'s-login', register:'s-register',
    student:'s-student', teacher:'s-teacher', parent:'s-parent',
    classroom:'s-classroom', courses:'s-courses'
  };

  function go(name){
    if(!screens[name]) name='landing';
    document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
    const el = document.getElementById(screens[name]);
    if(el) el.classList.add('active');
    // jump menu state
    const idx = ORDER.indexOf(name);
    document.getElementById('jumpCur').textContent = (idx+1)+' / 8';
    document.querySelectorAll('.jump-menu button').forEach(b=>{
      b.classList.toggle('on', b.dataset.go===name);
    });
    // nav link active states (per screen)
    document.querySelectorAll('.nav-links a[data-go]').forEach(a=>{
      a.classList.toggle('on', a.dataset.go===name);
    });
    window.scrollTo(0,0);
    if(location.hash !== '#'+name) history.replaceState(null,'','#'+name);
    document.documentElement.setAttribute('data-screen', name);
    if(name==='classroom' && window.initBoard) setTimeout(window.initBoard, 60);
  }
  window.midadGo = go;

  // delegated navigation
  document.addEventListener('click', e=>{
    const t = e.target.closest('[data-go]');
    if(t){
      // allow anchor links (#pricing-anchor) to behave normally
      e.preventDefault();
      go(t.dataset.go);
    }
  });

  // screen-jump panel
  const jump = document.getElementById('jump');
  document.getElementById('jumpBtn').addEventListener('click', e=>{
    e.stopPropagation(); jump.classList.toggle('open');
  });
  document.addEventListener('click', e=>{
    if(!jump.contains(e.target)) jump.classList.remove('open');
  });

  // modal open/close (generic)
  document.addEventListener('click', e=>{
    const o = e.target.closest('[data-modal-open]');
    if(o){ e.preventDefault(); const m=document.getElementById(o.dataset.modalOpen); if(m){m.classList.add('open');document.body.classList.add('locked');} }
    const c = e.target.closest('[data-modal-close]');
    if(c){ e.preventDefault(); const m=c.closest('.modal-bg'); if(m){m.classList.remove('open');document.body.classList.remove('locked');} }
    if(e.target.classList && e.target.classList.contains('modal-bg')){
      e.target.classList.remove('open'); document.body.classList.remove('locked');
    }
  });
  document.addEventListener('keydown', e=>{
    if(e.key==='Escape'){ document.querySelectorAll('.modal-bg.open').forEach(m=>m.classList.remove('open')); document.body.classList.remove('locked'); }
  });

  // boot from hash
  const start = (location.hash||'').replace('#','');
  go(ORDER.includes(start)?start:'landing');

  /* ---------- Whiteboard (classroom) ---------- */
  window.initBoard = function(){
    const cv = document.getElementById('wbCanvas');
    if(!cv || cv.dataset.ready) return;
    cv.dataset.ready='1';
    const ctx = cv.getContext('2d');
    function size(){
      const r = cv.getBoundingClientRect();
      const dpr = window.devicePixelRatio||1;
      const img = ctx.getImageData ? null : null;
      cv.width = r.width*dpr; cv.height = r.height*dpr;
      ctx.setTransform(dpr,0,0,dpr,0,0);
      ctx.lineCap='round'; ctx.lineJoin='round';
    }
    size();
    let tool='pen', color='#1B3A6B', drawing=false, last=null;
    const widths={pen:3,highlighter:16,eraser:26};
    function setTool(t){ tool=t; document.querySelectorAll('.wb-tool').forEach(b=>b.classList.toggle('on', b.dataset.tool===t)); }
    function setColor(c){ color=c; document.querySelectorAll('.wb-color').forEach(b=>b.classList.toggle('on', b.dataset.color===c)); }
    document.querySelectorAll('.wb-tool').forEach(b=>b.addEventListener('click',()=>setTool(b.dataset.tool)));
    document.querySelectorAll('.wb-color').forEach(b=>b.addEventListener('click',()=>setColor(b.dataset.color)));
    const clearBtn=document.getElementById('wbClear');
    if(clearBtn) clearBtn.addEventListener('click',()=>ctx.clearRect(0,0,cv.width,cv.height));
    function pos(e){ const r=cv.getBoundingClientRect(); const p=e.touches?e.touches[0]:e; return {x:p.clientX-r.left,y:p.clientY-r.top}; }
    function start(e){ drawing=true; last=pos(e); e.preventDefault(); }
    function move(e){
      if(!drawing) return;
      const p=pos(e);
      ctx.globalCompositeOperation = tool==='eraser'?'destination-out':'source-over';
      ctx.globalAlpha = tool==='highlighter'?0.32:1;
      ctx.strokeStyle = color; ctx.lineWidth = widths[tool]||3;
      ctx.beginPath(); ctx.moveTo(last.x,last.y); ctx.lineTo(p.x,p.y); ctx.stroke();
      last=p; e.preventDefault();
    }
    function end(){ drawing=false; }
    cv.addEventListener('mousedown',start); cv.addEventListener('mousemove',move);
    window.addEventListener('mouseup',end);
    cv.addEventListener('touchstart',start,{passive:false}); cv.addEventListener('touchmove',move,{passive:false}); cv.addEventListener('touchend',end);
    setTool('pen'); setColor('#1B3A6B');

    // shared-materials dock selection (content lives in the same board)
    const board = cv.closest('.board-wrap');
    board.querySelectorAll('.dock-item').forEach(it=>it.addEventListener('click',()=>{
      board.querySelectorAll('.dock-item').forEach(x=>x.classList.remove('on'));
      it.classList.add('on');
    }));
    let seed=false;
    if(!seed){ // light pre-drawn guide
      ctx.globalAlpha=1; ctx.strokeStyle='#1B3A6B'; ctx.lineWidth=4;
      ctx.font='600 64px "IBM Plex Sans Arabic"'; ctx.fillStyle='#C9922A';
    }
  };
})();
