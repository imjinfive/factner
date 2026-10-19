import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion, useScroll, useSpring, useTransform } from "motion/react";
import { ArrowRight, CheckCircle, Star } from "@phosphor-icons/react";
import IntroChoice from "./IntroChoice";
import IntroCompare from "./IntroCompare";
import "./service-intro.css";

function useScene(ref) {
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  return useSpring(scrollYProgress, { stiffness: 180, damping: 35, mass: 0.3 });
}

function Opening({ still }) {
  const ref = useRef(null);
  const progress = useScene(ref);
  const scale = useTransform(progress, [0, 1], [1, 1.19]);
  const imageY = useTransform(progress, [0, 1], ["0%", "-5%"]);
  const titleY = useTransform(progress, [0, 0.8], [0, -110]);
  const titleOpacity = useTransform(progress, [0, 0.4, 0.76], [1, 1, 0]);
  const afterOpacity = useTransform(progress, [0.58, 0.84], [0, 1]);
  const afterY = useTransform(progress, [0.58, 0.84], [50, 0]);

  return (
    <section ref={ref} className="rb-scene rb-opening" id="intro-start" aria-labelledby="intro-title">
      <div className="rb-stage">
        <div className="rb-opening-frame">
          <motion.img className="rb-opening-image" src="/images/service-village.png"
            width="1536" height="1024" fetchPriority="high"
            alt="브랜드와 패키징 공방이 만나는 미니어처 마을"
            style={still ? {} : { scale, y: imageY }} />
          <div className="rb-opening-shade" />
          <motion.div className="rb-opening-title" style={still ? {} : { y: titleY, opacity: titleOpacity }}>
            <motion.h1 id="intro-title" initial={still ? false : { opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }}>
              브랜드의 가치는<br /><span>패키징부터.</span>
            </motion.h1>
          </motion.div>
          {!still && <motion.p className="rb-opening-after" style={{ opacity: afterOpacity, y: afterY }}>
            그 시작을,<br />팩트너와 함께.
          </motion.p>}
        </div>
      </div>
    </section>
  );
}

function InspectionPoint({ progress, index, children, still }) {
  const start = index * 0.23 + 0.2;
  const opacity = useTransform(progress, [start, start + 0.15], [0.35, 1]);
  const y = useTransform(progress, [start, start + 0.15], [18, 0]);
  const tickOpacity = useTransform(progress, [start, start + 0.12], [0, 1]);
  return <motion.li style={still ? {} : { opacity, y }}>
    <motion.span style={still ? {} : { opacity: tickOpacity }}><CheckCircle weight="fill" size={27} /></motion.span>
    {children}
  </motion.li>;
}

function OnSite({ still }) {
  const ref = useRef(null);
  const progress = useScene(ref);
  const photoScale = useTransform(progress, [0, 0.35, 1], [0.82, 1, 1.28]);
  const photoY = useTransform(progress, [0, 1], ["6%", "-4%"]);
  const reviewX = useTransform(progress, [0, 0.45], [0, -100]);
  const reviewRotate = useTransform(progress, [0, 0.45], [-6, -14]);
  const reviewOpacity = useTransform(progress, [0, 0.22, 0.45], [1, 1, 0]);
  const frameOpacity = useTransform(progress, [0.2, 0.43, 0.85, 1], [0, 0.8, 0.8, 0]);
  return (
    <section ref={ref} className="rb-scene rb-onsite" id="intro-check" aria-labelledby="intro-check-title">
      <div className="rb-stage">
        <motion.img className="rb-onsite-image" src="/images/service-workshop.png" width="1536" height="1024"
          alt="제작 샘플을 확인하고 촬영하는 미니어처 공방" loading="lazy"
          style={still ? {} : { scale: photoScale, y: photoY }} />
        <div className="rb-onsite-shade" />
        <div className="rb-onsite-copy">
          <h2 id="intro-check-title">리뷰로 한 번.<br />현장에서 또 한 번.</h2>
          <p>직접 방문해 검증한<br className="rb-mobile-break" /> 신뢰 업체를 연결합니다.</p>
        </div>
        {!still && <>
          <motion.div className="rb-review-note" style={{ x: reviewX, rotate: reviewRotate, opacity: reviewOpacity }}>
            <span><Star size={18} weight="fill" />브랜드 리뷰 예시</span>
            <p>종이 질감과 인쇄 색상을<br />샘플로 비교할 수 있었어요.</p>
          </motion.div>
          <motion.div className="rb-camera-frame" aria-hidden="true" style={{ opacity: frameOpacity }}>
            <i /><i /><i /><i />
          </motion.div>
        </>}
        <ol className="rb-inspection-list" aria-label="팩트너 현장 확인 항목">
          {["작업 현장", "제작 샘플", "납품 품질"].map((label, index) =>
            <InspectionPoint key={label} progress={progress} index={index} still={still}>{label}</InspectionPoint>)}
        </ol>
      </div>
    </section>
  );
}

function Ending({ Button, onExplore, onRequest, still }) {
  const ref = useRef(null);
  const progress = useScene(ref);
  const photoScale = useTransform(progress, [0, 0.85], [1.2, 1]);
  const photoY = useTransform(progress, [0, 0.85], ["4%", "0%"]);
  const copyY = useTransform(progress, [0, 0.55], [38, 0]);
  return <section ref={ref} className="rb-scene rb-ending" id="intro-begin" aria-labelledby="intro-ending-title">
    <div className="rb-stage">
      <motion.img className="rb-ending-image" src="/images/service-unboxing.png" width="1536" height="1024"
        alt="초록색 패키징을 열고 제품을 처음 만나는 고객의 손" loading="lazy"
        style={still ? {} : { scale: photoScale, y: photoY }} />
      <div className="rb-ending-shade" />
      <motion.div className="rb-ending-copy" style={still ? {} : { y: copyY }}>
        <h2 id="intro-ending-title">상자를 여는 순간,<br /><span>브랜드를 만납니다.</span></h2>
        <p>그 첫 만남이 특별하도록.<br />팩트너가 함께합니다.</p>
        <div className="rb-ending-actions">
          <Button className="rb-story-button" onClick={onExplore}>업체 찾기 <ArrowRight size={20} /></Button>
          <Button className="rb-story-button" tone="outline" onClick={onRequest}>견적 요청하기</Button>
        </div>
      </motion.div>
      </div>
  </section>;
}

export default function ServiceIntro({ Button, Photo, onExplore, onRequest, onSupplier }) {
  const reduce = useReducedMotion();
  const [shortScreen, setShortScreen] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-height: 560px)").matches);
  useEffect(() => {
    const media = window.matchMedia("(max-height: 560px)");
    const sync = () => setShortScreen(media.matches);
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  const still = reduce || shortScreen;
  return <div className={`rb-story ${still ? "rb-story-static" : ""}`}>
    <Opening still={still} />
    <IntroCompare still={still} />
    <OnSite still={still} />
    <IntroChoice Button={Button} Photo={Photo} onExplore={onExplore} onRequest={onRequest} onSupplier={onSupplier} />
    <Ending Button={Button} onExplore={onExplore} onRequest={onRequest} still={still} />
  </div>;
}
