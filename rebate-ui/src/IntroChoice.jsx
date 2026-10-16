import { useId, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowLeft, ArrowRight, Check } from "@phosphor-icons/react";
import { suppliers } from "./model.js";
import "./intro-choice.css";

const choices = suppliers.slice(0, 3);
const spring = { type: "spring", stiffness: 240, damping: 25, mass: 0.9 };

export default function IntroChoice({ Button, Photo, onExplore, onRequest, onSupplier }) {
  const reduce = useReducedMotion();
  const id = useId();
  const [mode, setMode] = useState("direct");
  const [selected, setSelected] = useState(1);
  const comparing = mode === "compare";
  const current = choices[selected];
  const transition = reduce ? { duration: 0 } : spring;

  function cardContent(supplier) {
    return (
      <>
        <Photo index={supplier.image} className="rb-choice-photo" />
        <span className="rb-choice-card-copy">
          <strong>{supplier.name}</strong>
          <span>최소 {supplier.moq.toLocaleString()}개</span>
        </span>
      </>
    );
  }

  function selectNext(direction) {
    setSelected((index) => (index + direction + choices.length) % choices.length);
  }

  return (
    <section className="rb-choice-section" aria-labelledby={`${id}-title`}>
      <div className="rb-choice-shell">
        <div className="rb-choice-copy">
          <h2 id={`${id}-title`}>
            견적 받는 일도,
            <br />
            <span>쉽고 간편하게.</span>
          </h2>
          <div className="rb-choice-toggle" aria-label="업체 선택 방법">
            {[["direct", "직접 선택"], ["compare", "비교 견적"]].map(([value, label]) => (
              <motion.button
                key={value}
                type="button"
                aria-pressed={mode === value}
                onClick={() => setMode(value)}
                whileTap={reduce ? undefined : { scale: 0.95 }}
                transition={transition}
              >
                {mode === value && (
                  <motion.span
                    className="rb-choice-toggle-current"
                    layoutId={reduce ? undefined : `${id}-toggle`}
                    transition={transition}
                    aria-hidden="true"
                  />
                )}
                <span>{label}</span>
              </motion.button>
            ))}
          </div>
          <p className="rb-choice-description">
            {comparing ? (
              <>필요한 조건은 한 번만.<br />여러 업체의 제안을 비교하세요.</>
            ) : (
              <>제작 사례를 살펴보고<br />마음에 드는 업체와 상담하세요.</>
            )}
          </p>
          <div className="rb-choice-actions">
            <Button onClick={comparing ? onRequest : () => onSupplier(current)}>
              {comparing ? "견적 요청하기" : "업체 자세히 보기"}
              <ArrowRight size={21} aria-hidden="true" />
            </Button>
            <button type="button" className="rb-choice-browse" onClick={onExplore}>
              모든 업체 보기
            </button>
          </div>
        </div>

        <div className={`rb-choice-visual ${comparing ? "rb-choice-comparing" : ""}`}>
          <div className="rb-choice-conditions" aria-hidden={!comparing}>
            {["품목", "수량", "납기"].map((label, index) => (
              <motion.span
                key={label}
                initial={false}
                animate={{
                  opacity: comparing ? 1 : 0,
                  x: comparing || reduce ? 0 : (index - 1) * 60,
                  y: comparing || reduce ? 0 : 48 + index * 10,
                  rotate: comparing || reduce ? 0 : (index - 1) * 14,
                  scale: comparing || reduce ? 1 : 0.75,
                }}
                transition={reduce ? transition : { ...spring, delay: comparing ? index * 0.06 : 0 }}
              >
                <Check weight="bold" size={16} aria-hidden="true" /> {label}
              </motion.span>
            ))}
          </div>

          <div className="rb-choice-deck" role="group" aria-label="예시 업체 선택">
            {choices.map((supplier, index) => {
              const position = index === selected ? 0 : index === (selected + 1) % choices.length ? 1 : -1;
              const active = index === selected;
              return (
                <motion.button
                  key={supplier.id}
                  type="button"
                  className="rb-choice-card"
                  aria-label={`${supplier.name} 선택`}
                  aria-pressed={active}
                  initial={false}
                  animate={{
                    x: comparing ? `${(index - 1) * 98}%` : `${position * 86}%`,
                    y: comparing ? 18 : active ? -18 : 35,
                    rotate: comparing || reduce ? 0 : position * 10,
                    rotateY: comparing || reduce ? 0 : position * -14,
                    scale: comparing ? 0.91 : active ? 1.08 : 0.91,
                  }}
                  style={{ zIndex: active ? 3 : 1 }}
                  whileTap={reduce ? undefined : { scale: 0.95 }}
                  transition={transition}
                  onClick={() => setSelected(index)}
                >
                  {cardContent(supplier)}
                  {!comparing && active && (
                    <span className="rb-choice-selected" aria-hidden="true">
                      <Check weight="bold" size={17} />
                    </span>
                  )}
                </motion.button>
              );
            })}
          </div>

          <div className="rb-choice-mobile-deck">
            {comparing ? (
              <div className="rb-choice-mobile-comparison" role="group" aria-label="예시 업체 비교">
                {choices.map((supplier, index) => (
                  <motion.button
                    key={supplier.id}
                    type="button"
                    className="rb-choice-mobile-row"
                    aria-label={`${supplier.name} 선택`}
                    aria-pressed={index === selected}
                    initial={reduce ? false : { x: 24, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={reduce ? transition : { ...spring, delay: index * 0.07 }}
                    whileTap={reduce ? undefined : { scale: 0.98 }}
                    onClick={() => setSelected(index)}
                  >
                    {cardContent(supplier)}
                  </motion.button>
                ))}
              </div>
            ) : (
              <>
                <div className="rb-choice-mobile-window">
                  <AnimatePresence initial={false} mode="wait">
                    <motion.div
                      key={current.id}
                      className="rb-choice-mobile-card"
                      initial={reduce ? false : { x: 38, rotate: 4, opacity: 0 }}
                      animate={{ x: 0, rotate: 0, opacity: 1 }}
                      exit={reduce ? {} : { x: -38, rotate: -4, opacity: 0 }}
                      transition={reduce ? transition : { duration: 0.22 }}
                    >
                      {cardContent(current)}
                    </motion.div>
                  </AnimatePresence>
                </div>
                <div className="rb-choice-mobile-controls">
                  <motion.button
                    type="button"
                    aria-label="이전 업체"
                    onClick={() => selectNext(-1)}
                    whileTap={reduce ? undefined : { scale: 0.9 }}
                  ><ArrowLeft size={20} aria-hidden="true" /></motion.button>
                  <span aria-live="polite">{selected + 1} / {choices.length}</span>
                  <motion.button
                    type="button"
                    aria-label="다음 업체"
                    onClick={() => selectNext(1)}
                    whileTap={reduce ? undefined : { scale: 0.9 }}
                  ><ArrowRight size={20} aria-hidden="true" /></motion.button>
                </div>
              </>
            )}
          </div>
          <span className="rb-choice-example">이용 예시</span>
        </div>
      </div>
    </section>
  );
}
