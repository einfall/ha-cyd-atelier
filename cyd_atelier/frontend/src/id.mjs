// Local design and widget identifiers also work over plain HTTP and older WebViews.
let fallbackSeed=0;
export function createId(){
 const crypto=globalThis.crypto;
 if(typeof crypto?.randomUUID==='function')return crypto.randomUUID();
 const bytes=new Uint8Array(16);
 if(typeof crypto?.getRandomValues==='function')crypto.getRandomValues(bytes);
 else {
  // These IDs are not credentials. Keep a changing seed when Web Crypto is absent.
  for(let i=0;i<bytes.length;i++)bytes[i]=Math.floor(Math.random()*256);
  fallbackSeed=Math.max(Date.now(),fallbackSeed+1);
  let seed=fallbackSeed;
  for(let i=15;i>=10;i--){bytes[i]^=seed%256;seed=Math.floor(seed/256);}
 }
 bytes[6]=(bytes[6]&0x0f)|0x40;
 bytes[8]=(bytes[8]&0x3f)|0x80;
 const hex=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
 return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
