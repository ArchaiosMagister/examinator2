/* Verifica que las acciones originales sigan disponibles y que la vista
 * previa y el lector puedan abrirse en iPhone. Sin dependencias de DOM.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('index.html', 'utf8');
const css = fs.readFileSync('styles.css', 'utf8');
const mobile = fs.readFileSync('js/mobile.js', 'utf8');
const exam = fs.readFileSync('js/exam.js', 'utf8');
const library = fs.readFileSync('js/library.js', 'utf8');
const sw = fs.readFileSync('sw.js', 'utf8');

function part(s,start,end) {
  const a = s.indexOf(start), b = s.indexOf(end,a+start.length);
  assert.ok(a>=0 && b>a, 'Sección ausente: '+start);
  return s.slice(a,b);
}
const header = part(html,'<header>','</header>');
const origButtons = ['btnNew','btnOpen','btnSave','btnLib','btnLists','btnSettings','btnInstall','btnUpdate','btnDocx','btnPdf'];
for (const id of origButtons) assert.equal(header.split('id="'+id+'"').length-1,1,'No perder '+id);
assert.match(header,/id="btnMobileMenu"[^>]*aria-expanded="false"/);
assert.match(header,/id="btnMobileLibrary"/);
assert.match(header,/id="headerActions"/);
assert.match(html,/id="mobileViews"[^>]*aria-label="Vistas del examen"/);
assert.match(html,/data-view="editor"/);
assert.match(html,/data-view="preview"/);
assert.match(html,/<script src="js\/mobile\.js"><\/script>/);
assert.match(html,/viewport-fit=cover/);
assert.match(sw,/"\.\/js\/mobile\.js"/,'Los controles deben funcionar sin conexión');
assert.match(sw, /examinator2-v15-ios-pdf-stable-vocab-20261118/);
const mobileCss=css.slice(css.indexOf('/* Pantallas estrechas:'));
assert.match(mobileCss,/@media \(max-width: 760px\), \(max-width: 950px\) and \(max-height: 550px\)/);
assert.match(mobileCss,/grid-template-rows: var\(--top-band-height\) 48px var\(--mobile-tabs-height\) minmax\(0,1fr\)/);
assert.match(mobileCss,/\.header-actions \{ display: none; \}/);
assert.match(mobileCss,/header\.menu-open \.header-actions \{/);
assert.match(mobileCss,/\.mobile-views \{/);
assert.match(mobileCss,/body\[data-mobile-view="preview"\] #editor \{ display: none; \}/);
assert.match(mobileCss,/body\[data-mobile-view="preview"\] #preview \{ display: block; \}/);
assert.match(mobileCss,/#lib\[data-mobile-pane="catalog"\] \.lread \{ display: none; \}/);
assert.match(mobileCss,/#lib\[data-mobile-pane="reader"\] \.lcat \{ display: none; \}/);
assert.match(mobileCss,/\.rtext \{[^}]*overflow-scrolling: touch/);
assert.match(mobileCss,/\.vrow \{ grid-template-columns: 24px minmax\(0,1fr\)/);
assert.match(css,/main \{ display: grid; grid-template-columns: minmax\(470px, 600px\) 1fr/,'Conservar escritorio');
assert.match(exam,/M\.fitSheet = fitSheet;/);
assert.match(exam,/if \(!pv \|\| !sh \|\| !pv\.clientWidth\) return;/);
assert.match(exam,/Math\.max\(0\.2, avail \/ w\)/);
assert.match(library,/box\.dataset\.mobilePane = 'catalog';/);
assert.match(library,/setMobilePane\('reader'\);/);
assert.match(library,/data-act="books"/);
assert.match(library,/data-act="read"/);
assert.match(library,/if \(typeof M\.showMobileView === 'function'\) M\.showMobileView\('editor'\)/);

function node(name) {
  const classes=new Set(), listeners={}, attrs={};
  return { name, dataset:{}, listeners, attrs, parent:null,
    contains(target) { return target === this || target?.parent === this; },
    classList:{
      contains:x=>classes.has(x),
      add:x=>classes.add(x),
      remove:x=>classes.delete(x),
      toggle(x,y){if(y===undefined)y=!classes.has(x); if(y)classes.add(x);else classes.delete(x);return y;}
    },
    setAttribute(k,v){attrs[k]=v;},
    addEventListener(ev,fn){(listeners[ev] ||= []).push(fn);},
    closest(selector){return selector==='header'?this.parent:null;},
    click(){for(const fn of listeners.click||[])fn({target:this});}
  };
}
const titleBar=node('header'), menu=node('menu'), actions=node('actions'), libShortcut=node('libShortcut'), libButton=node('btnLib'), tabs=node('tabs'), editorButton=node('editor'), previewButton=node('preview');
menu.parent=titleBar;
editorButton.dataset.view='editor';previewButton.dataset.view='preview';
tabs.querySelectorAll=()=>[editorButton,previewButton];
libButton.click=()=>{ctx.libCalled++};
const els={btnMobileMenu:menu,headerActions:actions,btnMobileLibrary:libShortcut,btnLib:libButton,mobileViews:tabs};
const body={dataset:{}};
const docEvents={},winEvents={};
const ctx={
  libCalled:0, previewCalled:0, fitCalled:0,
  document:{
    body,
    getElementById:k=>els[k]||null,
    addEventListener:(k,fn)=>(docEvents[k] ||= []).push(fn)
  },
  window:{
    addEventListener:(k,fn)=>(winEvents[k] ||= []).push(fn),
    matchMedia:()=>({matches:true})
  },
  requestAnimationFrame:fn=>fn(),
  M:{preview(){ctx.previewCalled++},fitSheet(){ctx.fitCalled++}}
};
ctx.window.M=ctx.M;
vm.createContext(ctx);
vm.runInContext(mobile,ctx,{filename:'js/mobile.js'});
assert.equal(winEvents.DOMContentLoaded.length,1);
winEvents.DOMContentLoaded[0]();
assert.equal(body.dataset.mobileView,'editor');
assert.equal(editorButton.attrs['aria-pressed'],'true');
menu.click();
assert.ok(titleBar.classList.contains('menu-open'));
assert.equal(menu.attrs['aria-expanded'],'true');
actions.listeners.click[0]({target:{closest:()=>({})}});
assert.equal(menu.attrs['aria-expanded'],'false');
menu.click();docEvents.keydown[0]({key:'Escape'});
assert.ok(!titleBar.classList.contains('menu-open'));
libShortcut.click();assert.equal(ctx.libCalled,1);
tabs.listeners.click[0]({target:{closest:()=>previewButton}});
assert.equal(body.dataset.mobileView,'preview');
assert.equal(previewButton.attrs['aria-pressed'],'true');
assert.equal(ctx.previewCalled,1);
assert.equal(ctx.fitCalled,1);
ctx.M.showMobileView('editor');assert.equal(body.dataset.mobileView,'editor');
menu.click();docEvents.click[0]({target:{}});assert.equal(menu.attrs['aria-expanded'],'false');
winEvents.resize[0]();
console.log('OK: menú móvil, acciones, vista previa, ancho, lector, compatibilidad escritorio y modo offline.');
