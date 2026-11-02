export const reviewPassword='Factner-Demo-2026!';
// All fictional fixture logins intentionally share the published demo password.
const fixtureHash='a421662654b941678a7b467891d365ac9f6820e7e08880d1123ca36733d3a314:6c91c5a87f17afd281f15a5b4504590bb2e135a87a5108823ea03f6ff20433a5';
const people=[
  ['design1','디자이너1','design'],['design2','디자이너2','design'],
  ['package1','패키지업체 1','packaging'],['packagedesign1','패키지디자인업체 1','both'],
  ...Array.from({length:10},(_,i)=>['brand'+(i+1),'브랜드'+(i+1),'brand'])
];
// Every fixture is fictional, with a different job and no customer identity in its public brief.
const briefs=[
 ['packaging','앰플 단상자 3,000개 제작',3000,480,'42 × 42 × 118 mm','무광 코팅 백판지, 별색 1도. 유리 앰플을 고정할 종이 받침이 필요합니다.',3],
 ['design','스페셜티 원두 3종 라벨 디자인',3,280000,'92 × 118 mm','원산지별 라벨 3종. 공통 레이아웃과 인쇄용 원본 파일을 요청합니다.',6],
 ['packaging','드립백 선물용 슬리브 제작',5000,340,'115 × 80 × 145 mm','종이 슬리브, 2도 인쇄. 같은 규격의 두 가지 컬러를 비교합니다.',4],
 ['packaging','냉동 디저트 보냉 배송 박스',1800,2200,'245 × 180 × 125 mm','새벽 배송용 E골 합지. 결로를 고려한 내수 코팅 사양을 제안해 주세요.',7],
 ['design','스킨케어 트래블 키트 패키지 디자인',1,950000,'185 × 130 × 45 mm','3종 세트 외박스의 그래픽과 칼선 적용. 두 시안과 인쇄용 파일이 필요합니다.',5],
 ['packaging','리필 파우치 스탠딩 봉투',8000,265,'125 × 185 mm','무광 파우치, 하단 거싯과 재밀봉 지퍼 포함. 내용물은 분말입니다.',9],
 ['design','홈 프래그런스 라인 그래픽 리뉴얼',4,240000,'76 × 105 mm','4종 향별 컬러 체계, 라벨과 단상자에 적용할 디자인을 요청합니다.',8],
 ['packaging','수제 양갱 6입 종이 트레이',2500,570,'160 × 95 × 28 mm','식품 접촉용 종이 트레이와 칸막이. 샘플 후 양산할 예정입니다.',8],
 ['design','반려동물 간식 파우치 일러스트',2,430000,'155 × 225 mm','강아지·고양이 2종 전면 일러스트와 뒷면 정보 레이아웃입니다.',10],
 ['packaging','유리컵 이중 골판지 우편 박스',4000,690,'110 × 110 × 145 mm','유리컵 1개입. 완충 구조, 단색 인쇄, 접착 없는 조립식을 선호합니다.',11]
];
export function insertReviewFixtures(prepare,at=Date.now()){
    const insert=prepare('INSERT INTO market_accounts(id,email,name,kind,password_hash) VALUES(?,?,?,?,?)');
    people.forEach(([key,name,kind])=>insert('seed-'+key,key+'@gmail.com',name,kind,fixtureHash));
    const post=prepare('INSERT INTO market_posts(id,brand_id,category,title,quantity,unit_price,size,description,deadline,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)');
    const offer=prepare('INSERT INTO market_offers(id,post_id,supplier_id,alias,tiers,note,created_at) VALUES(?,?,?,?,?,?,?)');
    briefs.forEach(([category,title,q,price,size,desc,days],i)=>{
      const id=crypto.randomUUID(),created=at-(9+i*22)*60000;
      const deadline=new Date(at+days*86400000+9*3600000).toISOString().slice(0,10);
      post(id,'seed-brand'+(i+1),category,title,q,price,size,desc,deadline,new Date(created).toISOString());
      // Leave work open for all four demo suppliers to try.
      const ids=category==='design'?['design1','design2','packagedesign1']:['package1','packagedesign1'];
      const count=[2,1,0,1,2,0,1,1,0,1][i];
      ids.slice(0,count).forEach((who,j)=>{
        const tiers=[{quantity:q,unitPrice:price+j*10},{quantity:q*2,unitPrice:Math.max(1,Math.round(price*.91)+j*10)}];
        offer(crypto.randomUUID(),id,'seed-'+who,'제안사 '+String.fromCharCode(65+j),JSON.stringify(tiers),j?'사양 확정 후 납기를 조율할 수 있습니다.':'제시된 규격과 일정을 기준으로 산출했습니다.',new Date(created+(j+1)*60000).toISOString());
      });
    });
}
export function seedReview(raw){
  if(raw.prepare("SELECT count(*) AS n FROM market_accounts").get().n)return;
  raw.exec('BEGIN');
  try{
    insertReviewFixtures(sql=>{
      const statement=raw.prepare(sql);
      return (...args)=>statement.run(...args);
    });
    raw.exec('COMMIT');
  }catch(err){raw.exec('ROLLBACK');throw err;}
}
