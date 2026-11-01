// Parse Wrangler's optional progress prefix without exposing provider output.
export function parseD1Output(output) {
 const match=output.match(/(?:^|\n)(\[\s*\{[\s\S]*\])\s*$/);
 if(!match)throw new Error('D1 did not return a JSON result');
 const data=JSON.parse(match[1]);
 if(!Array.isArray(data)||!data.length||data.some(r=>r.success!==true||!Array.isArray(r.results)))throw new Error('D1 import failed');
 return data.flatMap(r=>r.results);
}
