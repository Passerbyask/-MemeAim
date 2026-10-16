const test=require('node:test');
const assert=require('node:assert/strict');
const dgram=require('node:dgram');
const {crc32,subscription,motionPacket,DsuClient}=require('./dsu.cjs');
function packet(timestamp=1n){const data=Buffer.alloc(100);data.write('DSUS');data.writeUInt16LE(1001,4);data.writeUInt16LE(84,6);data.writeUInt32LE(0x100002,16);data[20]=0;data[21]=2;data[31]=1;data.writeBigUInt64LE(timestamp,68);data.writeFloatLE(12,88);data.writeFloatLE(-24,92);data.writeFloatLE(3,96);data.writeUInt32LE(crc32(data),8);return data;}
test('DSU packets validate checksum, slot, length and finite motion',()=>{
  assert.equal(crc32(Buffer.from('123456789')),0xcbf43926);
  const request=subscription(123,0);assert.equal(request.readUInt16LE(6),12);assert.equal(request[20],1);
  assert.equal(motionPacket(packet(),0).y,-24);assert.equal(motionPacket(packet(),1),null);
  const damaged=packet();damaged[89]^=1;assert.equal(motionPacket(damaged,0),null);
  assert.equal(motionPacket(Buffer.alloc(99),0),null);
});
test('loopback DSU client receives motion and ignores duplicate/out-of-order timestamps',async()=>{
  const server=dgram.createSocket('udp4');await new Promise(r=>server.bind(0,'127.0.0.1',r));
  const samples=[];let received;
  const ready=new Promise(r=>received=r);
  server.on('message',(_data,remote)=>{for(const timestamp of [2n,2n,1n,3n])server.send(packet(timestamp),remote.port,'127.0.0.1');});
  const client=new DsuClient(sample=>{samples.push(sample);if(samples.length===2)received();});
  try{await client.connect({port:server.address().port,slot:0});await Promise.race([ready,new Promise((_,reject)=>setTimeout(()=>reject(new Error('DSU timeout')),3000))]);assert.equal(samples.length,2);assert.equal(samples[0].x,12);await assert.rejects(()=>client.connect({port:22,slot:9}));}
  finally{client.close();server.close();}
});
test('cancelling a DSU connection settles the pending request',async()=>{
  const client=new DsuClient(()=>{});const connecting=client.connect();client.close();await assert.rejects(connecting,/取消/);
});
