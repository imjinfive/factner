import test from 'node:test';
import assert from 'node:assert/strict';
import {createMemberAlerts} from './member-alerts.js';

test('member alerts combine recovery, selection and packaging review queues',async()=>{
 const updates=[];
 const alerts=createMemberAlerts({api:async path=>path.includes('recovery')?{requests:[{},{}]}:path.includes('matching')?{requests:[{}]}:{reviews:[{},{},{}]},onUpdate:state=>updates.push(state)});
 try{await alerts.start();assert.deepEqual(updates.at(-1),{data:{recovery:2,matching:1,packaging:3},error:''});}finally{alerts.stop();}
});

test('failed refresh keeps the last known counts and reports the failure',async()=>{
 let fail=false;const updates=[];
 const alerts=createMemberAlerts({api:async path=>{if(fail)throw Error('offline');return path.includes('packaging')?{reviews:[]}:{requests:[{}]};},onUpdate:state=>updates.push(state)});
 try{await alerts.start();fail=true;await alerts.refresh();assert.equal(updates.at(-1).data.recovery,1);assert.match(updates.at(-1).error,/갱신하지 못했습니다/);}finally{alerts.stop();}
});

test('logout discards an in-flight response and concurrent refresh does not duplicate requests',async()=>{
 const pending=[],updates=[];
 const alerts=createMemberAlerts({api:path=>new Promise(resolve=>pending.push(()=>resolve(path.includes('packaging')?{reviews:[]}:{requests:[]}))),onUpdate:state=>updates.push(state)});
 const loading=alerts.start();await alerts.refresh();assert.equal(pending.length,3);alerts.stop();pending.forEach(resolve=>resolve());await loading;assert.equal(updates.length,0);
});
