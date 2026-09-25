// Extract the supplied foreground and motion masks; clock and background are not exported.
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const source = process.argv[2];
if (!source) throw new Error('Pass the Windows 11 source scene.pkg file (Workshop 2531810451).');
const archive = await fs.readFile(source);
let offset = 0;
const uint = () => { const value = archive.readUInt32LE(offset); offset += 4; return value; };
const string = () => { const length = uint(); const value = archive.subarray(offset, offset + length).toString(); offset += length; return value; };
if (!/^PKGV\d+$/.test(string())) throw new Error('Unsupported scene archive.');
const count = uint(), entries = [];
for (let i = 0; i < count; i++) entries.push({ name: string(), start: uint(), length: uint() });
const files = new Map(entries.map(entry => [entry.name, archive.subarray(offset + entry.start, offset + entry.start + entry.length)]));

function lz4(input, size) {
  const output = Buffer.alloc(size); let i = 0, o = 0;
  while (i < input.length) {
    const token = input[i++]; let literal = token >> 4;
    if (literal === 15) { let n; do { n = input[i++]; literal += n; } while (n === 255); }
    if (i + literal > input.length || o + literal > size) throw new Error('Invalid literal block.');
    input.copy(output, o, i, i + literal); i += literal; o += literal;
    if (i >= input.length) break;
    const back = input.readUInt16LE(i); i += 2;
    let length = (token & 15) + 4;
    if ((token & 15) === 15) { let n; do { n = input[i++]; length += n; } while (n === 255); }
    if (!back || back > o || o + length > size) throw new Error('Invalid LZ4 block.');
    for (let n = 0; n < length; n++, o++) output[o] = output[o - back];
  }
  if (o !== size) throw new Error('Incomplete LZ4 block.');
  return output;
}

function decodeBC(bytes, width, height, hasAlpha) {
  const output = Buffer.alloc(width * height * 4);
  const rgb = n => [Math.round((n >> 11) * 255 / 31), Math.round(((n >> 5) & 63) * 255 / 63), Math.round((n & 31) * 255 / 31)];
  for (let y = 0, b = 0; y < height; y += 4) for (let x = 0; x < width; x += 4, b += hasAlpha ? 16 : 8) {
    const alphas = hasAlpha ? [bytes[b], bytes[b + 1]] : [255];
    let alphaBits = hasAlpha ? bytes.readUIntLE(b + 2, 6) : 0;
    if (hasAlpha) {
      if (alphas[0] > alphas[1]) for (let k = 1; k <= 6; k++) alphas.push(((7 - k) * alphas[0] + k * alphas[1]) / 7);
      else { for (let k = 1; k <= 4; k++) alphas.push(((5 - k) * alphas[0] + k * alphas[1]) / 5); alphas.push(0, 255); }
    }
    const c = b + (hasAlpha ? 8 : 0), first = bytes.readUInt16LE(c), second = bytes.readUInt16LE(c + 2);
    const colors = [rgb(first), rgb(second)];
    if (hasAlpha || first > second) colors.push(colors[0].map((v, k) => (2 * v + colors[1][k]) / 3), colors[0].map((v, k) => (v + 2 * colors[1][k]) / 3));
    else colors.push(colors[0].map((v, k) => (v + colors[1][k]) / 2), [0, 0, 0]);
    let colorBits = bytes.readUInt32LE(c + 4);
    for (let n = 0; n < 16; n++) {
      const column = x + (n & 3), row = y + (n >> 2), colorIndex = colorBits & 3, color = colors[colorIndex];
      if (column < width && row < height) {
        const p = (row * width + column) * 4;
        output[p] = color[0]; output[p + 1] = color[1]; output[p + 2] = color[2];
        output[p + 3] = hasAlpha ? alphas[alphaBits % 8] : (first <= second && colorIndex === 3 ? 0 : 255);
      }
      colorBits >>>= 2; alphaBits = Math.floor(alphaBits / 8);
    }
  }
  return output;
}

