/* Archive-file player, using the podcast template's controls and scrubber.
 * No live-stream lifecycle is imported into this separate plugin. */
'use strict';
(() => {
  const $=id=>document.getElementById(id),audio=$('audio'),range=$('playerRange');
  let dragging=false,loading=false;
  const format=value=>{const n=Math.max(0,Math.floor(Number(value)||0));return n>=3600?Math.floor(n/3600)+':'+String(Math.floor(n%3600/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0'):Math.floor(n/60)+':'+String(n%60).padStart(2,'0');};
  function paint(){
    const duration=Number.isFinite(audio.duration)?audio.duration:0;
    const position=dragging?Number(range.value):audio.currentTime||0;
    range.disabled=!duration;range.max=duration||0;
    if(!dragging)range.value=position;
    range.style.setProperty('--pct',(duration?Math.min(100,position/duration*100):0));
    range.setAttribute('aria-valuetext',format(position)+' of '+format(duration));
    $('playerCurrent').textContent=format(position);$('playerDuration').textContent=format(duration);
    const active=!audio.paused&&!audio.ended;
    $('playerToggle').setAttribute('aria-label',loading?'Pause loading audio':active?'Pause':'Play');
    $('playerToggle').classList.toggle('loading',loading);
    $('playerToggle').setAttribute('aria-busy',String(loading));
    $('playerGlyph').innerHTML=active?'<path d="M7 5h4v14H7zM13 5h4v14h-4z"/>':'<path d="M8 5v14l11-7z"/>';
    $('playerState').textContent=loading?'Loading…':audio.ended?'Finished':active?'Playing':'Paused';
    const art=audio.dataset.photo || window.StationConfig.assets.icon;
    if($('playerArt').getAttribute('src')!==art)$('playerArt').src=art;
  }
  $('playerToggle').onclick=async()=>{
    if(!audio.src)return;
    if(!audio.paused){audio.pause();return;}
    try{await audio.play();}catch(error){$('playerError').textContent='Playback could not start. Try again.';loading=false;paint();console.warn('Player start rejected:',error.message);}
  };
  function seek(value){if(Number.isFinite(audio.duration)&&audio.duration>0)audio.currentTime=Math.max(0,Math.min(audio.duration,value));paint();}
  $('playerBack').onclick=()=>seek(audio.currentTime-15);
  $('playerFwd').onclick=()=>seek(audio.currentTime+15);
  range.addEventListener('input',()=>{dragging=true;paint();});
  range.addEventListener('change',()=>{const value=Number(range.value);dragging=false;seek(value);});
  range.addEventListener('pointercancel',()=>{dragging=false;paint();});
  range.addEventListener('blur',()=>{if(dragging){const value=Number(range.value);dragging=false;seek(value);}});
  audio.addEventListener('loadstart',()=>{loading=true;dragging=false;paint();});
  audio.addEventListener('waiting',()=>{loading=!audio.paused;paint();});
  ['playing','pause','ended','error','emptied'].forEach(name=>audio.addEventListener(name,()=>{loading=false;paint();}));
  ['timeupdate','durationchange','loadedmetadata','seeked'].forEach(name=>audio.addEventListener(name,paint));
  paint();
})();
