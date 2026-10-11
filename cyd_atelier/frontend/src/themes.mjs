import {allProjectWidgets} from './pages.mjs';
export const THEMES = [
  {id:'night',name:'Nachtblau',description:'Dunkles Blau · helle Texte',background:'#0c1422',widget:'#182334',text:'#f6f8fc',muted:'#b8c7de',icon:'#8cadff',border:'#5978b5'},
  {id:'light',name:'Klar',description:'Helles Grau · blaue Akzente',background:'#edf2f6',widget:'#ffffff',text:'#172b4d',muted:'#43576f',icon:'#2455ac',border:'#7792b2'},
  {id:'espresso',name:'Espresso',description:'Warmes Braun · cremefarbene Texte',background:'#201813',widget:'#342820',text:'#fff1dc',muted:'#dfc6a8',icon:'#e5b77b',border:'#a4835c'},
  {id:'espresso-light',name:'Espresso Hell',description:'Helles Creme · warme Kaffee-Akzente',background:'#f5ecdf',widget:'#fff9ef',text:'#382519',muted:'#6b503b',icon:'#865226',border:'#ab8765'}
];
export const getTheme=id=>THEMES.find(t=>t.id===id);
export const widgetTheme=(w,t)=>({bg:t.widget,color:t.text,nameColor:w.kind==='text'?t.text:t.muted,iconColor:t.icon,borderColor:t.border});
export function themeWidget(w,id){const t=getTheme(id);if(t)Object.assign(w,widgetTheme(w,t));return w;}
export function applyTheme(p,id){const t=getTheme(id);if(!t)return false;p.themeId=id;p.background=t.background;for(const page of p.pages||[])page.background=t.background;for(const w of allProjectWidgets(p))themeWidget(w,id);return true;}
export function themeMatches(p,t){return !!t&&p.background===t.background&&allProjectWidgets(p).every(w=>Object.entries(widgetTheme(w,t)).every(([key,value])=>w[key]===value));}
