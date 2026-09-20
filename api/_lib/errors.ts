export class UploadError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'UploadError';
  }
}

export function errorResponse(error: unknown): Response {
  if (error instanceof UploadError) {
    return Response.json({ error: error.message, code: error.code }, { status: error.status });
  }
  console.error('IPFS upload request failed', error instanceof Error ? error.name : 'UnknownError');
  return Response.json({ error: 'The upload service is temporarily unavailable.', code: 'UPLOAD_UNAVAILABLE' }, { status: 503 });
}
