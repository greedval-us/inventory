import { contextBridge, ipcRenderer } from 'electron';
import { createBridge } from '../shared/bridge.js';

contextBridge.exposeInMainWorld('inventory', createBridge(
  (channel, ...args) => ipcRenderer.invoke(channel, ...args),
));
