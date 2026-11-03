export const materials = [
  ['paper','종이'], ['vinyl','비닐'], ['pouch','파우치'], ['plastic','플라스틱'],
  ['glass','유리'], ['metal','금속'], ['wood','목재'], ['cold','보냉']
];

// Family IDs also identify the existing artwork and saved v1 surveys.
export const products = {
  paper: [['carton','일반 종이박스','단상자'],['corrugated','골판지 박스','골판지 G형 박스'],['rigid','싸바리 박스','2단 싸바리 박스'],['bag','쇼핑백','종이 쇼핑백']],
  vinyl: [['flat','일반 포장봉투','접착식 봉투'],['display','진열용 봉투','헤더 봉투'],['mailer','택배봉투','택배봉투'],['shopping','비닐 쇼핑백','손잡이 봉투'],['film','포장 필름','수축필름']],
  pouch: [['flat','기본 파우치','스탠드 파우치'],['zip','지퍼 파우치','스탠드 지퍼 파우치'],['spout','스파우트 파우치','마개형 파우치'],['stick','소포장 파우치','스틱 파우치']],
  plastic: [['bottle','병·보틀','펌프형 병'],['jar','통·단지','크림통'],['tube','튜브','일반 튜브'],['food','식품 용기','샐러드 용기'],['case','케이스·성형 포장','제품 고정 트레이'],['makeup','색조 화장품 용기','쿠션 케이스']],
  glass: [['bottle','식품·음료병','음료병'],['jar','식품용 단지','잼병'],['cosmetic','화장품 용기','스포이트병'],['fragrance','향기 제품 용기','향수병']],
  metal: [['tin','틴케이스','사각 틴케이스'],['can','식품·음료 캔','음료캔'],['cosmetic','화장품·생활용품 용기','알루미늄 튜브'],['industrial','산업용 금속 용기','금속 페일통']],
  wood: [['gift','선물용 목상자','슬라이드 목상자'],['product','제품 전용 목상자','와인 상자'],['shipping','운송용 목상자','크레이트'],['accessory','목재 포장 부자재','목재 팔레트']],
  cold: [['box','보냉박스','보냉박스'],['envelope','보냉봉투','접착형 보냉봉투'],['bag','보냉가방','토트형 보냉백'],['liner','박스 내부 보냉재','보냉 라이너'],['ice','냉매·부자재','아이스팩']]
};

