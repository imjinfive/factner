export function newOrderAlerts(items,announced){
 const fresh=[];
 for(const item of items){
  if(!item.unread)continue;
  const key=`${item.id}:${item.response_requested_at}`;
  if(!announced.has(key)){announced.add(key);fresh.push(item);}
 }
 return fresh;
}

export function attentionItems(data){
 const result=[],ids=new Set();
 for(const item of [data?.latestUnread,...(data?.items||[])]){
  if(item&&!ids.has(item.id)){ids.add(item.id);result.push(item);}
 }
 return result;
}
