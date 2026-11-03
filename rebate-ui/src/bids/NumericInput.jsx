import {forwardRef, useLayoutEffect, useRef, useState} from 'react';
import {formatNumericInput, numericInputEdit, numericDeletionCaret, finishNumericInput} from './numeric-input.js';

const NumericInput = forwardRef(function NumericInput({value = '', onValueChange, allowDecimal = false, maxLength,
  onChange, onBlur, onSelect, onBeforeInput, onKeyDown, onPaste, onCompositionStart, onCompositionEnd, ...props}, forwardedRef) {
  const input = useRef(null), composing = useRef(false), before = useRef({start:0,end:0}), pending = useRef(null);
  const [composition, setComposition] = useState(null), [, rerender] = useState(0);
  const display = formatNumericInput(value);
  function remember(target) { before.current = {start:target.selectionStart ?? 0,end:target.selectionEnd ?? 0}; }
  function skipSeparator(target,direction) {
    const caret=numericDeletionCaret(target.value,target.selectionStart,target.selectionEnd,direction);
    if(caret!==null)target.setSelectionRange(caret,caret);
  }
  useLayoutEffect(() => {
    const selection = pending.current;
    pending.current = null;
    if (selection && input.current === document.activeElement && !composing.current) input.current.setSelectionRange(selection.start,selection.end);
  });
  function commit(event) {
    const target = event.currentTarget;
    const edit = numericInputEdit(target.value,target.selectionStart,target.selectionEnd,allowDecimal,maxLength);
    pending.current = edit || before.current;
    target.value = edit?.display ?? display;
    if (edit) { onValueChange(edit.raw);onChange?.(event); }
    rerender(count => count + 1);
  }
  return <input {...props} type="text" inputMode={allowDecimal?'decimal':'numeric'} value={composition ?? display}
    ref={element => {input.current=element;if(typeof forwardedRef==='function')forwardedRef(element);else if(forwardedRef)forwardedRef.current=element;}}
    onBeforeInput={event => {onBeforeInput?.(event);if(!event.defaultPrevented)skipSeparator(event.currentTarget,({deleteContentBackward:'backward',deleteContentForward:'forward'})[event.nativeEvent.inputType]);remember(event.currentTarget);}}
    onKeyDown={event => {onKeyDown?.(event);if(!event.defaultPrevented&&!event.ctrlKey&&!event.metaKey&&!event.altKey)skipSeparator(event.currentTarget,({Backspace:'backward',Delete:'forward'})[event.key]);remember(event.currentTarget);}}
    onPaste={event => {remember(event.currentTarget);onPaste?.(event);}}
    onSelect={event => {remember(event.currentTarget);onSelect?.(event);}}
    onChange={event => {if(composing.current || event.nativeEvent.isComposing)setComposition(event.currentTarget.value);else commit(event);}}
    onBlur={event => {if(!composing.current){const finished=finishNumericInput(event.currentTarget.value,allowDecimal);if(finished!==null&&finished!==String(value)){event.currentTarget.value=formatNumericInput(finished);onValueChange(finished);}}onBlur?.(event);}}
    onCompositionStart={event => {remember(event.currentTarget);composing.current=true;setComposition(event.currentTarget.value);onCompositionStart?.(event);}}
    onCompositionEnd={event => {composing.current=false;setComposition(null);commit(event);onCompositionEnd?.(event);}}/>;
});

export default NumericInput;
