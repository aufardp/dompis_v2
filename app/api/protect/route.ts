import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';

export async function GET() {
  try {
    const user = await protectApi(['admin', 'teknisi']);

    return Response.json({
      success: true,
      message: 'Protected API',
      user,
    });
  } catch (error: any) {
    return Response.json(
      { success: false, message: getErrorMessage(error, 'Unauthorized') },
      { status: getErrorStatus(error, 500) },
    );
  }
}
