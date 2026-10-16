// Raw report layout: nondebug/dualsense; scale: Linux hid-playstation (1024/gyro_res).
export function parseDualSense(reportId,data){
  const offset=reportId===0x01&&data.byteLength>=63?15:reportId===0x31&&data.byteLength>=77?16:-1;
  if(offset<0)return null;
  return {x:data.getInt16(offset,true)/16.4,y:data.getInt16(offset+2,true)/16.4,z:data.getInt16(offset+4,true)/16.4};
}

export class GyroState {
  constructor(){this.reset();}
  reset(){this.raw={x:0,y:0,z:0};this.bias={x:0,y:0,z:0};this.lastAt=-Infinity;this.count=0;this.rate=0;this.windowAt=0;this.windowCount=0;this.calibration=null;this.calibrated=false;this.notice='连接后保持手柄静止，点击校准。';}
  ingest(sample,now){
    if(!sample||!['x','y','z'].every(k=>Number.isFinite(sample[k])&&Math.abs(sample[k])<=4000))return false;
    this.tick(now);if(!this.count)this.windowAt=now;
    this.raw={x:sample.x,y:sample.y,z:sample.z};this.lastAt=now;this.count++;this.windowCount++;
    if(now-this.windowAt>=1000){this.rate=Math.round(this.windowCount*1000/(now-this.windowAt));this.windowCount=0;this.windowAt=now;}
    const c=this.calibration;
    if(c){
      c.samples.push({...this.raw});
      if(now-c.start>=2000){
        const means={};let stable=c.samples.length>=20;
        for(const k of ['x','y','z']){means[k]=c.samples.reduce((s,p)=>s+p[k],0)/c.samples.length;const variance=c.samples.reduce((s,p)=>s+(p[k]-means[k])**2,0)/c.samples.length;if(variance>2.25||Math.abs(means[k])>15)stable=false;}
        if(stable){this.bias=means;this.calibrated=true;this.notice='校准完成。';}else this.notice='校准失败：请放稳手柄后重试。';
        this.calibration=null;
      }
    }
    return true;
  }
  calibrate(now){this.calibrated=false;this.calibration={start:now,samples:[]};this.notice='正在校准，请静止两秒…';}
  tick(now){if(this.calibration&&(now-this.calibration.start>5000||(now-this.calibration.start>300&&now-this.lastAt>300))){this.calibration=null;this.calibrated=false;this.notice='校准中断：没有持续收到运动数据，请重新校准。';}}
  fresh(now){return now-this.lastAt>=0&&now-this.lastAt<300;}
  corrected(){return Object.fromEntries(['x','y','z'].map(k=>[k,this.raw[k]-this.bias[k]]));}
  delta(now,dt,settings,precision){
    if(!settings.gyroEnabled||!this.calibrated||this.calibration||!this.fresh(now)||(settings.gyroActivation==='precision'&&!precision))return {yaw:0,pitch:0};
    const p=this.corrected(),scale=Math.min(.05,Math.max(0,dt))*Math.PI/180*settings.gyroSensitivity;
    const horizontal=p[settings.gyroYawAxis==='z'?'z':'y'];
    return {yaw:-horizontal*scale*(settings.gyroInvertX?-1:1),pitch:-p.x*scale*(settings.gyroInvertY?-1:1)};
  }
}

export class GyroConnection {
  constructor(state){this.state=state;this.device=null;this.source='';this.message='未连接陀螺仪';this.generation=0;this.unsubscribe=null;this.handler=e=>{const sample=parseDualSense(e.reportId,e.data);if(sample)this.state.ingest(sample,performance.now());};
    globalThis.navigator?.hid?.addEventListener('disconnect',e=>{if(e.device===this.device)this.disconnect();});
  }
  async connectHid(){
    if(!navigator.hid)throw new Error('当前环境不支持直连，请使用桌面版或支持 WebHID 的浏览器。');
    const devices=await navigator.hid.requestDevice({filters:[{vendorId:0x054c,productId:0x0ce6},{vendorId:0x054c,productId:0x0df2}]});
    if(!devices.length)return;
    await this.disconnect();const generation=++this.generation,device=devices[0];
    try{
      if(!device.opened)await device.open();
      if(generation!==this.generation){await device.close();return;}
      this.device=device;this.source='DualSense';this.message=device.productName||'DualSense';device.addEventListener('inputreport',this.handler);
      // Reading calibration report also enables full Bluetooth motion reports.
      try{await device.receiveFeatureReport(0x05);}catch{}
    }catch(error){if(generation===this.generation)await this.disconnect();throw error;}
  }
  async connectDsu(port,slot){
    if(!globalThis.motionBridge)throw new Error('DSU 接入仅在 Windows 软件版可用。');
    await this.disconnect();const generation=++this.generation;
    this.source='DSU';this.message='等待本机 DSU 运动数据…';
    this.unsubscribe=motionBridge.onMotion(sample=>{if(generation!==this.generation)return;if(sample.error){this.message=sample.error;return;}this.state.ingest(sample,performance.now());});
    try{await motionBridge.connect({port,slot});}catch(error){if(generation===this.generation)await this.disconnect();throw error;}
  }
  async disconnect(){
    this.generation++;this.unsubscribe?.();this.unsubscribe=null;
    const wasDsu=this.source==='DSU',device=this.device;this.device=null;this.source='';this.message='未连接陀螺仪';this.state.reset();
    if(wasDsu)try{await globalThis.motionBridge?.disconnect();}catch{}
    if(device){device.removeEventListener('inputreport',this.handler);try{if(device.opened)await device.close();}catch{}}
  }
}
