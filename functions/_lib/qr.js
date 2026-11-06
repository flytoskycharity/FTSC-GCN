// Tạo mã QR (byte mode) thuần JavaScript, không phụ thuộc thư viện ngoài.
const ECC={L:[[7,10,15,20,26,18,20,24,30,18,20,24,26,30,22,24,28,30,28,28],[1,1,1,1,1,2,2,2,2,4,4,4,4,4,6,6,6,6,7,8]],M:[[10,16,26,18,24,16,18,22,22,26,30,22,22,24,24,28,28,26,26,26],[1,1,1,2,2,4,4,4,5,5,5,8,9,9,10,10,11,13,14,16]]};
const gmul=(x,y)=>{let z=0;for(let i=7;i>=0;i--){z=(z<<1)^((z>>>7)*0x11D);z^=((y>>>i)&1)*x}return z&255};
function rsDiv(deg){const r=new Array(deg).fill(0);r[deg-1]=1;let root=1;for(let i=0;i<deg;i++){for(let j=0;j<deg;j++){r[j]=gmul(r[j],root);if(j+1<deg)r[j]^=r[j+1]}root=gmul(root,2)}return r}
function rsRem(data,div){const res=new Array(div.length).fill(0);for(const b of data){const f=b^res.shift();res.push(0);div.forEach((c,i)=>res[i]^=gmul(c,f))}return res}
const rawMods=v=>{let r=(16*v+128)*v+64;if(v>=2){const n=Math.floor(v/7)+2;r-=(25*n-10)*n-55;if(v>=7)r-=36}return r};
const dataCw=(v,l)=>Math.floor(rawMods(v)/8)-ECC[l][0][v-1]*ECC[l][1][v-1];
const alignPos=v=>{if(v===1)return[];const n=Math.floor(v/7)+2,s=v===32?26:Math.ceil((v*4+4)/(n*2-2))*2,r=[6];for(let p=v*4+10;r.length<n;p-=s)r.splice(1,0,p);return r};
export function qrMatrix(text,level='M'){
 const bytes=[...new TextEncoder().encode(text)];let ver=1;
 for(;;ver++){if(ver>20)throw Error('QR too long');const cap=dataCw(ver,level)*8,need=4+(ver<10?8:16)+bytes.length*8;if(need<=cap)break}
 const bits=[];const put=(v,n)=>{for(let i=n-1;i>=0;i--)bits.push((v>>>i)&1)};
 put(4,4);put(bytes.length,ver<10?8:16);bytes.forEach(b=>put(b,8));
 const cap=dataCw(ver,level)*8;put(0,Math.min(4,cap-bits.length));put(0,(8-bits.length%8)%8);
 for(let p=0xEC;bits.length<cap;p^=0xEC^0x11)put(p,8);
 const data=[];for(let i=0;i<bits.length;i+=8)data.push(parseInt(bits.slice(i,i+8).join(''),2));
 const nb=ECC[level][1][ver-1],ec=ECC[level][0][ver-1],raw=Math.floor(rawMods(ver)/8),shortN=nb-raw%nb,shortLen=Math.floor(raw/nb),blocks=[],div=rsDiv(ec);
 for(let i=0,k=0;i<nb;i++){const len=shortLen-ec+(i<shortN?0:1),d=data.slice(k,k+len);k+=len;const e=rsRem(d,div);if(i<shortN)d.push(0);blocks.push(d.concat(e))}
 const all=[];for(let i=0;i<blocks[0].length;i++)blocks.forEach((b,j)=>{if(i!==shortLen-ec||j>=shortN)all.push(b[i])});
 const size=ver*4+17,M=Array.from({length:size},()=>new Array(size).fill(false)),F=Array.from({length:size},()=>new Array(size).fill(false));
 const fn=(x,y,v)=>{M[y][x]=v;F[y][x]=true};
 for(let i=0;i<size;i++){fn(6,i,i%2===0);fn(i,6,i%2===0)}
 const finder=(x,y)=>{for(let d=-4;d<=4;d++)for(let e=-4;e<=4;e++){const q=Math.max(Math.abs(d),Math.abs(e)),a=x+e,b=y+d;if(a>=0&&a<size&&b>=0&&b<size)fn(a,b,q!==2&&q!==4)}};
 finder(3,3);finder(size-4,3);finder(3,size-4);
 const ap=alignPos(ver);ap.forEach((a,i)=>ap.forEach((b,j)=>{if(!((i===0&&j===0)||(i===0&&j===ap.length-1)||(i===ap.length-1&&j===0)))for(let d=-2;d<=2;d++)for(let e=-2;e<=2;e++)fn(a+e,b+d,Math.max(Math.abs(d),Math.abs(e))!==1)}));
 const fmt=mask=>{const d=({L:1,M:0}[level]<<3)|mask;let r=d;for(let i=0;i<10;i++)r=(r<<1)^((r>>>9)*0x537);const b=((d<<10)|r)^0x5412,g=i=>((b>>>i)&1)!==0;
  for(let i=0;i<=5;i++)fn(8,i,g(i));fn(8,7,g(6));fn(8,8,g(7));fn(7,8,g(8));for(let i=9;i<15;i++)fn(14-i,8,g(i));for(let i=0;i<8;i++)fn(size-1-i,8,g(i));for(let i=8;i<15;i++)fn(8,size-15+i,g(i));fn(8,size-8,true)};
 fmt(0);
 if(ver>=7){let r=ver;for(let i=0;i<12;i++)r=(r<<1)^((r>>>11)*0x1F25);const b=(ver<<12)|r;for(let i=0;i<18;i++){const c=((b>>>i)&1)!==0,a=size-11+i%3,d=Math.floor(i/3);fn(a,d,c);fn(d,a,c)}}
 let idx=0;for(let right=size-1;right>=1;right-=2){if(right===6)right=5;for(let vert=0;vert<size;vert++)for(let j=0;j<2;j++){const x=right-j,up=((right+1)&2)===0,y=up?size-1-vert:vert;if(!F[y][x]&&idx<all.length*8){M[y][x]=((all[idx>>>3]>>>(7-(idx&7)))&1)!==0;idx++}}}
 const cond=[(x,y)=>(x+y)%2===0,(x,y)=>y%2===0,(x)=>x%3===0,(x,y)=>(x+y)%3===0,(x,y)=>(Math.floor(x/3)+Math.floor(y/2))%2===0,(x,y)=>x*y%2+x*y%3===0,(x,y)=>(x*y%2+x*y%3)%2===0,(x,y)=>((x+y)%2+x*y%3)%2===0];
 const apply=m=>{for(let y=0;y<size;y++)for(let x=0;x<size;x++)if(!F[y][x]&&cond[m](x,y))M[y][x]=!M[y][x]};
 const score=()=>{let s=0;const line=get=>{for(let a=0;a<size;a++){let run=1;for(let b=1;b<size;b++){if(get(a,b)===get(a,b-1)){run++;if(run===5)s+=3;else if(run>5)s++}else run=1}}};line((a,b)=>M[a][b]);line((a,b)=>M[b][a]);
  for(let y=0;y<size-1;y++)for(let x=0;x<size-1;x++){const c=M[y][x];if(c===M[y][x+1]&&c===M[y+1][x]&&c===M[y+1][x+1])s+=3}
  let dark=0;M.forEach(r=>r.forEach(c=>{if(c)dark++}));s+=Math.floor(Math.abs(dark*20-size*size*10)/(size*size))*10;return s};
 let best=0,min=Infinity;for(let m=0;m<8;m++){apply(m);fmt(m);const s=score();if(s<min){min=s;best=m}apply(m)}
 apply(best);fmt(best);return M;
}
export function qrSvg(text,{level='M',border=3,dark='#00333f'}={}){
 const m=qrMatrix(text,level),n=m.length;let d='';m.forEach((r,y)=>r.forEach((c,x)=>{if(c)d+=`M${x+border} ${y+border}h1v1h-1z`}));
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n+border*2} ${n+border*2}" shape-rendering="crispEdges" role="img" aria-label="QR"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="${dark}"/></svg>`;
}
const tlv=(id,v)=>id+String(v.length).padStart(2,'0')+v;
function crc16(s){let c=0xFFFF;for(const b of new TextEncoder().encode(s)){c^=b<<8;for(let i=0;i<8;i++)c=c&0x8000?((c<<1)^0x1021)&0xFFFF:(c<<1)&0xFFFF}return c.toString(16).toUpperCase().padStart(4,'0')}
// Chuỗi VietQR theo chuẩn EMVCo / NAPAS 247.
export function vietQr({bin,account,amount,memo}){
 const merchant=tlv('00','A000000727')+tlv('01',tlv('00',bin)+tlv('01',account))+tlv('02','QRIBFTTA');
 let p=tlv('00','01')+tlv('01',amount?'12':'11')+tlv('38',merchant)+tlv('53','704');
 if(amount)p+=tlv('54',String(Math.round(amount)));
 p+=tlv('58','VN');if(memo)p+=tlv('62',tlv('08',memo));
 p+='6304';return p+crc16(p);
}
