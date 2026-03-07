import { NextRequest, NextResponse } from 'next/server';

type WindowEntry = {
  count: number;
  resetAt: number;
};

const MONTHLY_LIMIT = Number(process.env.MAP_PAGE_MONTHLY_LIMIT ?? '40000');
const IP_WINDOW_MS = Number(process.env.MAP_PAGE_IP_WINDOW_MS ?? '60000');
const IP_MAX_REQUESTS = Number(process.env.MAP_PAGE_IP_MAX_REQUESTS ?? '90');

const ipWindowStore = new Map<string, WindowEntry>();
let globalMonthKey = '';
let globalCount = 0;

function getClientIp(request: NextRequest) {
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]?.trim() || 'unknown';
  return request.headers.get('x-real-ip') || 'unknown';
}

function monthKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function middleware(request: NextRequest) {
  if (process.env.NODE_ENV !== 'production') {
    return NextResponse.next();
  }

  const now = Date.now();
  const nowDate = new Date(now);
  const key = monthKey(nowDate);

  if (globalMonthKey !== key) {
    globalMonthKey = key;
    globalCount = 0;
  }

  if (globalCount >= MONTHLY_LIMIT) {
    return new NextResponse('Map disabled: monthly view budget reached.', {
      status: 429,
      headers: {
        'cache-control': 'no-store',
      },
    });
  }

  const ip = getClientIp(request);
  const current = ipWindowStore.get(ip);
  if (!current || current.resetAt <= now) {
    ipWindowStore.set(ip, {
      count: 1,
      resetAt: now + IP_WINDOW_MS,
    });
  } else {
    if (current.count >= IP_MAX_REQUESTS) {
      const retryAfter = Math.ceil((current.resetAt - now) / 1000);
      return new NextResponse('Rate limit exceeded. Try again shortly.', {
        status: 429,
        headers: {
          'retry-after': String(Math.max(retryAfter, 1)),
          'cache-control': 'no-store',
        },
      });
    }
    current.count += 1;
    ipWindowStore.set(ip, current);
  }

  globalCount += 1;

  const response = NextResponse.next();
  response.headers.set('x-map-load-budget-used', String(globalCount));
  response.headers.set('x-map-load-budget-limit', String(MONTHLY_LIMIT));
  return response;
}

export const config = {
  matcher: ['/'],
};

