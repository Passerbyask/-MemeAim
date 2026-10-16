const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('motionBridge',{
  connect:options=>ipcRenderer.invoke('motion:connect',{port:options?.port,slot:options?.slot}),
  disconnect:()=>ipcRenderer.invoke('motion:disconnect'),
  onMotion:callback=>{const listener=(_event,sample)=>callback(sample);ipcRenderer.on('motion:sample',listener);return ()=>ipcRenderer.removeListener('motion:sample',listener);}
});
