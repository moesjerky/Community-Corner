// Finds every column in an issue PDF (Story of the Week, Recipe of the Week, ...) and cuts each one out as a picture.
// How: every column has a coloured bar with its name and "By: writer". For each "By:" in the PDF's text we find the
// bar's colour on the rendered page, follow that colour around the column's border to get the whole box, then crop it.
// Needs pdf.js (pdfjsLib) on the page. Returns [{name, by, ar, blob}].
const COL_NAMES=[ // [pattern on the lowercased header, the name shown on the website]
  [/story of the week/,'Story of the Week'],[/parsha question/,'Parsha Question'],[/mega vort/,'Mega Vort'],
  [/recipe of the week/,'Recipe of the Week'],[/state of the week/,'State of the Week'],[/crazy animal corner/,'Crazy Animal Corner'],
  [/week in jewi/,'This Week in Jewish History'],[/noach.s jokes/,"Noach's Jokes & Riddles"],[/b.kitzur/,"B'Kitzur"],
  [/sheenayim mikra/,'Sheenayim Mikra'],[/jonah.s (jewish )?jokes/,"Jonah's Jewish Jokes"],[/joke of the week/,'Joke of the Week'],
  [/mitzvah of the week/,'Mitzvah of the Week'],[/tefillah of the week/,'Tefillah of the Week'],[/jewish news/,'Jewish News'],
  [/song of the week/,'Song of the Week'],[/trivia/,'Weekly Trivia'],[/super cool facts/,'Super Cool Facts'],[/intrigue/,'Intrigue'],
  [/pesach dvar torah/,'Pesach Dvar Torah'],[/chol hamoed trips/,'Chol Hamoed Trips'],[/cool by mistake/,'Cool By Mistake Inventions'],
  [/did you know/,'Did You Know'],[/interesting facts about pesach/,'Interesting Facts About Pesach']];
