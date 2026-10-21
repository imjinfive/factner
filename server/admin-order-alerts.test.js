import test from 'node:test';
import assert from 'node:assert/strict';
import {createOrderAlerts} from '../admin-ui/order-alerts.js';

test('admin alert poll retains last counts on failure and ignores a stopped session response',async()=>{
 let resolve,calls=0;const updates=[];
 const poll=createOrderAlerts({api:()=>{calls++;return new Promise(done=>{resolve=done;});},onUpdate:value=>updates.push(value)});
 const initial=poll.start();poll.refresh();assert.equal(calls,1);
 resolve({unread:3,overdue:1,pending:4});await initial;assert.equal(updates.at(-1).data.unread,3);
 const late=poll.refresh();poll.stop();resolve({unread:99});await late;assert.equal(updates.at(-1).data.unread,3);
 let fail=false;const retained=[];
 const second=createOrderAlerts({api:async()=>{if(fail)throw new Error('offline');return {unread:2,overdue:0,pending:2};},onUpdate:value=>retained.push(value)});
 await second.start();fail=true;await second.refresh();second.stop();assert.equal(retained.at(-1).data.unread,2);assert.match(retained.at(-1).error,/연결/);
});


test('admin alert request aborts on timeout and can recover without clearing retained counts',async t=>{
 t.mock.timers.enable({apis:['setTimeout','setInterval']});let stall=false;const updates=[];
 const poll=createOrderAlerts({api:async(path,{signal})=>{if(!stall)return {unread:1,overdue:0,pending:1};return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('timeout')),{once:true}));},onUpdate:value=>updates.push(value)});
 await poll.start();stall=true;const stalled=poll.refresh();t.mock.timers.tick(12000);await stalled;
 assert.equal(updates.at(-1).data.unread,1);assert.match(updates.at(-1).error,/연결/);
 stall=false;await poll.refresh();assert.equal(updates.at(-1).error,'');poll.stop();
});
