import { protectApi } from '@/app/libs/protectApi';

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
      { success: false, message: error.message },
      { status: 401 },
    );
  }
}