const variants = {
  'paper-carton': [
    ['tuck','일반 단상자'],['crashlock','바닥 접착형'],['assembly','조립형'],['window','창문형'],['slide','슬라이드 상자'],
    ['g-box','종이 G형 박스'],['knockdown','넉다운 박스'],['pillow','반달 상자'],['cookie','쿠키 박스'],['sleeve','슬리브 띠지'],
    ['donut','도넛 박스'],['triangle','삼각 박스'],['separate','종이 분리형 박스'],['handle','종이 손잡이 박스'],['carrier','핸들 박스'],
    ['double-perforation','종이 단상자 - 이중미씽'],['hanging-tab','종이 단상자 - 행잉팁'],['ribbon-triangle','리본 삼각 박스'],['drawer','서랍형 박스']
  ],
  'paper-corrugated': [['g-box','골판지 G형 박스'],['carton','골판지 단상자'],['handle','골판지 손잡이 박스'],['pizza','피자박스'],['separate','골판지 분리형 박스'],['shopping','쇼핑백형 골판지 박스'],['g-handle','손잡이형 골판지 G형 박스'],['drink-handle','플라스틱 핸들형 음료박스'],['outer','아웃 박스']],
  'paper-rigid': [['cover','표지 싸바리 박스'],['two-piece','2단 싸바리 박스'],['three-piece','3단 싸바리 박스']],
  'paper-bag': [['shopping','쇼핑백'],['triangle','삼각 쇼핑백']],
  'vinyl-flat': [['open','비접착 봉투'],['adhesive','접착식 봉투'],['zip','지퍼백'],['slider','슬라이더 지퍼백'],['gusset','옆면 확장형 봉투']],
  'vinyl-display': [['header','헤더 봉투'],['hanging','걸이 구멍 봉투'],['apparel','의류 포장봉투']],
  'vinyl-mailer': [['standard','일반 택배봉투'],['double-seal','이중 접착 택배봉투'],['handle','손잡이 택배봉투'],['bubble','에어캡 안전봉투']],
  'vinyl-shopping': [['die-cut','타공 손잡이 봉투'],['loop','루프 손잡이 봉투'],['vest','양날 손잡이 봉투'],['drawstring','복주머니형 봉투']],
  'vinyl-film': [['shrink','수축필름'],['stretch','스트레치필름'],['roll','자동포장용 롤필름']],
  'pouch-flat': [['three-side','삼방 파우치'],['stand','스탠드 파우치'],['m-gusset','M방 파우치'],['box','박스형 파우치']],
  'pouch-zip': [['flat','평면 지퍼 파우치'],['stand','스탠드 지퍼 파우치'],['box','박스형 지퍼 파우치']],
  'pouch-spout': [['center','중앙 마개형'],['corner','모서리 마개형'],['handle','손잡이형 대용량 파우치']],
  'pouch-stick': [['stick','스틱형'],['flat','납작형 샘플·소스형'],['shaped','모양 가공형 파우치']],
  'plastic-bottle': [['cap','일반 캡형 병'],['pump','펌프형 병'],['spray','스프레이형 병'],['trigger','트리거 분무기 병'],['dropper','스포이트형 병'],['airless','에어리스 용기']],
  'plastic-jar': [['cream','크림통'],['wide-mouth','광구통'],['powder','분말통'],['pail','버킷·페일통'],['jerrycan','손잡이 말통']],
  'plastic-tube': [['standard','일반 튜브'],['nozzle','노즐형 튜브'],['pump','펌프형 튜브'],['applicator','어플리케이터형 튜브']],
  'plastic-food': [['meal','도시락 용기'],['salad','샐러드 용기'],['sauce','소스컵'],['dessert','디저트컵'],['tray','식품 트레이']],
  'plastic-case': [['folding','투명 접이식 케이스'],['blister','블리스터 포장'],['clamshell','여닫이 일체형 케이스'],['insert','제품 고정 트레이']],
  'plastic-makeup': [['cushion','쿠션 케이스'],['compact','팩트 케이스'],['lipstick','립스틱 용기'],['lipgloss','립글로스 용기'],['balm','스틱밤 용기'],['mascara','마스카라 용기']],
  'glass-bottle': [['drink','음료병'],['sauce','소스병'],['oil','오일병'],['liquor','주류병']],
  'glass-jar': [['jam','잼병'],['honey','꿀병'],['pickle','절임식품병'],['dessert','디저트 용기']],
  'glass-cosmetic': [['toner','스킨·토너병'],['pump','펌프형 병'],['dropper','스포이트병'],['cream','크림 단지'],['ampoule','앰플 용기']],
  'glass-fragrance': [['perfume','향수병'],['diffuser','디퓨저병'],['candle','캔들 용기'],['roll-on','롤온병']],
  'metal-tin': [['round','원형 틴케이스'],['square','사각 틴케이스'],['hinged','경첩형 틴케이스'],['slide','슬라이드 틴케이스'],['window','창문형 틴케이스']],
  'metal-can': [['drink','음료캔'],['food','통조림캔'],['powder','분말용 캔'],['oil','식용유 캔']],
  'metal-cosmetic': [['bottle','알루미늄 보틀'],['cream','알루미늄 크림통'],['tube','알루미늄 튜브'],['aerosol','에어로졸 캔']],
  'metal-industrial': [['paint','페인트캔'],['pail','금속 페일통'],['drum','금속 드럼']],
  'wood-gift': [['separate','뚜껑 분리형'],['hinged','경첩 여닫이형'],['slide','슬라이드 뚜껑형'],['drawer','서랍형'],['handle','손잡이형']],
  'wood-product': [['wine','와인·주류 상자'],['tea','차·다기 상자'],['food','식품 선물 상자'],['jewelry','주얼리·시계 상자']],
  'wood-shipping': [['closed','밀폐형 목상자'],['crate','틈이 있는 크레이트'],['plywood','합판 포장상자'],['assembly','분해·조립형 목상자']],
  'wood-accessory': [['pallet','목재 팔레트'],['stand','받침대'],['frame','제품 고정틀'],['divider','목재 칸막이']],
  'cold-box': [['eps','스티로폼 박스'],['epp','EPP 다회용 박스'],['paper','종이 기반 보냉박스'],['insulated-corrugated','단열재 결합 골판지 박스']],
  'cold-envelope': [['adhesive','접착형 보냉봉투'],['zip','지퍼형 보냉봉투'],['handle','손잡이형 보냉봉투']],
  'cold-bag': [['tote','토트형 보냉백'],['zip','지퍼형 보냉백'],['folding','접이식 보냉백'],['delivery','배달용 보냉가방']],
  'cold-liner': [['liner','보냉 라이너'],['pad','단열 패드'],['sheet','단열 시트']],
  'cold-ice': [['water','물 아이스팩'],['gel','젤 아이스팩'],['reusable','재사용 냉매팩'],['pcm','PCM 축냉팩']]
};

const productMap = new Map(Object.entries(products).flatMap(([material,rows])=>rows.map(([id,label,name])=>[`${material}-${id}`,{id:`${material}-${id}`,material,label,name}])));
const variantsByProduct = new Map(Object.entries(variants).map(([product,rows])=>[product,rows.map(([id,name])=>({id:`${product}-${id}`,product,name}))]));
const variantMap = new Map([...variantsByProduct.values()].flat().map(item=>[item.id,item]));
export const productInfo = id => productMap.get(id);
export const productVariants = id => variantsByProduct.get(id) || [];
export const variantInfo = id => variantMap.get(id);
export const materialLabel = id => materials.find(([key])=>key===id)?.[1] || '추천 필요';
export function selectedProductInfo(draft){
  const product=productInfo(draft?.product),variant=variantInfo(draft?.variant);
  return product && variant?.product===product.id ? {...product,name:variant.name,variant:variant.id} : product;
}

const optionGroups = {
  vinyl:[{key:'materialOption',label:'재질',choices:[{id:'opp',label:'OPP'},{id:'pe',label:'PE'},{id:'pp',label:'PP'}]}],
  glass:[{key:'appearance',label:'외관',choices:[{id:'clear',label:'투명'},{id:'brown',label:'갈색'},{id:'colored',label:'유색'},{id:'coated',label:'불투명 코팅'}],hint:'마개·펌프는 유리 본체와 다른 소재일 수 있어요.'}],
  wood:[{key:'materialOption',label:'재질',choices:[{id:'solid',label:'원목'},{id:'plywood',label:'합판'},{id:'mdf',label:'MDF'}]}]
};
export const productOptions = id => optionGroups[productInfo(id)?.material] || [];
export function selectedProductOptions(draft){
  const selected=productOptions(draft?.product).flatMap(group=>{
    const option=group.choices.find(choice=>choice.id===draft?.[group.key]);
    return option?[{key:group.key,label:group.label,value:option.label}]:[];
  });
  if(productInfo(draft?.product)?.material==='wood'&&typeof draft.woodSpecies==='string'&&draft.woodSpecies.trim())selected.push({key:'woodSpecies',label:'수종',value:draft.woodSpecies.trim().slice(0,80)});
  return selected;
}
