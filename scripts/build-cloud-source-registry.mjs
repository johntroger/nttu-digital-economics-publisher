import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createSourceLibrary} from './source-library.mjs';
const library=createSourceLibrary(),owner=JSON.parse(readFileSync('content/samples-2026-v1.manifest.json','utf8')).registry['OWNER-2026'];
const registry=library.list().map(s=>{
  if(!s.available)throw new Error('Source unavailable: '+s.id);
  return {id:s.id,name:s.name,pages:s.pages,sha256:s.pdfUrl?createHash('sha256').update(library.pdf(s.id)).digest('hex'):owner.sha256,authority:s.authority};
});
if(registry.length!==14)throw new Error('Expected 13 PDFs and owner confirmation');
writeFileSync('src/cloud/source-registry.ts','// Metadata only. Rebuild deliberately after source revision review; no document bytes.\nexport interface SourceDefinition {id:string;name:string;pages:number;sha256:string;authority:string}\nexport const SOURCE_REGISTRY: readonly SourceDefinition[] = '+JSON.stringify(registry,null,2)+';\n');
console.log('Cloud source metadata pinned: 13 PDFs + OWNER-2026, no document bytes.');
