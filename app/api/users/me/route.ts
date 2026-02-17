import { NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import { getCurrentUser } from '@/app/libs/services/users.service';

export async function GET() {
  try {
    const decoded = await protectApi();
    const user = await getCurrentUser(decoded.id_user);

    if (!user) {
      return NextResponse.json(
        { success: false, message: 'User not found' },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data: user });
  } catch (error: unknown) {
    console.error(error);
    const message = error instanceof Error ? error.message : 'Unauthorized';
    return NextResponse.json({ success: false, message }, { status: 401 });
  }
}
