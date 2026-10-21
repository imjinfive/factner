import test from 'node:test';
import assert from 'node:assert/strict';
import {newOrderAlerts,attentionItems} from '../rebate-ui/src/order-alert-state.js';

test('supplier alerts announce initial unread and each request round once, without acknowledging orders',()=>{
 const known=new Set(),first={id:'a',response_requested_at:'first',unread:true},read={id:'b',response_requested_at:'first',unread:false};
 assert.deepEqual(newOrderAlerts([first,read],known),[first]);
 assert.deepEqual(newOrderAlerts([first],known),[]);
 assert.deepEqual(newOrderAlerts([],known),[]);
 assert.deepEqual(newOrderAlerts([first],known),[]);
 const revised={...first,response_requested_at:'revised'};
 assert.deepEqual(newOrderAlerts([revised],known),[revised]);
 assert.equal(first.unread,true);
 assert.deepEqual(newOrderAlerts([first],new Set()),[first]);
});

test('newest unread remains alertable when an old backlog fills the first twenty results',()=>{
 const items=Array.from({length:20},(_,i)=>({id:String(i),response_requested_at:'old',unread:true})),known=new Set();
 newOrderAlerts(items,known);
 const latest={id:'new',response_requested_at:'new-round',unread:true};
 const merged=attentionItems({items,latestUnread:latest});
 assert.equal(merged.length,21);assert.deepEqual(newOrderAlerts(merged,known),[latest]);
 assert.equal(attentionItems({items,latestUnread:items[0]}).length,20);
 assert.deepEqual(attentionItems(null),[]);
});
