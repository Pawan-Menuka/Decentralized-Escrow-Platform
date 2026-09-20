import { errorResponse, UploadError } from '../_lib/errors';
import { requestIp, requestLimiter } from '../_lib/limits';
import { processUpload } from '../_lib/upload';

export const maxDuration = 30;

function text(form: FormData, name: string): string {
  const value = form.get(name);
  if (typeof value !== 'string' || !value) throw new UploadError(400, 'INVALID_UPLOAD', `Missing ${name}.`);
  return value;
}

export async function POST(request: Request): Promise<Response> {
  try {
    const pinataJwt = process.env.PINATA_JWT;
    const challengeSecret = process.env.UPLOAD_CHALLENGE_SECRET;
    if (!pinataJwt || !challengeSecret) throw new Error('The upload service is not configured.');
    requestLimiter.check(`upload:${requestIp(request)}`, 10, 60_000);
    if (!request.headers.get('content-type')?.startsWith('multipart/form-data')) {
      throw new UploadError(415, 'INVALID_CONTENT_TYPE', 'Uploads must use multipart form data.');
    }
    let form: FormData;
    try { form = await request.formData(); }
    catch { throw new UploadError(400, 'INVALID_UPLOAD', 'The upload form could not be read.'); }
    const file = form.get('file');
    if (!(file instanceof File)) throw new UploadError(400, 'FILE_REQUIRED', 'Choose a file to upload.');
    const result = await processUpload({
      file,
      wallet: text(form, 'wallet'),
      digest: text(form, 'digest'),
      jobId: Number(text(form, 'jobId')),
      milestoneIndex: Number(text(form, 'milestoneIndex')),
      token: text(form, 'token'),
      signature: text(form, 'signature'),
    }, { pinataJwt, challengeSecret });
    return Response.json(result, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}