function texture(name) {
  const b = files.get(`materials/${name}.tex`);
  if (!b || b.toString('ascii', 0, 8) !== 'TEXV0005' || !['TEXB0003','TEXB0004'].includes(b.toString('ascii', 46, 54))) throw new Error(`Unsupported texture: ${name}`);
  const shift=b.toString('ascii',46,54)==='TEXB0004'?4:0;
  const format = b.readUInt32LE(18), width = b.readUInt32LE(67+shift), height = b.readUInt32LE(71+shift);
  const actualWidth = b.readUInt32LE(34), actualHeight = b.readUInt32LE(38), size = b.readUInt32LE(83+shift);
  let bytes = b.subarray(87+shift, 87+shift + size);
  if (b.readUInt32LE(75+shift)) bytes = lz4(bytes, b.readUInt32LE(79+shift));
  if (b.readInt32LE(59) >= 0) return sharp(bytes);
  if (format === 4 || format === 7) bytes = decodeBC(bytes, width, height, format === 4);
  else if (format === 9) return sharp(bytes, { raw: {width,height,channels:1}}).extract({left:0,top:0,width:actualWidth,height:actualHeight});
  else if (format !== 0) throw new Error(`Unsupported raw format ${format}`);
  return sharp(bytes, { raw: { width, height, channels: 4 } }).extract({ left: 0, top: 0, width: actualWidth, height: actualHeight });
}



const output = 'public/scenes/home-folds';
await fs.mkdir(output, { recursive: true });
const {data,info} = await texture('dark 4k').ensureAlpha().raw().toBuffer({resolveWithObject:true});
let left=info.width,top=info.height,right=0,bottom=0;
for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
  if(data[(y*info.width+x)*4+3]>1){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
}
left=Math.max(0,left-40);top=Math.max(0,top-40);
right=Math.min(info.width-1,right+40);bottom=Math.min(info.height-1,bottom+40);
const crop={left,top,width:right-left+1,height:bottom-top+1};
// Preserve the original highlights and occlusion; change only the color palette.
const colors=[[20,15,26],[107,64,79],[198,142,123],[250,235,217]];
const stops=[0,.30,.68,1];
for(let p=0;p<data.length;p+=4){
  const light=Math.max(data[p],data[p+1],data[p+2])/255;
  let band=0;while(band<2&&light>stops[band+1])band++;
  const t=(light-stops[band])/(stops[band+1]-stops[band]);
  for(let c=0;c<3;c++)data[p+c]=Math.round(colors[band][c]*(1-t)+colors[band+1][c]*t);
}
const art=await sharp(data,{raw:info}).extract(crop).png().toBuffer();
await sharp(art).webp({lossless:true,effort:6}).toFile(path.join(output,'folds.webp'));
await sharp(art).resize({width:960,withoutEnlargement:true}).webp({quality:94,alphaQuality:100}).toFile(path.join(output,'folds-still.webp'));
const maskNames=['669b5093','d7a66733','c0ec517e','606cec96'];
const channels=[];
for(const id of maskNames)channels.push(await texture('masks/waterwaves_mask_'+id).extractChannel(0).raw().toBuffer());
const masks=Buffer.alloc(3840*2160);
for(let c=0;c<4;c++)for(let y=0;y<1080;y++){
  const start=((c>>1)*1080+y)*3840+(c%2)*1920;
  channels[c].copy(masks,start,y*1920,(y+1)*1920);
}
// An opaque atlas preserves the mask data through browser image decoding.
await sharp(masks,{raw:{width:3840,height:2160,channels:1}}).png().toFile(path.join(output,'motion-masks.png'));
const metadata={source:'Wallpaper Engine 2531810451, selected by preset 3102259274',width:info.width,height:info.height,crop,maskChannels:maskNames,colors,stops};
await fs.writeFile(path.join(output,'source.json'),JSON.stringify(metadata,null,2)+'\n');
console.log(JSON.stringify(metadata));