const COL_WRITERS={'Dr. Shaul Schwalb':'Rabbi Dr. Shaul Schwalb','Chanalee-The Challah Fairy':'Chanalee, The Challah Fairy','Asher Yotzar':''};
const colSlug=s=>String(s||'').toLowerCase().replace(/['’]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
function colName(head){
  const l=head.toLowerCase().replace(/’/g,"'");
  for(const [re,name] of COL_NAMES)if(re.test(l))return name;
  // a brand new column: keep its own name, tidied up ("NEW COLUMN" -> "New Column")
  const t=head.replace(/[!:.\s]+$/,'').trim();
  return t===t.toUpperCase()?t.toLowerCase().replace(/(^|\s)\S/g,m=>m.toUpperCase()):t;
}
const colTidy=s=>s.replace(/\s+/g,' ').trim();
async function colRender(pg,width){
  const v1=pg.getViewport({scale:1}),vp=pg.getViewport({scale:width/v1.width});
  const c=document.createElement('canvas');c.width=Math.round(vp.width);c.height=Math.round(vp.height);
  const ctx=c.getContext('2d',{willReadFrequently:true});ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);
  await pg.render({canvasContext:ctx,viewport:vp}).promise;
  return {c,ctx,vp};
}
async function findColumns(doc,onStep){
  const PW=2000,found=[];
  for(let n=1;n<=doc.numPages;n++){
    const pg=await doc.getPage(n),tc=await pg.getTextContent();
    if(!tc.items.some(t=>/By\s*:/.test(t.str)))continue;
    onStep&&onStep(n,doc.numPages);
    const {c,ctx,vp}=await colRender(pg,PW),PH=c.height,px=ctx.getImageData(0,0,PW,PH).data;
    // every piece of text with its place on the picture
    const items=tc.items.filter(t=>t.str&&t.str.trim()).map(t=>{
      const m=pdfjsLib.Util.transform(vp.transform,t.transform),fh=Math.hypot(m[2],m[3])||10;
      return {str:t.str,x:m[4],y:m[5]-fh*.8,w:t.width*vp.scale,h:fh};
    });
    const cols=[];
    for(const it of items){
      const at=it.str.search(/By\s*:/);if(at<0)continue;
      const bx0=Math.round(it.x+it.w*(at/it.str.length)),by0=Math.round(it.y),by1=Math.round(it.y+it.h);
      const sy=Math.max(1,Math.min(PH-2,Math.round((by0+by1)/2)));
      // look just left of "By:" for the bar colour (skip the white letters)
      let seed=null,sx=0;
      for(let dx=4;dx<=40;dx+=3){const x=bx0-dx;if(x<2)break;const o=(sy*PW+x)*4,r=px[o],g=px[o+1],b=px[o+2];
        if(Math.max(r,g,b)-Math.min(r,g,b)>55||(r*3+g*6+b)/10<200){seed=[r,g,b];sx=x;break}}
      if(!seed)continue;
      // spread along that colour: the bar plus the box border
      const seen=new Uint8Array(PW*PH),stack=[sy*PW+sx];seen[sy*PW+sx]=1;
      let minX=sx,maxX=sx,minY=sy,maxY=sy,count=0,barMinX=sx,barMaxX=sx;
      while(stack.length){
        const i=stack.pop(),x=i%PW,y=(i-x)/PW;count++;
        if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;
        if(y>=by0-6&&y<=by1+6){if(x<barMinX)barMinX=x;if(x>barMaxX)barMaxX=x}
        const o=i*4,hr=px[o],hg=px[o+1],hb=px[o+2];
        for(let k=0;k<4;k++){
          const nx=x+(k===0?-1:k===1?1:0),ny=y+(k===2?-1:k===3?1:0);
          if(nx<0||ny<0||nx>=PW||ny>=PH)continue;
          const j=ny*PW+nx;if(seen[j])continue;
          const p=j*4,r=px[p],g=px[p+1],b=px[p+2];
          const d=Math.abs(r-seed[0])+Math.abs(g-seed[1])+Math.abs(b-seed[2]);
          const step=Math.abs(r-hr)+Math.abs(g-hg)+Math.abs(b-hb),chroma=Math.max(r,g,b)-Math.min(r,g,b);
          if(d<70||(step<34&&chroma>48)){seen[j]=1;stack.push(j)}
        }
      }
      const bw=maxX-minX,bh=maxY-minY;
      if(bw<PW/14||bw>PW*6/10||count<800)continue;                 // not a column header
      // the words printed on the bar, left to right: "Column name  By: Writer"
      // (the name can be in bigger letters, so it gets more room up and down than the writer does)
      const line=items.filter(t=>{const cy=t.y+t.h/2,slack=it.h*(t.x<it.x-2?1.1:.55);
        return cy>by0-slack&&cy<by1+slack&&t.x>=barMinX-6&&t.x<barMaxX+6})
        .sort((a,b)=>a.x-b.x).map(t=>t.str).join(' ');
      const cut=line.search(/By\s*:/);if(cut<0)continue;
      const head=colTidy(line.slice(0,cut));
      let who=colTidy(line.slice(cut).replace(/^By\s*:/,'')).replace(/[\s\-–]*\(?\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4}.*$/,'').replace(/\s+By\s*:.*$/,'').replace(/\s+\d{1,2}$/,'');
      if(head.length<3||head.length>60||who.length<3)continue;
      who=who.slice(0,60);if(who in COL_WRITERS)who=COL_WRITERS[who];
      // the joke crew changes a little week to week: keep them as one writer in the archive
      if(/joke of the week/i.test(head)&&/Yitz Fine/i.test(who))who='Yitz Fine, Mesh Fine & friends';
      cols.push({x:minX/PW,y:minY/PH,w:bw/PW,h:bh/PH,name:colName(head),by:who,seed});
    }
    c.width=c.height=0;
    if(!cols.length)continue;
    cols.sort((a,b)=>a.y-b.y);
    // cut each one out of a sharper copy of the page
    const big=await colRender(pg,3400),BW=big.c.width,BH=big.c.height;
    for(const col of cols){
      let {x,y,w,h}=col;
      // did the trace stop partway down a box whose colour fades out (no paper showing right under where it stopped)?
      let faded=false;
      if(h>=.09&&h<.14){const yy=Math.min(PH-1,Math.round((y+h)*PH)+7),fx0=Math.round((x+w*.15)*PW),fx1=Math.round((x+w*.85)*PW);let pap=0,n=0;
        for(let xx=fx0;xx<fx1;xx+=2){const o=(yy*PW+xx)*4,r=px[o],g=px[o+1],b=px[o+2];n++;if(r>232&&g>215&&r-b>=9&&r-b<=75)pap++}
        faded=pap<n*.5}
      if(h<.09||faded){   // only the bar (or the top of the box) was traced: run it down to whatever comes next underneath (or a sensible height)
        // the next column below it. A big box that merely wraps around this one (a story with this box set into it) doesn't count
        const below=cols.filter(d=>d!==col&&d.y>y+.03&&d.x<x+w-.02&&d.x+d.w>x+.02&&d.x>x-.03&&d.w<w*1.6).map(d=>d.y);
        let bottom=below.length?Math.min(...below)-.008:.955;
        // ...or the box's own bottom border: a thin straight line in the bar's colour
        {const lx0=Math.round((x+w*.1)*PW),lx1=Math.round((x+w*.9)*PW),sd=col.seed;
          for(let yy=Math.round((y+Math.max(h,.03)+.012)*PH);yy<Math.min(PH-1,Math.round(Math.min(bottom,y+.33)*PH));yy++){
            let k=0;for(let xx=lx0;xx<lx1;xx+=2){const o=(yy*PW+xx)*4;if(Math.abs(px[o]-sd[0])+Math.abs(px[o+1]-sd[1])+Math.abs(px[o+2]-sd[2])<90)k++}
            if(k>(lx1-lx0)/2*.7){bottom=Math.min(bottom,(yy+3)/PH);break}
          }}
        // ...or the next coloured header bar, even one with no "By:" on it (Tefillah of the Week)
        const bx0=Math.round((x+w*.08)*PW),bx1=Math.round((x+w*.7)*PW);
        let run=0;
        for(let yy=Math.round((y+h+.025)*PH);yy<Math.min(PH-1,Math.round((y+.33)*PH));yy++){
          let k=0;for(let xx=bx0;xx<bx1;xx+=2){const o=(yy*PW+xx)*4,r=px[o],g=px[o+1],b=px[o+2];if(Math.max(r,g,b)-Math.min(r,g,b)>70&&(r*3+g*6+b)/10<190)k++}
          if(k>(bx1-bx0)/2*.6){if(++run>=8){bottom=Math.min(bottom,(yy-run)/PH-.016);break}}else run=0;
        }
        h=Math.max(Math.min(h,.10),Math.min(bottom-y,.32));w=Math.max(w,.205);
      }
      const pad=.004;x=Math.max(0,x-pad);y=Math.max(0,y-pad);w=Math.min(1-x,w+2*pad);h=Math.min(1-y,h+2*pad);
      const sw=Math.round(w*BW),sh=Math.round(h*BH),k=Math.min(1,1000/sw);
      const out=document.createElement('canvas');out.width=Math.round(sw*k);out.height=Math.round(sh*k);
      out.getContext('2d').drawImage(big.c,Math.round(x*BW),Math.round(y*BH),sw,sh,0,0,out.width,out.height);
      const blob=await new Promise(r=>out.toBlob(r,'image/jpeg',.82));
      found.push({name:col.name,by:col.by,ar:+(out.width/out.height).toFixed(3),blob,page:n,box:[x,y,w,h].map(v=>+v.toFixed(4))});
      out.width=out.height=0;
    }
    big.c.width=big.c.height=0;
  }
  // one of each column per issue
  const seen=new Set();
  return found.filter(f=>{const s=colSlug(f.name);if(!s||seen.has(s))return false;seen.add(s);return true});
}
