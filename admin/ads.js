// Finds the sponsor ads in an issue PDF and cuts each one out as a picture.
// How: the ads sit in a grid under the "...OUR GENEROUS SPONSORS!" banner, with plain paper showing between them.
// We render that page, mark which pixels are plain paper, and slice the area along the paper strips.
// Each ad also gets a tiny "fingerprint" (sig) so next week we can tell it's the same ad and keep its name and info.
// Needs pdf.js (pdfjsLib). Returns [{blob, sig, ar}] in reading order (may be empty).
function adSig(src,x,y,w,h){
  const c=document.createElement('canvas');c.width=c.height=12;
  const g=c.getContext('2d',{willReadFrequently:true});g.imageSmoothingQuality='high';g.drawImage(src,x,y,w,h,0,0,12,12);
  const d=g.getImageData(0,0,12,12).data;let s='';
  for(let i=0;i<d.length;i+=4)s+=Math.min(15,Math.round((d[i]*3+d[i+1]*6+d[i+2])/10/17)).toString(16)
    +Math.min(15,Math.max(0,Math.round((d[i]-d[i+2])/34)+8)).toString(16);          // brightness + warm/cool per square
  return s;
}
// how different two fingerprints are (0 = identical, about 4+ = different ads)
function adSigDiff(a,b){
  if(!a||!b||a.length!==b.length)return 99;
  let t=0;for(let i=0;i<a.length;i++)t+=Math.abs(parseInt(a[i],16)-parseInt(b[i],16));
  return t/a.length;
}
function adSigOfImage(url){
  return new Promise(ok=>{const im=new Image();im.crossOrigin='anonymous';
    im.onload=()=>{try{ok(adSig(im,0,0,im.naturalWidth,im.naturalHeight))}catch(e){ok('')}};im.onerror=()=>ok('');im.src=url});
}
async function findAds(doc){
  for(let n=1;n<=doc.numPages;n++){
    const pg=await doc.getPage(n),tc=await pg.getTextContent();
    const ban=tc.items.find(t=>/generous sponsors|support the community corner/i.test(t.str));
    if(!ban)continue;
    const W=2400,v1=pg.getViewport({scale:1}),vp=pg.getViewport({scale:W/v1.width});
    const c=document.createElement('canvas');c.width=Math.round(vp.width);c.height=Math.round(vp.height);
    const ctx=c.getContext('2d',{willReadFrequently:true});ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);
    await pg.render({canvasContext:ctx,viewport:vp}).promise;
    const H=c.height,px=ctx.getImageData(0,0,W,H).data;
    const m=pdfjsLib.Util.transform(vp.transform,ban.transform),bx=m[4]+ban.width*vp.scale/2,by=m[5];
    // the ads are on the same half of the sheet as the banner, below it
    const spread=W>H*1.2,half=spread&&bx>W/2?1:0;
    let X0=Math.round((spread?half*W/2:0)+W*.012),X1=Math.round((spread?(half+1)*W/2:W)-W*.004);const Y0=Math.round(by+H*.008);let Y1=Math.round(H*.958);
    // stop above the small print at the bottom of the page ("...is an imprint of..."), so it can't glue the last row together
    for(const t of tc.items){if(!/imprint of|all rights reserved/i.test(t.str))continue;
      const q=pdfjsLib.Util.transform(vp.transform,t.transform),fh=Math.hypot(q[2],q[3]),cx=q[4]+t.width*vp.scale/2;
      if(cx>X0&&cx<X1&&q[5]>H*.6)Y1=Math.min(Y1,Math.round(q[5]-fh*1.15))}
    // the banner is a red bar exactly as wide as the ad grid: use its ends as the left and right edges
    {const yb=Math.max(0,Math.round(by-H*.004)),red=x=>{const o=(yb*W+x)*4;return px[o]>150&&px[o+1]<110&&px[o+2]<110&&px[o]-px[o+1]>70};
      let l=Math.round(m[4])-6,r=Math.round(m[4]+ban.width*vp.scale)+6;
      if(red(l)&&red(r)){while(l>X0&&(red(l-1)||red(l-3)))l--;while(r<X1&&(red(r+1)||red(r+3)))r++;X0=Math.max(X0,l-2);X1=Math.min(X1,r+3)}}
    const paper=new Uint8Array(W*H);
    for(let y=Y0;y<Y1;y++)for(let x=X0;x<X1;x++){const o=(y*W+x)*4,r=px[o],g=px[o+1],b=px[o+2];if(r>232&&g>215&&r-b>=9&&r-b<=75)paper[y*W+x]=1}
    const rowPaper=(y,x0,x1)=>{let k=0;for(let x=x0;x<x1;x+=2)k+=paper[y*W+x];return k/((x1-x0)/2)};
    const colPaper=(x,y0,y1)=>{let k=0;for(let y=y0;y<y1;y+=2)k+=paper[y*W+x];return k/((y1-y0)/2)};
    const leaves=[];
    // slice a box along full strips of paper: first one way, then the other, until nothing splits
    const cut=(x0,y0,x1,y1,depth)=>{
      while(y0<y1-4&&rowPaper(y0,x0,x1)>.97)y0++;while(y1>y0+4&&rowPaper(y1-1,x0,x1)>.97)y1--;
      while(x0<x1-4&&colPaper(x0,y0,y1)>.97)x0++;while(x1>x0+4&&colPaper(x1-1,y0,y1)>.97)x1--;
      if(x1-x0<W*.04||y1-y0<H*.04)return;
      const parts=(horizontal)=>{
        const out=[];let start=horizontal?y0:x0,run=0;const end=horizontal?y1:x1;
        for(let p=start;p<end;p++){
          const g=(horizontal?rowPaper(p,x0,x1):colPaper(p,y0,y1))>.985;
          if(g)run++;else{if(run>=5&&p-run>start){out.push([start,p-run]);start=p}run=0}
        }
        out.push([start,end]);return out;
      };
      if(depth<5){
        const hs=parts(true);if(hs.length>1){hs.forEach(([a,b])=>cut(x0,a,x1,b,depth+1));return}
        const vs=parts(false);if(vs.length>1){vs.forEach(([a,b])=>cut(a,y0,b,y1,depth+1));return}
      }
      leaves.push({x:x0,y:y0,w:x1-x0,h:y1-y0});
    };
    cut(X0,Y0,X1,Y1,0);
    // boxes that are the paper's own notices (printing sponsor, "advertise with us") are not sponsor ads
    const own=tc.items.filter(t=>/was sponsored|printing of|advertise with community|reach the heart/i.test(t.str)).map(t=>{const q=pdfjsLib.Util.transform(vp.transform,t.transform);return [q[4]+t.width*vp.scale/2,q[5]]});
    const ads=leaves.filter(l=>l.w>W*.07&&l.h>H*.09&&l.w<W*.48&&!own.some(([x,y])=>x>l.x&&x<l.x+l.w&&y>l.y&&y<l.y+l.h)).sort((a,b)=>Math.abs(a.y-b.y)<H*.03?a.x-b.x:a.y-b.y);
    if(!ads.length){c.width=c.height=0;continue}
    // cut them out of a sharper copy
    const K=1.6,vpB=pg.getViewport({scale:W*K/v1.width}),big=document.createElement('canvas');big.width=Math.round(vpB.width);big.height=Math.round(vpB.height);
    const bctx=big.getContext('2d');bctx.fillStyle='#fff';bctx.fillRect(0,0,big.width,big.height);
    await pg.render({canvasContext:bctx,viewport:vpB}).promise;
    const out=[];
    for(const a of ads){
      const o=document.createElement('canvas');o.width=Math.round(a.w*K);o.height=Math.round(a.h*K);
      o.getContext('2d').drawImage(big,Math.round(a.x*K),Math.round(a.y*K),o.width,o.height,0,0,o.width,o.height);
      const blob=await new Promise(r=>o.toBlob(r,'image/jpeg',.86));
      out.push({blob,sig:adSig(o,0,0,o.width,o.height),ar:+(o.width/o.height).toFixed(3),box:[a.x/W,a.y/H,a.w/W,a.h/H].map(v=>+v.toFixed(3))});
      o.width=o.height=0;
    }
    c.width=c.height=big.width=big.height=0;
    return out;
  }
  return [];
}
