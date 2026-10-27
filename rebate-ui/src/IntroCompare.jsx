import { useRef } from "react";
import { motion, useScroll, useSpring, useTransform } from "motion/react";
import "./intro-compare.css";

const samples = [
  { name: "제품 패키징", category: "제품에 맞는 단상자", material: "소재·두께", finish: "인쇄·코팅", image: "/images/compare-beauty.png", alt: "종이 질감이 살아 있는 뷰티 단상자 패키징 예시" },
  { name: "택배 박스", category: "제품을 보호하는 배송 포장", material: "규격·골판지", finish: "인쇄·접합", image: "/images/compare-mailer.png", alt: "제품을 안전하게 담는 골판지 택배 패키징 예시" },
  { name: "선물 패키징", category: "브랜드를 담는 선물 포장", material: "형태·지류", finish: "박·후가공", image: "/images/compare-gift.png", alt: "섬세한 마감의 선물용 싸바리 패키징 예시" },
];

function Sample({ sample, index, progress, still }) {
  const { name, category, material, finish, image, alt } = sample;
  const scatter = useTransform(progress, [0.12, 0.65], [1, 0]);
  const x = useTransform(scatter, value => `calc(var(--compare-x) * ${value})`);
  const y = useTransform(scatter, value => `calc(var(--compare-y) * ${value})`);
  const rotate = useTransform(scatter, [0, 1], [0, [-16, 10, 18][index]]);
  const photoScale = useTransform(progress, [0.12, 0.65], [1.22, 1]);
  const detailOpacity = useTransform(progress, [0.48, 0.71], [0, 1]);
  const detailY = useTransform(progress, [0.48, 0.71], [20, 0]);
  const photoRadius = useTransform(progress, [0.25, 0.65], ["10px", "20px"]);

  return <motion.article className={`rb-compare-sample rb-compare-sample-${index}`}
    style={still ? {} : { x, y, rotate }}>
    <motion.div className="rb-compare-photo" style={still ? {} : { scale: photoScale, borderRadius: photoRadius }}>
      <img src={image} alt={alt} loading="lazy" width="1448" height="1086" />
    </motion.div>
    <motion.div className="rb-compare-name" style={still ? {} : { opacity: detailOpacity, y: detailY }}>
      <h3>{name}</h3>
      <p>{category}</p>
    </motion.div>
    <motion.dl className="rb-compare-facts" style={still ? {} : { opacity: detailOpacity, y: detailY }}>
      <div><dt>기본 사양</dt><dd>{material}</dd></div>
      <div><dt>제작 조건</dt><dd>{finish}</dd></div>
    </motion.dl>
  </motion.article>;
}

export default function IntroCompare({ still }) {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const progress = useSpring(scrollYProgress, { stiffness: 180, damping: 35, mass: 0.3 });
  const beforeOpacity = useTransform(progress, [0, 0.27, 0.43], [1, 1, 0]);
  const beforeY = useTransform(progress, [0.27, 0.43], [0, -42]);
  const afterOpacity = useTransform(progress, [0.34, 0.55], [0, 1]);
  const afterY = useTransform(progress, [0.34, 0.55], [44, 0]);
  const lineScale = useTransform(progress, [0.53, 0.76], [0, 1]);
  const noteOpacity = useTransform(progress, [0.65, 0.8], [0, 1]);

  return <section ref={ref} className={`rb-compare-scene ${still ? "rb-compare-static" : ""}`}
    id="intro-compare" aria-labelledby="intro-compare-title">
    <div className="rb-compare-stage">
      <div className="rb-compare-heading">
        {!still && <motion.p aria-hidden="true" style={{ opacity: beforeOpacity, y: beforeY }}>
          우리 제품에 필요한<br />패키징 조건.
        </motion.p>}
        <motion.h2 id="intro-compare-title" style={still ? {} : { opacity: afterOpacity, y: afterY }}>
          필요한 사양을,<br /><span>한곳에.</span>
        </motion.h2>
      </div>
      <div className="rb-compare-board">
        {samples.map((sample, index) => <Sample key={sample.name}
          sample={sample} index={index} progress={progress} still={still} />)}
        <motion.div className="rb-compare-rule" aria-hidden="true" style={still ? {} : { scaleX: lineScale }} />
        <motion.p className="rb-compare-example" style={still ? {} : { opacity: noteOpacity }}>패키징 연출 이미지 · 운영팀과 실제 사양을 정리해요</motion.p>
      </div>
    </div>
  </section>;
}
