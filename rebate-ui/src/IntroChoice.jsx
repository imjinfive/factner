import { useId, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, Check } from "@phosphor-icons/react";
import "./intro-choice.css";

const choices = [
  { id: "a", name: "A업체", item: "박스", region: "수도권", moq: 500, image: 0 },
  { id: "b", name: "B업체", item: "패키징", region: "충청", moq: 1000, image: 1 },
  { id: "c", name: "C업체", item: "부자재", region: "수도권", moq: 300, image: 2 },
];
const spring = { type: "spring", stiffness: 240, damping: 25, mass: 0.9 };

function rankChoices(item, region) {
  const score = (choice) => Number(choice.item === item) * 2 + Number(choice.region === region);
  return [...choices].sort((a, b) => score(b) - score(a));
}

export default function IntroChoice({ Button, Photo, onRequest }) {
  const reduce = useReducedMotion();
  const id = useId();
  const [item, setItem] = useState("박스");
  const [region, setRegion] = useState("수도권");
  const ordered = rankChoices(item, region);
  const transition = reduce ? { duration: 0 } : spring;

  return <section className="rb-choice-section" aria-labelledby={`${id}-title`}>
    <div className="rb-choice-shell">
      <div className="rb-choice-copy">
        <h2 id={`${id}-title`}>필요한 것과 지역.<br /><span>두 가지만.</span></h2>
        <p className="rb-choice-description">조건에 가까운 후보부터<br />간단히 비교할 수 있어요.</p>
        <div className="rb-choice-actions">
          <Button onClick={onRequest}>내 조건으로 시작하기 <ArrowRight size={21} aria-hidden="true" /></Button>
        </div>
      </div>

      <div className="rb-choice-visual">
        <div className="rb-choice-filters">
          {[
            { label: "품목", values: ["박스", "패키징", "부자재"], current: item, select: setItem },
            { label: "희망 지역", values: ["수도권", "충청", "지역 무관"], current: region, select: setRegion },
          ].map((filter) => <div className="rb-choice-filter" role="group" aria-label={`예시 ${filter.label}`} key={filter.label}>
            <span>{filter.label}</span>
            <div className="rb-choice-toggle">
              {filter.values.map((value) => <motion.button type="button" key={value}
                aria-pressed={filter.current === value} onClick={() => filter.select(value)}
                whileTap={reduce ? undefined : { scale: 0.95 }} transition={transition}>
                {filter.current === value && <motion.span className="rb-choice-toggle-current"
                  layoutId={reduce ? undefined : `${id}-${filter.label}`} transition={transition} aria-hidden="true" />}
                <span>{value}</span>
              </motion.button>)}
            </div>
          </div>)}
        </div>

        <div className="rb-choice-deck" aria-label="조건에 따라 정렬되는 테스트 후보">
          {ordered.map((choice, index) => <motion.article key={choice.id}
            className={`rb-choice-card ${index === 0 ? "rb-choice-card-first" : ""}`}
            layout={reduce ? false : "position"} initial={false}
            animate={{ y: reduce ? 0 : index === 0 ? -12 : 0, rotate: reduce ? 0 : index - 1 }}
            transition={transition}>
            <Photo index={choice.image} className="rb-choice-photo" label={`${choice.item} 이미지 예시`} />
            <div className="rb-choice-card-copy">
              <strong>{choice.name}</strong>
              <span>{choice.item} · {choice.region}</span>
              <span>최소 {choice.moq.toLocaleString()}개</span>
            </div>
            {choice.item === item && <span className="rb-choice-selected"><Check weight="bold" size={16} aria-hidden="true" /> 품목 일치</span>}
          </motion.article>)}
        </div>
        <span className="rb-choice-example" aria-live="polite">테스트 예시 · {item} · {region}</span>
      </div>
    </div>
  </section>;
}
