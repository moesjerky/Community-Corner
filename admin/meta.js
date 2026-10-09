// Reads the facts printed on an issue's cover straight from the PDF's own text (no guessing, no picture reading):
// issue number, the real date, the Hebrew date, the title ("Parshas Bereishis", "Pesach Edition") and, on Yom Tov
// weeks, the candle lighting and tzais times. Needs pdf.js. Returns {} for anything it can't find.
const META_MONTHS=['january','february','march','april','may','june','july','august','september','october','november','december'];
const metaCase=s=>s.toLowerCase().replace(/(^|[\s-])([a-z])/g,(m,a,b)=>a+b.toUpperCase());
async function readMeta(doc){
  for(let n=1;n<=doc.numPages;n++){
    const pg=await doc.getPage(n),vp=pg.getViewport({scale:1}),tc=await pg.getTextContent();
    if(!tc.items.some(t=>/Editor-in-chief/i.test(t.str)))continue;            // the cover is the page with the masthead
    const items=tc.items.filter(t=>t.str&&t.str.trim()).map(t=>{const m=pdfjsLib.Util.transform(vp.transform,t.transform);
      return {s:t.str.replace(/\s+/g,' ').trim(),x:m[4]/vp.width,y:m[5]/vp.height,h:Math.hypot(m[2],m[3])/vp.height}}).filter(t=>t.y<.3);
    const out={};
    for(const t of items){
      let m;
      if(!out.num&&(m=t.s.match(/^issue\s*#\s*(\d+)$/i)))out.num=+m[1];
      if(!out.date&&(m=t.s.match(/^([A-Za-z]+)\s+(\d{1,2})\s*,\s*(\d{4})$/))){const mo=META_MONTHS.indexOf(m[1].toLowerCase());
        if(mo>=0)out.date=`${m[3]}-${String(mo+1).padStart(2,'0')}-${String(+m[2]).padStart(2,'0')}`}
      if(!out.hebrew&&(m=t.s.match(/^(?:SUN|MON|TUES|WEDNES|THURS|FRI|SATUR)DAY,\s*(\d{1,2})\s+([A-Za-z' ]+?),\s*(\d{4})$/i)))out.hebrew=`${+m[1]} ${metaCase(m[2])} ${m[3]}`;
    }
    // title: the big words in the masthead (each is printed twice for its shadow), left to right
    const big=items.filter(t=>t.h>=.028&&t.x>.55&&/^[A-Za-z'\u2019\u2018 -]+$/.test(t.s)),seen=new Set(),words=[];
    big.sort((a,b)=>Math.abs(a.x-b.x)<.02?a.y-b.y:a.x-b.x).forEach(t=>{const k=t.s.toLowerCase();if(!seen.has(k)){seen.add(k);words.push(metaCase(t.s.replace(/[\u2019\u2018]/g,"'")))}});
    if(words.length)out.title=words.join(' ');
    // Yom Tov weeks print "YOM TOV BEGINS/STARTS" instead of "SHABBOS STARTS": only then do the times get saved
    if(items.some(t=>/^yom tov$/i.test(t.s))){
      const times=items.filter(t=>/^\d{1,2}:\d{2}\s*[AP]M$/i.test(t.s)).sort((a,b)=>a.x-b.x);
      if(times.length){out.yomtov=times[0].s.toUpperCase();if(times.length>1)out.tzais=times[times.length-1].s.toUpperCase()}
    }
    return out;
  }
  return {};
}
