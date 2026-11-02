import { useId } from 'react';
import { ArrowRight } from '@phosphor-icons/react';
import './intro-choice.css';

const steps = [
  ['브랜드의 공고 등록', '품목, 수량, 규격을 담아 익명으로 공고를 올려요.'],
  ['파트너의 견적 제안', '디자인·제작 업체가 수량별 단가를 제안해요.'],
  ['선택과 계약', '브랜드가 한 제안을 선택하고 양측이 서명하면 운영팀이 소개해요.'],
];

export default function IntroChoice({ Button, Photo, onRequest }) {
  const id = useId();
  return <section className="rb-choice-section" aria-labelledby={`${id}-title`}>
    <div className="rb-choice-shell">
      <div className="rb-choice-copy">
        <h2 id={`${id}-title`}>우리 업체를 이해하고,<br /><span>맞는 파트너로.</span></h2>
        <p className="rb-choice-description">내가 원하는 조건을 올리고,<br />그 조건에 맞는 제안을 받아보세요.</p>
        <div className="rb-choice-actions"><Button onClick={onRequest}>파트너 찾기 <ArrowRight size={21} aria-hidden="true" /></Button></div>
      </div>
      <ol className="rb-choice-process" aria-label="파트너 연결 과정">{steps.map(([title, description], index) => <li key={title}>
        <Photo index={index} className="rb-choice-photo" label="패키징 연출 이미지" />
        <div><span>{String(index + 1).padStart(2, '0')}</span><h3>{title}</h3><p>{description}</p></div>
      </li>)}</ol>
    </div>
  </section>;
}
