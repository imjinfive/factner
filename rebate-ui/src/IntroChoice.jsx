import { useId } from 'react';
import { ArrowRight } from '@phosphor-icons/react';
import './intro-choice.css';

const steps = [
  ['가입과 검증', '운영팀이 업체와 신청 자료를 확인해요.'],
  ['업체 정보 준비', '패키징 사양과 제작 조건을 함께 정리해요.'],
  ['후보 선택과 연결', '원하는 후보를 여러 곳 고르면 운영팀이 연결을 검토해요.'],
];

export default function IntroChoice({ Button, Photo, onRequest }) {
  const id = useId();
  return <section className="rb-choice-section" aria-labelledby={`${id}-title`}>
    <div className="rb-choice-shell">
      <div className="rb-choice-copy">
        <h2 id={`${id}-title`}>우리 업체를 이해하고,<br /><span>맞는 파트너로.</span></h2>
        <p className="rb-choice-description">가입 검증부터 정보 정리까지.<br />실제 자료를 바탕으로 연결해요.</p>
        <div className="rb-choice-actions"><Button onClick={onRequest}>파트너 찾기 시작 <ArrowRight size={21} aria-hidden="true" /></Button></div>
      </div>
      <ol className="rb-choice-process" aria-label="파트너 연결 과정">{steps.map(([title, description], index) => <li key={title}>
        <Photo index={index} className="rb-choice-photo" label="패키징 연출 이미지" />
        <div><span>{String(index + 1).padStart(2, '0')}</span><h3>{title}</h3><p>{description}</p></div>
      </li>)}</ol>
    </div>
  </section>;
}
