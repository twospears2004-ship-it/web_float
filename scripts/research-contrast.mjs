// Browser observation only: sample rendered colors, ancestor opacity and text
// bounds. No game hooks, style overrides or campaign mutations.
export function researchContrast(button){
  const rgb=color=>color.match(/[\d.]+/g).slice(0,3).map(Number);
  const luminance=color=>rgb(color).map(n=>{const c=n/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;}).reduce((sum,c,i)=>sum+c*[.2126,.7152,.0722][i],0);
  const background=luminance(getComputedStyle(button).backgroundColor),box=button.getBoundingClientRect();
  return [...button.children].map(node=>{
    const style=getComputedStyle(node),light=luminance(style.color),rect=node.getBoundingClientRect();let opacity=1;
    for(let parent=node;parent;parent=parent.parentElement)opacity*=Number(getComputedStyle(parent).opacity);
    return {text:node.textContent,contrast:(Math.max(light,background)+.05)/(Math.min(light,background)+.05),opacity,inside:rect.left>=box.left&&rect.right<=box.right,wrapped:node.scrollWidth<=node.clientWidth+1};
  });
}
