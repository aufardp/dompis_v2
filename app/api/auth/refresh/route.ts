import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { verifyRefreshToken, signAccessToken } from '@/app/libs/auth';

export async function POST() {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get('refreshToken')?.value;

  if (!refreshToken)
    return NextResponse.json(
      { success: false, message: 'No refresh token' },
      { status: 401 },
    );

  try {
    const decoded: any = verifyRefreshToken(refreshToken);

    const newAccessToken = signAccessToken({
      id_user: decoded.id_user,
      role: decoded.role,
    });

    return NextResponse.json({
      success: true,
      accessToken: newAccessToken,
    });
  } catch {
    return NextResponse.json(
      { success: false, message: 'Invalid refresh token' },
      { status: 401 },
    );
  }
}
