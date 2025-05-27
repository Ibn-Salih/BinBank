import { NextRequest, NextResponse } from 'next/server';
import { handleMessage } from '@/services/botHandler';
import { logger } from '@/lib/logger';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    await handleMessage(body);
    return NextResponse.json({ status: 'ok' });
  } catch (error) {
    logger.error('Webhook error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 