// Keep keyboard navigation inside the visible modal, including when the
// focused control is an input whose game hotkeys are deliberately disabled.
export function installDialogKeyboard(doc=document){
  const handle=event=>{
    if(event.ctrlKey||event.metaKey||event.altKey)return;
    if(event.key!=='Tab'&&event.key!=='Escape')return;
    const dialogs=[...doc.querySelectorAll('.overlay [role="dialog"][aria-modal="true"]')];
    const dialog=dialogs.filter(element=>!element.closest('[hidden]')&&element.getClientRects().length).at(-1);
    if(!dialog)return;
    if(event.key==='Escape'){
      const close=dialog.querySelector('#close-settings,#close-help,#cancel-new');
      if(close){event.preventDefault();event.stopPropagation();if(!event.repeat)close.click();}
      return;
    }
    const controls=[...dialog.querySelectorAll('button,a[href],input,select,textarea,summary,[tabindex]')].filter(element=>element.tabIndex>=0&&!element.matches(':disabled')&&!element.closest('[hidden]')&&element.getClientRects().length);
    if(!controls.length)return;
    event.preventDefault();event.stopPropagation();
    const current=controls.indexOf(doc.activeElement);
    const next=current<0?(event.shiftKey?controls.length-1:0):(current+(event.shiftKey?-1:1)+controls.length)%controls.length;
    controls[next].focus();
  };
  doc.addEventListener('keydown',handle,true);
  return ()=>doc.removeEventListener('keydown',handle,true);
}
