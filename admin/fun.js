// Reads the Fun Stuff out of an issue PDF so nobody has to type it in:
//  - parsha question, last week's answer, word of the week and the cool fact are real text in the PDF
//  - the word search is a picture, so we find its grid lines on the rendered page and read each square's letter
// Needs pdf.js (pdfjsLib). The letter reader (Tesseract) is only downloaded when a word search is found.
// Returns {fun, notes:[...]} where fun has the same shape the editor saves; anything it can't read is left out.
const FUN_OCR='https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
function funLoadOcr(){
  if(window.Tesseract)return Promise.resolve();
  return new Promise((ok,no)=>{const s=document.createElement('script');s.src=FUN_OCR;s.onload=ok;s.onerror=()=>no(new Error('reader blocked'));document.head.append(s)});
}
// text of the page as lines: [{y,x,h,str}] in fractions of the page
function funLines(items){
  const rows=[];
  items.slice().sort((a,b)=>a.y-b.y||a.x-b.x).forEach(t=>{
    const r=rows.find(r=>Math.abs(r.y-t.y)<.004&&Math.abs(r.h-t.h)<.002&&t.x<r.x1+.015&&t.x>r.x0-.3);
    if(r){r.parts.push(t);r.x1=Math.max(r.x1,t.x+t.w);r.x0=Math.min(r.x0,t.x);r.h=Math.max(r.h,t.h)}else rows.push({y:t.y,x0:t.x,x1:t.x+t.w,h:t.h,parts:[t]});
  });
  return rows.map(r=>({y:r.y,x:r.x0,h:r.h,str:r.parts.sort((a,b)=>a.x-b.x).map(p=>p.str).join(' ').replace(/\s+/g,' ').trim()}));
}
// the lines sitting under a heading, in the same column, until a big gap or another heading
function funUnder(lines,head,maxDown){
  const out=[];let last=head.y;
  for(const l of lines){
    if(l===head||l.y<=head.y+.002||l.y>head.y+maxDown)continue;
    if(l.x<head.x-.06||l.x>head.x+.2)continue;
    if(/^By\s*:/.test(l.str))continue;
    if(l.h>=.0165)break;                       // next heading
    if(l.y-last>.05)break;
    out.push(l);last=l.y;
  }
  return out;
}
function funText(pagesItems){
  const fun={};
  for(const items of pagesItems){
    const lines=funLines(items);
    // parsha question
    const ph=lines.find(l=>/^parsha question/i.test(l.str)&&l.h>=.012);
    if(ph&&!fun.parsha){
      const u=funUnder(lines,ph,.2),stop=u.findIndex(l=>/stay tuned/i.test(l.str));
      const q=(stop<0?u.slice(0,3):u.slice(0,stop)).map(l=>l.str).join(' ').trim();
      const rest=u.slice(u.findIndex(l=>/answer to last/i.test(l.str))+1).map(l=>l.str).join(' ');
      const m=rest.match(/Q\.?\s*(.*?)\s*A\.\s*(.*)$/);
      if(q)fun.parsha={question:q,lastQ:m?m[1].trim():'',lastA:m?m[2].trim():''};
    }
    // word of the week
    const wh=lines.find(l=>/^word of the week/i.test(l.str));
    if(wh&&!fun.word){
      const u=funUnder(lines,wh,.09),all=u.map(l=>l.str).join(' \n ');
      const first=(wh.str.replace(/^word of the week:?\s*/i,'')||(u[0]?u[0].str:'')).trim();
      const word=(first.match(/^[A-Za-z'’-]+/)||[''])[0];
      const say=(first.match(/\(([^)]*[-·][^)]*)\)/)||[])[1]||'';
      const mean=(all.match(/(?:Definition|Meaning)\s*:\s*([\s\S]*?)(?=\n\s*Example|$)/i)||[])[1]||'';
      const ex=(all.match(/Example\s*:\s*([\s\S]*)$/i)||[])[1]||'';
      const tidy=s=>s.replace(/\s*\n\s*/g,' ').replace(/^[“"]|[”"]$/g,'').trim();
      if(word)fun.word={word,say:say.trim(),meaning:tidy(mean),example:tidy(ex)};
    }
    // cool fact
    const fh=lines.find(l=>/super cool facts|^did you know/i.test(l.str)&&l.h>=.012);
    if(fh&&!fun.fact){const t=funUnder(lines,fh,.09).map(l=>l.str).join(' ').trim();if(t)fun.fact=t}
  }
  return fun;
}
// ---- word search (a picture) ----
// find a set of evenly spaced thin lines with the same start and end: that's the puzzle grid
function funFindGrid(px,W,H){
  // the grid lines are faint, so look for pixels a bit darker than what's just above and below them
  const L=new Uint8Array(W*H);for(let i=0;i<W*H;i++)L[i]=(px[i*4]*3+px[i*4+1]*6+px[i*4+2])/10;
  const lineH=(x,y)=>y>=3&&y<H-3&&Math.min(L[(y-3)*W+x],L[(y+3)*W+x])-L[y*W+x]>=8;
  const lineV=(x,y)=>x>=3&&x<W-3&&Math.min(L[y*W+x-3],L[y*W+x+3])-L[y*W+x]>=8;
  const segs=[];
  for(let y=3;y<H-3;y++){
    let run=0,gap=0;
    for(let x=0;x<=W;x++){
      if(x<W&&lineH(x,y)){run+=gap+1;gap=0}
      else if(run&&x<W&&gap<4)gap++;
      else{if(run>W*.1)segs.push({y,x0:x-gap-run,x1:x-gap});run=0;gap=0}
    }
  }
  // merge rows that touch into one line, drop thick bands (photos, coloured bars)
  const linesH=[];
  for(const s of segs){
    const l=linesH.find(l=>s.y-l.y1<=1&&Math.abs(l.x0-s.x0)<8&&Math.abs(l.x1-s.x1)<8);
    if(l)l.y1=s.y;else linesH.push({y0:s.y,y1:s.y,x0:s.x0,x1:s.x1});
  }
  const thin=linesH.filter(l=>l.y1-l.y0<6);
  let best=null;
  for(const a of thin){
    const g=thin.filter(l=>Math.abs(l.x0-a.x0)<8&&Math.abs(l.x1-a.x1)<8).sort((p,q)=>p.y0-q.y0);
    if(g.length<7||(best&&g.length<=best.length))continue;
    const gaps=g.slice(1).map((l,k)=>l.y0-g[k].y0),med=gaps.slice().sort((p,q)=>p-q)[gaps.length>>1];
    if(med>W*.008&&gaps.filter(d=>Math.abs(d-med)<med*.2).length>=gaps.length*.8)best=g;
  }
  if(!best)return null;
  const x0=best[0].x0,x1=best[0].x1,ys=best.map(l=>Math.round((l.y0+l.y1)/2)),top=ys[0],bot=ys[ys.length-1];
  // upright lines: columns that are dark nearly all the way down
  const xs=[];let inLine=false,start=0;
  for(let x=Math.max(0,x0-3);x<=Math.min(W-1,x1+3);x++){
    let n=0;for(let y=top;y<=bot;y+=2)if(lineV(x,y))n++;
    const on=n>(bot-top)/2*.6;
    if(on&&!inLine){inLine=true;start=x}
    if(!on&&inLine){inLine=false;xs.push(Math.round((start+x-1)/2))}
  }
  if(inLine)xs.push(Math.round((start+x1)/2));
  if(xs.length<7)return null;
  return {xs,ys};
}
// a clean black-on-white copy of part of the page, scaled up for the letter reader
function funCrop(src,x,y,w,h,scale,pad){
  const c=document.createElement('canvas');c.width=Math.round(w*scale)+pad*2;c.height=Math.round(h*scale)+pad*2;
  const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,c.width,c.height);g.imageSmoothingQuality='high';
  g.drawImage(src,x,y,w,h,pad,pad,c.width-pad*2,c.height-pad*2);
  const d=g.getImageData(0,0,c.width,c.height),p=d.data;
  for(let i=0;i<p.length;i+=4){const v=(p[i]*3+p[i+1]*6+p[i+2])/10<120?0:255;p[i]=p[i+1]=p[i+2]=v}
  g.putImageData(d,0,0);return c;
}
function funWordInGrid(grid,word){
  const w=word.replace(/[^A-Z]/g,''),R=grid.length,C=grid[0].length;if(!w)return true;
  for(let r=0;r<R;r++)for(let c=0;c<C;c++)for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){
    if(!dr&&!dc)continue;let k=0;
    for(;k<w.length;k++){const rr=r+dr*k,cc=c+dc*k;if(rr<0||cc<0||rr>=R||cc>=C||grid[rr][cc]!==w[k])break}
    if(k===w.length)return true;
  }
  return false;
}
async function funWordSearch(pg,say){
  const W=2400,v1=pg.getViewport({scale:1}),vp=pg.getViewport({scale:W/v1.width});
  const c=document.createElement('canvas');c.width=Math.round(vp.width);c.height=Math.round(vp.height);
  const ctx=c.getContext('2d',{willReadFrequently:true});ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);
  await pg.render({canvasContext:ctx,viewport:vp}).promise;
  const grid=funFindGrid(ctx.getImageData(0,0,c.width,c.height).data,c.width,c.height);
  if(!grid){c.width=c.height=0;return null}
  say&&say('Reading the word search…');
  await funLoadOcr();
  const worker=await Tesseract.createWorker('eng');
  try{
    const {xs,ys}=grid,rows=[];
    const AZ='ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    // a sharper copy of the page just for the letters
    const K=2,vpB=pg.getViewport({scale:W*K/v1.width}),big=document.createElement('canvas');big.width=Math.round(vpB.width);big.height=Math.round(vpB.height);
    const bctx=big.getContext('2d',{willReadFrequently:true});bctx.fillStyle='#fff';bctx.fillRect(0,0,big.width,big.height);
    await pg.render({canvasContext:bctx,viewport:vpB}).promise;
    // cut every square's letter out tightly (just its ink), so a row can be laid out like ordinary printed text
    const glyph=(k,r)=>{
      const cw=(xs[k+1]-xs[k])*K,ch=(ys[r+1]-ys[r])*K,in_=Math.round(Math.min(cw,ch)*.12);
      const x=xs[k]*K+in_,y=ys[r]*K+in_,w=Math.round(cw-in_*2),h=Math.round(ch-in_*2),d=bctx.getImageData(x,y,w,h).data;
      let x0=w,x1=-1,y0=h,y1=-1;
      for(let j=0;j<h;j++)for(let i=0;i<w;i++){const o=(j*w+i)*4;if((d[o]*3+d[o+1]*6+d[o+2])/10<120){if(i<x0)x0=i;if(i>x1)x1=i;if(j<y0)y0=j;if(j>y1)y1=j}}
      return x1<0?null:{x:x+x0,y:y+y0,w:x1-x0+1,h:y1-y0+1,top:y0,cellH:h};
    };
    let unsure=0;
    for(let r=0;r<ys.length-1;r++){
      const gl=[];for(let k=0;k<xs.length-1;k++)gl.push(glyph(k,r));
      const cellH=Math.round((ys[r+1]-ys[r])*K*.76);
      await worker.setParameters({tessedit_char_whitelist:AZ,tessedit_pageseg_mode:'7'});
      let row='';
      for(const sp of [.95,1.3,.75,1.7,1.1]){     // try a few letter spacings until the row reads with the right number of letters
        const slot=Math.round(cellH*sp),strip=document.createElement('canvas');strip.width=gl.length*slot+80;strip.height=cellH+80;
        const g=strip.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,strip.width,strip.height);
        gl.forEach((q,k)=>{if(q)g.drawImage(big,q.x,q.y,q.w,q.h,40+k*slot+Math.round((slot-q.w)/2),40+q.top,q.w,q.h)});
        const d=g.getImageData(0,0,strip.width,strip.height),p=d.data;
        for(let i=0;i<p.length;i+=4){const v=(p[i]*3+p[i+1]*6+p[i+2])/10<140?0:255;p[i]=p[i+1]=p[i+2]=v}
        g.putImageData(d,0,0);
        row=((await worker.recognize(strip)).data.text||'').replace(/[^A-Z]/g,'');
        if(row.length===gl.length)break;
      }
      if(row.length!==gl.length){
        // the line came out the wrong length: read the squares one at a time instead
        await worker.setParameters({tessedit_char_whitelist:AZ,tessedit_pageseg_mode:'10'});
        row='';
        for(const q of gl){
          if(!q){row+='I';unsure++;continue}
          const one=document.createElement('canvas');one.width=q.w+60;one.height=q.h+60;
          const og=one.getContext('2d');og.fillStyle='#fff';og.fillRect(0,0,one.width,one.height);og.drawImage(big,q.x,q.y,q.w,q.h,30,30,q.w,q.h);
          const ch1=((await worker.recognize(one)).data.text||'').replace(/[^A-Z]/g,'')[0];
          if(!ch1)unsure++;
          row+=ch1||'I';                       // a square that reads as nothing is almost always a thin letter I
        }
      }
      rows.push(row);
    }
    big.width=big.height=0;
    // the word list sits to the right of the grid, the title above it
    const gx0=xs[0],gx1=xs[xs.length-1],gy0=ys[0],gy1=ys[ys.length-1],gw=gx1-gx0,gh=gy1-gy0;
    await worker.setParameters({tessedit_char_whitelist:"ABCDEFGHIJKLMNOPQRSTUVWXYZ' ",tessedit_pageseg_mode:'6'});
    const lw=Math.min(c.width-gx1-4,Math.round(gw*.5));
    let words=[];
    if(lw>40){
      const {data}=await worker.recognize(funCrop(c,gx1+4,gy0-Math.round(gh*.03),lw,Math.round(gh*1.06),2,20));
      words=(data.text||'').split('\n').map(s=>s.replace(/\s+/g,' ').trim()).filter(s=>s.replace(/[^A-Z]/g,'').length>=2);
    }
    await worker.setParameters({tessedit_char_whitelist:'',tessedit_pageseg_mode:'7'});
    const th=Math.round(gh*.2);
    const t=await worker.recognize(funCrop(c,gx0,Math.max(0,gy0-th),Math.min(c.width-gx0,Math.round(gw*1.2)),th-6,2,20));
    const title=(t.data.text||'').replace(/[^A-Za-z0-9' ]/g,' ').replace(/\s+/g,' ').trim();
    let fixed=0;
    for(const w0 of words){
      const w=w0.replace(/[^A-Z]/g,'');if(w.length<4||funWordInGrid(rows,w0))continue;
      const R=rows.length,C=rows[0].length,spots=[];
      for(let r=0;r<R;r++)for(let c0=0;c0<C;c0++)for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){
        if(!dr&&!dc)continue;const er=r+dr*(w.length-1),ec=c0+dc*(w.length-1);if(er<0||ec<0||er>=R||ec>=C)continue;
        let bad=-1,n=0;for(let k=0;k<w.length&&n<2;k++)if(rows[r+dr*k][c0+dc*k]!==w[k]){bad=k;n++}
        if(n===1)spots.push([r+dr*bad,c0+dc*bad,w[bad]]);
      }
      if(spots.length===1){const [r,c1,ch]=spots[0];rows[r]=rows[r].slice(0,c1)+ch+rows[r].slice(c1+1);fixed++}
    }
    const missing=words.filter(w=>!funWordInGrid(rows,w));
    return {wordsearch:{title:/search/i.test(title)?title:'Word Search',grid:rows,words},unsure,missing};
  }finally{await worker.terminate();c.width=c.height=0}
}
async function readFunFromPdf(doc,say){
  const pagesItems=[],notes=[];
  for(let n=1;n<=doc.numPages;n++){
    const pg=await doc.getPage(n),vp=pg.getViewport({scale:1}),tc=await pg.getTextContent();
    pagesItems.push(tc.items.filter(t=>t.str&&t.str.trim()).map(t=>{
      const m=pdfjsLib.Util.transform(vp.transform,t.transform);
      return {str:t.str,x:m[4]/vp.width,y:m[5]/vp.height,h:Math.hypot(m[2],m[3])/vp.height,w:t.width/vp.width};
    }));
  }
  const fun=funText(pagesItems);
  try{
    for(let n=1;n<=doc.numPages&&!fun.wordsearch;n++){
      const r=await funWordSearch(await doc.getPage(n),say);
      if(!r)continue;
      fun.wordsearch=r.wordsearch;
      if(r.missing.length)notes.push(`Check the word search: I could not find ${r.missing.join(', ')} in the grid, so a letter may be read wrong.`);
      else if(r.wordsearch.words.length)notes.push(`Word search: all ${r.wordsearch.words.length} words were found in the grid.`);
      else notes.push('Word search: I read the grid but not the word list. Type the words in.');
    }
    if(!fun.wordsearch)notes.push('No word search found in this PDF.');
  }catch(e){notes.push('Could not read the word search (the letter reader did not load). Type it in by hand.')}
  return {fun:Object.keys(fun).length?fun:null,notes};
}
