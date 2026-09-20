import { errorResponse, UploadError } from '../_lib/errors';
import { issueChallenge } from '../_lib/challenge';
import { requestIp, requestLimiter } from '../_lib/limits';

export const maxDuration = 10;

export function GET(request: Request): Response {
  try {
    const secret = process.env.UPLOAD_CHALLENGE_SECRET;
    if (!secret) throw new Error('UPLOAD_CHALLENGE_SECRET is not configured.');
    requestLimiter.check(`challenge:${requestIp(request)}`, 30, 60_000);
    const params = new URL(request.url).searchParams;
    const jobId = Number(params.get('jobId'));
    const milestoneIndex = Number(params.get('milestoneIndex'));
    const wallet = params.get('wallet');
    const digest = params.get('digest');
    if (!wallet || !digest) throw new UploadError(400, 'INVALID_CHALLENGE_REQUEST', 'Wallet and file digest are required.');
    return Response.json(issueChallenge({ wallet, digest, jobId, milestoneIndex }, secret), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
