import test from 'node:test';
import assert from 'node:assert/strict';
import {createMemberAlerts} from './member-alerts.js';

test('member alerts retain reviewing selection and member requests in active counts',async()=>{
 const updates=[];
 const calls=[];
 const alerts=createMemberAlerts({api:async path=>{calls.push(path);return path.includes('recovery')?{requests:[{},{}]}:path.includes('matching')?{requests:[{status:'reviewing'}]}:path.includes('member-requests')?{requests:[{status:'pending'},{status:'reviewing'}]}:{reviews:[{},{},{}]};},onUpdate:state=>updates.push(state)});
 try{await alerts.start();assert.deepEqual(updates.at(-1),{data:{recovery:2,matching:1,packaging:3,service:2},error:''});assert.ok(calls.includes('admin/matching/requests?status=active'));assert.ok(calls.includes('admin/member-requests?status=active'));}finally{alerts.stop();}
});

test('failed refresh keeps the last known counts and reports the failure',async()=>{
 let fail=false;const updates=[];
 const alerts=createMemberAlerts({api:async path=>{if(fail)throw Error('offline');return path.includes('packaging')?{reviews:[]}:{requests:[{}]};},onUpdate:state=>updates.push(state)});
 try{await alerts.start();fail=true;await alerts.refresh();assert.equal(updates.at(-1).data.recovery,1);assert.match(updates.at(-1).error,/갱신하지 못했습니다/);}finally{alerts.stop();}
});

test('logout discards an in-flight response and concurrent refresh does not duplicate requests',async()=>{
 const pending=[],updates=[];
 const alerts=createMemberAlerts({api:path=>new Promise(resolve=>pending.push(()=>resolve(path.includes('packaging')?{reviews:[]}:{requests:[]}))),onUpdate:state=>updates.push(state)});
 const loading=alerts.start();await alerts.refresh();assert.equal(pending.length,4);alerts.stop();pending.forEach(resolve=>resolve());await loading;assert.equal(updates.length,0);
});
