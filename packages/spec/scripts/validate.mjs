import Ajv2020 from 'ajv/dist/2020.js';
import { parse } from 'yaml';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('..', import.meta.url));
const ajv = new Ajv2020({ allErrors: true, strict: true, strictTypes: false, strictRequired: false, allowUnionTypes: true });
const validate = ajv.compile(JSON.parse(readFileSync(join(dir, 'teststein.schema.json'), 'utf8')));
let failures = 0;
for (const [sub, expectValid] of [['examples', true], ['invalid-examples', false]]) {
  for (const f of readdirSync(join(dir, sub)).sort()) {
    const valid = validate(parse(readFileSync(join(dir, sub, f), 'utf8')));
    const good = valid === expectValid;
    if (!good) failures++;
    const why = valid ? '' : ' — ' + validate.errors.filter(e => !['if', 'oneOf'].includes(e.keyword))
      .map(e => `${e.instancePath || '/'} ${e.message}`).slice(0, 2).join('; ');
    console.log(`${good ? 'PASS' : 'FAIL'}  ${sub}/${f}: ${valid ? 'valid' : 'invalid'}${why}`);
  }
}
console.log(failures ? `${failures} unexpected` : 'all as expected');
process.exit(failures ? 1 : 0);
