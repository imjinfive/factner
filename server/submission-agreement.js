import {SUBMISSION_AGREEMENT} from '../shared/submission-agreement.js';
import {fail,stmt,text} from './http.js';

export function submissionSignature(input) {
 if(input?.accepted!==true||input?.version!==SUBMISSION_AGREEMENT.version)fail(409,'제출 확인서를 다시 확인하고 서명해주세요.');
 const signature=text(input.signature,80,true);
 if(/[\p{Cc}\p{Cf}]/u.test(signature))fail(400,'서명자 이름을 확인해주세요.');
 return signature;
}

// Persist the document shown and the submission together; never trust a client-supplied document or time.
export function agreementStatement(env,{memberId,purpose,resourceId,signature,submission,time}) {
 const table={registration:'members',post:'market_posts',offer:'market_offers'}[purpose];
 return stmt(env,`INSERT INTO submission_agreements(id,member_id,purpose,resource_id,version,document_json,submission_json,signature,signed_at)
   SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM ${table} WHERE id=?)`,
   crypto.randomUUID(),memberId,purpose,resourceId,SUBMISSION_AGREEMENT.version,JSON.stringify(SUBMISSION_AGREEMENT),JSON.stringify(submission),signature,time,resourceId);
}

export async function memberAgreements(env,memberId) {
 const rows=await stmt(env,"SELECT purpose,resource_id AS resourceId,version,document_json,submission_json,signature,signed_at AS signedAt FROM submission_agreements WHERE member_id=? ORDER BY signed_at DESC,id DESC",memberId).all();
 return rows.results.map(({document_json,submission_json,...row})=>({...row,document:JSON.parse(document_json),submission:JSON.parse(submission_json)}));
}
