import schedules from '../../server/workflows/schedules.js';
import mural from '../../server/workflows/mural.js';
import labels from '../../server/workflows/labels.js';
const handlers={schedules,mural,labels};
export default async function handler(req,res){
 const type=req.body?.module;
 if(!Object.prototype.hasOwnProperty.call(handlers,type))return res.status(400).json({message:'Módulo inválido.'});
 return handlers[type](req,res);
}
