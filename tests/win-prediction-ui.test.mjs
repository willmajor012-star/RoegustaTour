import test from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {JSDOM} from 'jsdom';
import {loadTs} from './helpers/load-ts.mjs';
const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/'});
for(const key of ['window','document','navigator','Event'])Object.defineProperty(globalThis,key,{configurable:true,value:dom.window[key]});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
test('predictor renders team colours, all three outcomes, and updates from saved results on refresh',async()=>{
 const oldFetch=globalThis.fetch;let prediction={status:'ready',teamIds:['a','b'],percentages:[50,5,45],basis:'teams'};
 globalThis.fetch=async()=>({ok:true,json:async()=>({source:'supabase',prediction})});
 const {WinPredictor}=loadTs('src/components/WinPredictor.tsx');const root=createRoot(document.getElementById('root'));
 try{
  await act(async()=>root.render(React.createElement(WinPredictor,{teams:[{teamId:'a',teamName:'Side A',colour:'#123456'},{teamId:'b',teamName:'Side B',colour:'#654321'}]})));
  const bar=document.querySelector('[role=img]');assert.match(bar.getAttribute('aria-label'),/Side A 50 percent, draw 5 percent, Side B 45 percent/);assert.equal(document.querySelector('.win-predictor-left').style.width,'50%');assert.equal(document.querySelectorAll('a,button').length,0,'the predictor does not add an interactive child to the score-card link');
  prediction={...prediction,percentages:[100,0,0],basis:'decided'};await act(async()=>window.dispatchEvent(new Event('rt:refresh-public-data')));
  assert.match(document.body.textContent,/Victory secured/);assert.equal(document.querySelector('.win-predictor-left').style.width,'100%');
  prediction={status:'awaiting_teams',teamIds:['a','b']};await act(async()=>window.dispatchEvent(new Event('rt:refresh-public-data')));assert.match(document.body.textContent,/Available once teams are confirmed/);assert.equal(document.querySelector('[role=img]'),null);
 }finally{await act(async()=>root.unmount());globalThis.fetch=oldFetch;}
});
