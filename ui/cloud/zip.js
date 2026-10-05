// Store-only ZIP, with UTF-8 names, bounded application files and standard CRC32.
const table=Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
export function crc32(bytes){let n=0xffffffff;for(const b of bytes)n=table[(n^b)&255]^(n>>>8);return(n^0xffffffff)>>>0;}
export function storedZip(files){
  if(!Array.isArray(files)||!files.length||files.length>300)throw Error('ZIP_FILES_INVALID');
  let offset=0,total=0;const local=[],central=[],names=new Set();
  for(const file of files){
    if(typeof file.path!=='string'||!/^[A-Za-z0-9_.\/-]+$/.test(file.path)||file.path.split('/').some(p=>!p||p==='.'||p==='..')||names.has(file.path)||!(file.bytes instanceof Uint8Array))throw Error('ZIP_FILES_INVALID');names.add(file.path);
    total+=file.bytes.length;if(total>112*1048576)throw Error('ZIP_TOO_LARGE');
    const name=new TextEncoder().encode(file.path),crc=crc32(file.bytes),size=file.bytes.length;
    const header=new Uint8Array(30+name.length),h=new DataView(header.buffer);h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint16(6,0x800,true);h.setUint16(12,33,true);h.setUint32(14,crc,true);h.setUint32(18,size,true);h.setUint32(22,size,true);h.setUint16(26,name.length,true);header.set(name,30);local.push(header,file.bytes);
    const entry=new Uint8Array(46+name.length),e=new DataView(entry.buffer);e.setUint32(0,0x02014b50,true);e.setUint16(4,20,true);e.setUint16(6,20,true);e.setUint16(8,0x800,true);e.setUint16(14,33,true);e.setUint32(16,crc,true);e.setUint32(20,size,true);e.setUint32(24,size,true);e.setUint16(28,name.length,true);e.setUint32(42,offset,true);entry.set(name,46);central.push(entry);offset+=header.length+size;
  }
  const end=new Uint8Array(22),e=new DataView(end.buffer);e.setUint32(0,0x06054b50,true);e.setUint16(8,files.length,true);e.setUint16(10,files.length,true);e.setUint32(12,central.reduce((n,b)=>n+b.length,0),true);e.setUint32(16,offset,true);
  return new Blob([...local,...central,end],{type:'application/zip'});
}
