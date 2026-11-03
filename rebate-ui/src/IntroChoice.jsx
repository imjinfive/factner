import { useId } from 'react';
import { ArrowRight } from '@phosphor-icons/react';
import './intro-choice.css';

const steps = [
  ['브랜드의 공고 등록', '품목, 수량, 규격을 담아 익명으로 공고를 올려요.'],
  ['제작업체의 견적 제안', '패키징 제작업체가 수량별 단가와 제작 조건을 제안해요.'],
  ['거래 연결 요청', '브랜드가 제안을 선택하면 운영팀이 양쪽을 확인하고 연결해요.'],
];

export default function IntroChoice({ Button, Photo, onRequest }) {
  const id = useId();
  return <section className="rb-choice-section" aria-labelledby={`${id}-title`}>
    <div className="rb-choice-shell">
      <div className="rb-choice-copy">
        <h2 id={`${id}-title`}>패키징 제작을<br />의뢰하는 방법</h2>
        <p className="rb-choice-description">같은 제작 조건으로 받은 견적을 비교하고 함께할 업체를 선택하세요.</p>
        <div className="rb-choice-actions"><Button onClick={onRequest}>파트너 찾기 <ArrowRight size={21} aria-hidden="true" /></Button></div>
      </div>
      <ol className="rb-choice-process" aria-label="파트너 연결 과정">{steps.map(([title, description], index) => <li key={title}>
        <Photo index={index} className="rb-choice-photo" label="패키징 연출 이미지" />
        <div><span>{String(index + 1).padStart(2, '0')}</span><h3>{title}</h3><p>{description}</p></div>
      </li>)}</ol>
    </div>
  </section>;
}
