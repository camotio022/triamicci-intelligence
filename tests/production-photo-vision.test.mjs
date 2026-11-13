import test from 'node:test';
import assert from 'node:assert/strict';
import {decodePhotoDataUrl,extractVisionText,MAX_PHOTO_BYTES} from '../server/production/photo-vision.js';
test('validates image signature rather than trusting MIME',()=>{
 const jpeg=Buffer.from([255,216,255,0,1,2]);
 assert.equal(decodePhotoDataUrl('data:image/jpeg;base64,'+jpeg.toString('base64')).mime,'image/jpeg');
 assert.throws(()=>decodePhotoDataUrl('data:image/jpeg;base64,'+Buffer.from('not a photo').toString('base64')),/INVALID_IMAGE/);
 assert.throws(()=>decodePhotoDataUrl('data:image/jpeg;base64,'+Buffer.alloc(MAX_PHOTO_BYTES+1).toString('base64')),/INVALID_IMAGE/);
});
test('extracts Portuguese handwriting lines and confidence without inventing items',()=>{
 const result=extractVisionText({responses:[{fullTextAnnotation:{text:'Batata purê\n30 alcatra\n40 frango\n',pages:[{blocks:[{paragraphs:[{words:[{confidence:.92},{confidence:.84}]}]}]}]}}]});
 assert.equal(result.text,'Batata purê\n30 alcatra\n40 frango');
 assert.equal(result.confidence,88);
 assert.deepEqual(extractVisionText({responses:[{}]}),{text:'',confidence:null});
 assert.throws(()=>extractVisionText({responses:[{error:{message:'quota'}}]}),/VISION_PROVIDER_FAILED/);
});
