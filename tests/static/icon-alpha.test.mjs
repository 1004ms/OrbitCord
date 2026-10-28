import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const assets = path.join(root,'src/OrbitCord.App/Assets/Customization');
function paeth(a,b,c){const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;}
function decodeRgba(file){
  const data=fs.readFileSync(file);
  if (!data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new Error('not PNG');
  let pos=8,width,height,bitDepth,colorType,interlace; const idat=[];
  while(pos<data.length){const len=data.readUInt32BE(pos), kind=data.toString('ascii',pos+4,pos+8), chunk=data.subarray(pos+8,pos+8+len); pos+=12+len;
    if(kind==='IHDR'){width=chunk.readUInt32BE(0);height=chunk.readUInt32BE(4);bitDepth=chunk[8];colorType=chunk[9];interlace=chunk[12]; if(bitDepth!==8||colorType!==6||interlace!==0) throw new Error('unsupported PNG format');}
    else if(kind==='IDAT') idat.push(chunk); else if(kind==='IEND') break;
  }
  const raw=zlib.inflateSync(Buffer.concat(idat)), bpp=4, stride=width*bpp, rows=[]; let i=0, prev=Buffer.alloc(stride);
  for(let y=0;y<height;y++){const filter=raw[i++]; const scan=Buffer.from(raw.subarray(i,i+stride)); i+=stride;
    for(let x=0;x<stride;x++){const left=x>=bpp?scan[x-bpp]:0, up=prev[x], ul=x>=bpp?prev[x-bpp]:0; let add=0;
      if(filter===1)add=left; else if(filter===2)add=up; else if(filter===3)add=Math.floor((left+up)/2); else if(filter===4)add=paeth(left,up,ul); else if(filter!==0) throw new Error(`unsupported PNG filter ${filter}`);
      scan[x]=(scan[x]+add)&255;
    } rows.push(scan); prev=scan;
  }
  return {width,height,rows};
}
for(const name of ['purple','green','orange','red','blue']){const {width,height,rows}=decodeRgba(path.join(assets,`${name}.png`));
  for(const [x,y] of [[0,0],[width-1,0],[0,height-1],[width-1,height-1]]){const alpha=rows[y][x*4+3]; if(alpha!==0) throw new Error(`${name} has opaque corner at ${x},${y}: alpha=${alpha}`);}
}
console.log('icon-alpha: PASS');
