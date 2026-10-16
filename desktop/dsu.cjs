const dgram=require('node:dgram');
const {randomBytes}=require('node:crypto');
// Cemuhook DSU v1001. Layout: v1993/cemuhook-protocol (see web/MOTION.md).
function crc32(buffer){let crc=0xffffffff;for(const byte of buffer){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
function subscription(clientId,slot){
  const data=Buffer.alloc(28);data.write('DSUC');data.writeUInt16LE(1001,4);data.writeUInt16LE(12,6);data.writeUInt32LE(clientId,12);data.writeUInt32LE(0x100002,16);data[20]=1;data[21]=slot;data.writeUInt32LE(crc32(data),8);return data;
}
function motionPacket(buffer,slot){
  if(buffer.length!==100||buffer.toString('ascii',0,4)!=='DSUS'||buffer.readUInt16LE(4)!==1001||buffer.readUInt16LE(6)!==84||buffer.readUInt32LE(16)!==0x100002||buffer[20]!==slot||buffer[21]!==2||buffer[31]!==1)return null;
  const copy=Buffer.from(buffer),checksum=copy.readUInt32LE(8);copy.writeUInt32LE(0,8);if(crc32(copy)!==checksum)return null;
  const sample={x:buffer.readFloatLE(88),y:buffer.readFloatLE(92),z:buffer.readFloatLE(96),timestamp:buffer.readBigUInt64LE(68)};
  return ['x','y','z'].every(k=>Number.isFinite(sample[k])&&Math.abs(sample[k])<=4000)?sample:null;
}
class DsuClient {
  constructor(onSample,onError=()=>{}){this.onSample=onSample;this.onError=onError;this.socket=null;this.timer=null;this.lastTimestamp=-1n;}
  async connect({port=26760,slot=0}={}){
    if(!Number.isInteger(port)||port<1024||port>65535||!Number.isInteger(slot)||slot<0||slot>3)throw new Error('DSU 端口或手柄槽位无效');
    this.close();const socket=dgram.createSocket('udp4');this.socket=socket;this.lastTimestamp=-1n;
    socket.on('message',buffer=>{if(this.socket!==socket)return;const sample=motionPacket(buffer,slot);if(!sample||sample.timestamp<=this.lastTimestamp)return;this.lastTimestamp=sample.timestamp;this.onSample({x:sample.x,y:sample.y,z:sample.z});});
    socket.on('error',()=>{if(this.socket===socket){this.close();this.onError('未收到本机 DSU 服务响应，请检查驱动输出和端口。');}});
    await new Promise((resolve,reject)=>{
      const cleanup=()=>{socket.removeListener('error',fail);socket.removeListener('close',cancel);};
      const fail=()=>{cleanup();reject(new Error('无法连接本机 DSU 服务'));};
      const cancel=()=>{cleanup();reject(new Error('连接已取消'));};
      socket.once('error',fail);socket.once('close',cancel);
      socket.bind(0,'127.0.0.1',()=>{if(this.socket!==socket){cancel();return;}socket.connect(port,'127.0.0.1',()=>{cleanup();resolve();});});
    });
    if(this.socket!==socket)throw new Error('连接已取消');
    const packet=subscription(randomBytes(4).readUInt32LE(),slot);
    const send=()=>{if(this.socket===socket)socket.send(packet,error=>{if(error&&this.socket===socket){this.close();this.onError('DSU 请求发送失败，请检查本机服务。');}});};
    send();this.timer=setInterval(send,1000);this.timer.unref();return {connected:true};
  }
  close(){if(this.timer)clearInterval(this.timer);this.timer=null;const socket=this.socket;this.socket=null;if(socket)try{socket.close();}catch{}}
}
module.exports={crc32,subscription,motionPacket,DsuClient};
