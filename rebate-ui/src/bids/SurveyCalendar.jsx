import {useRef,useState} from 'react';
import {CaretLeft,CaretRight} from '@phosphor-icons/react';

const dateKey=date=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
const parse=value=>new Date(`${value}T12:00:00`);
const todayKey=()=>new Date(Date.now()+9*3600000).toISOString().slice(0,10);

export default function SurveyCalendar({value,onChange}){
 const today=todayKey(),[month,setMonth]=useState(()=>parse(value&&value>=today?value:today)),[focused,setFocused]=useState(value&&value>=today?value:today),days=useRef(null);
 const year=month.getFullYear(),monthIndex=month.getMonth(),first=new Date(year,monthIndex,1),count=new Date(year,monthIndex+1,0).getDate();
 function showDate(date){const key=dateKey(date);setMonth(date);setFocused(key<today?today:key);}
 function navigate(offset){const date=new Date(year,monthIndex+offset,1);showDate(dateKey(date)<today?parse(today):date);}
 function onKey(event,key){
  const date=parse(key),offset={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7,Home:-date.getDay(),End:6-date.getDay()}[event.key];
  if(offset!==undefined)date.setDate(date.getDate()+offset);
  else if(event.key==='PageUp'||event.key==='PageDown')date.setMonth(date.getMonth()+(event.key==='PageUp'?-1:1),1);
  else return;
  event.preventDefault();if(dateKey(date)<today)date.setTime(parse(today).getTime());showDate(date);
  requestAnimationFrame(()=>days.current?.querySelector(`[data-date="${dateKey(date)}"]`)?.focus());
 }
 return <div className="ob-calendar-field">
  <div className="ob-calendar">
   <div className="ob-calendar-nav"><button type="button" aria-label="이전 달" disabled={`${year}-${String(monthIndex+1).padStart(2,'0')}`<=today.slice(0,7)} onClick={()=>navigate(-1)}><CaretLeft size={19}/></button><strong aria-live="polite">{year}년 {monthIndex+1}월</strong><button type="button" aria-label="다음 달" onClick={()=>navigate(1)}><CaretRight size={19}/></button></div>
   <div className="ob-calendar-week" aria-hidden="true">{['일','월','화','수','목','금','토'].map(day=><span key={day}>{day}</span>)}</div>
   <div ref={days} className="ob-calendar-days" role="group" aria-label={`${year}년 ${monthIndex+1}월 날짜 선택`}>
    {Array.from({length:first.getDay()},(_,index)=><span key={`blank-${index}`}/>)}
    {Array.from({length:count},(_,index)=>{const day=index+1,key=dateKey(new Date(year,monthIndex,day));return <button key={key} type="button" data-date={key} tabIndex={key===focused?0:-1} disabled={key<today} aria-label={`${year}년 ${monthIndex+1}월 ${day}일`} aria-pressed={value===key} aria-current={key===today?'date':undefined} onFocus={()=>setFocused(key)} onKeyDown={event=>onKey(event,key)} onClick={()=>onChange(key)}>{day}</button>;})}
   </div><div className="ob-calendar-foot"><span aria-live="polite">{value?`${value.replaceAll('-','. ')}까지 필요해요`:'오늘 이후 날짜를 선택할 수 있어요.'}</span>{value&&<button type="button" onClick={()=>{onChange('');days.current?.querySelector('[tabindex="0"]')?.focus();}}>날짜 지우기</button>}</div>
  </div>
 </div>;
}
