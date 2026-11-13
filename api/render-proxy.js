const forwardedHeaders = ['accept', 'content-type', 'cookie', 'origin', 'user-agent'];

export default {
  async fetch(request) {
    const path = new URL(request.url);
    const route = path.searchParams.get('path')?.replace(/\/$/, '');
    if (!route || !/^(?:auth\/[a-z-]+(?:\/[a-z-]+)?|builder(?:\/public)?(?:\/[a-f0-9-]{36})?)$/.test(route))
      return new Response(null, { status: 404 });

    const unavailable = () => Response.json(
      { error: { message: 'O serviço de contas está indisponível.' } },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
    try {
      const origin = new URL(process.env.FRONTEND_API_ORIGIN);
      if (origin.protocol !== 'https:' || origin.href !== origin.origin + '/') return unavailable();
      const target = new URL('/api/' + route, origin);
      path.searchParams.delete('path');
      target.search = path.search;

      const headers = new Headers();
      for (const name of forwardedHeaders) {
        if (request.headers.has(name)) headers.set(name, request.headers.get(name));
      }
      const upstream = await fetch(target, {
        method: request.method,
        headers,
        body: ['GET', 'HEAD'].includes(request.method) ? undefined : await request.arrayBuffer(),
        redirect: 'manual',
        signal: AbortSignal.timeout(25000),
      });
      const responseHeaders = new Headers({ 'Cache-Control': 'no-store' });
      for (const name of ['content-type', 'retry-after']) {
        if (upstream.headers.has(name)) responseHeaders.set(name, upstream.headers.get(name));
      }
      for (const cookie of upstream.headers.getSetCookie()) responseHeaders.append('Set-Cookie', cookie);
      return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
    } catch {
      return unavailable();
    }
  },
};
