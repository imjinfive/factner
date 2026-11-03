import {examplePosts} from '../scripts/bid-seed.mjs';
import {fail,stmt} from './http.js';

const hiddenPrefix='market-hidden:';

export async function marketExamples(env,includeHidden=false){
 const rows=await stmt(env,'SELECT key FROM settings WHERE key LIKE ?',hiddenPrefix+'%').all();
 const hidden=new Set(rows.results.map(row=>row.key.slice(hiddenPrefix.length)));
 const examples=examplePosts();
 if(includeHidden)return examples.map(post=>({...post,visible:!hidden.has(post.id)}));
 return examples.filter(post=>!hidden.has(post.id));
}

export async function setExampleVisibility(env,id,input){
 if(!examplePosts().some(post=>post.id===id))fail(404,'예시 공고를 찾을 수 없습니다.');
 if(input.confirmed!==true || typeof input.visible!=='boolean')fail(400,'예시 공고 표시 여부를 확인해주세요.');
 const key=hiddenPrefix+id;
 if(input.visible)await stmt(env,'DELETE FROM settings WHERE key=?',key).run();
 else await stmt(env,"INSERT OR IGNORE INTO settings(key,value) VALUES(?,'1')",key).run();
 return {id,visible:input.visible};
}
