export function normalizeScreenControl(c={}){
 c=c&&typeof c==='object'?c:{};const n=Number(c.brightness);
 return {brightness:Number.isFinite(n)?Math.round(Math.max(1,Math.min(100,n))):100,gateEnabled:!!c.gateEnabled,gateEntity:String(c.gateEntity||'').trim().slice(0,200),lightId:String(c.lightId||'').replace(/[^\w]/g,''),touchEnabled:!!c.touchEnabled,touchSeconds:Number.isFinite(Number(c.touchSeconds))?Math.round(Math.max(1,Math.min(600,Number(c.touchSeconds)))):10,touchscreenId:String(c.touchscreenId||'').replace(/[^\w]/g,'')};
}
export const gateTruthCPP=value=>`${value} == "on" || ${value} == "true" || ${value} == "1"`;
