import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

// Deployment serves assets from /opt/artems-carbon/site.
// In a source checkout the same asset lives at repository root.
export function resolveLessonPhotoPath({
  override=process.env.EMAIL_LESSON_PHOTO_PATH,
  sitePath='/opt/artems-carbon/site/5.jpg',
  repositoryPath=fileURLToPath(new URL('../../5.jpg',import.meta.url))
}={}){
  return [override,sitePath,repositoryPath]
    .filter(Boolean)
    .find(path=>existsSync(path))??null;
}
