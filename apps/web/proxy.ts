import { NextResponse, type NextRequest } from "next/server";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Authorization,Content-Type,x-admin-community-id,x-tour-client",
  "Access-Control-Max-Age": "86400",
};

export function proxy(request: NextRequest) {
  const isApiRequest = request.nextUrl.pathname.startsWith("/api/");

  if (isApiRequest && request.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(
    "x-tour-pathname",
    `${request.nextUrl.pathname}${request.nextUrl.search}`
  );

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
  if (isApiRequest) {
    for (const [name, value] of Object.entries(CORS_HEADERS)) {
      response.headers.set(name, value);
    }
  }
  return response;
}

export const config = {
  matcher: [
    "/api/:path*",
    "/((?!_next/static|_next/image|favicon.ico|images/|recordings/).*)",
  ],
};
